// =============================================================================
// MEMO PDF GENERATOR — phase 2
//
// Builds the full Breach Notification Deadline Analysis as a paginated,
// letter-size PDF with embedded fonts (Source Serif Pro, Inter, JetBrains
// Mono). Page-break logic prevents cards from splitting across pages. Page
// numbers are computed in a final pass after all content is rendered.
//
// Sections:
//   1. Page-1 letterhead (Arkidel wordmark · date · centered title · rule)
//   2. Incident summary (compact metadata table)
//   3. Deadline obligations (one card per firing obligation)
//   4. Suppressed obligations (conditional — only if any suppressed)
//   5. Jurisdictional notes (conditional — only if any selected jur has notes)
//   6. Further considerations (six fixed bullets)
//   7. Disclaimer + privilege + generation footer block
// =============================================================================

import { PDFDocument, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { inflate } from "pako";
import { JURISDICTIONS } from "./data.js";

// Font URL imports — Vite returns URLs; we fetch at runtime for ArrayBuffers.
// Serif: Crimson Pro (Source Serif Pro had ligature/cmap issues through the
// WOFF→SFNT round-trip; Crimson Pro uses simpler GSUB tables and renders cleanly).
import serifRegularUrl from "@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff?url";
import serifBoldUrl from "@fontsource/crimson-pro/files/crimson-pro-latin-600-normal.woff?url";
import sansRegularUrl from "@fontsource/inter/files/inter-latin-400-normal.woff?url";
import sansBoldUrl from "@fontsource/inter/files/inter-latin-600-normal.woff?url";
import monoRegularUrl from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";

// ─── Brand colors as pdf-lib RGB ──────────────────────────────────────────
const MIDNIGHT = rgb(0.106, 0.165, 0.247);
const INK = rgb(0.173, 0.141, 0.094);
const MIST = rgb(0.624, 0.682, 0.761);
const MOSS = rgb(0.353, 0.431, 0.290);
const PARCHMENT = rgb(0.910, 0.867, 0.769);

// ─── Page geometry (points; 72pt = 1in) ───────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_X = MARGIN;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 468
const CONTENT_TOP = PAGE_H - MARGIN;   // 720
const CONTENT_BOTTOM = MARGIN;         // 72

// ─── WOFF1 → SFNT (TTF) decoder ───────────────────────────────────────────
//
// WOFF1 is a thin container around an SFNT/TTF font: a header, a table
// directory, and zlib-compressed table data. Repack as plain SFNT so that
// @pdf-lib/fontkit (which doesn't decompress WOFF) can parse it.
//
// Format reference: https://www.w3.org/TR/WOFF/
//
function woffToSfnt(woffBuffer) {
  const view = new DataView(woffBuffer);
  const sig = view.getUint32(0);
  if (sig !== 0x774f4646) throw new Error("Not a WOFF1 font (signature mismatch)");
  const flavor = view.getUint32(4);   // SFNT version (0x00010000 for TTF, 0x4F54544F for OTF)
  const numTables = view.getUint16(12);

  // Compute output size: SFNT header (12) + table directory (16 * numTables) + uncompressed table data (4-byte aligned)
  const dirEntries = [];
  let tableDataSize = 0;
  let dirOffset = 44; // start of WOFF table directory
  for (let i = 0; i < numTables; i++) {
    const tag = view.getUint32(dirOffset);
    const offset = view.getUint32(dirOffset + 4);
    const compLen = view.getUint32(dirOffset + 8);
    const origLen = view.getUint32(dirOffset + 12);
    const checksum = view.getUint32(dirOffset + 16);
    dirEntries.push({ tag, offset, compLen, origLen, checksum });
    tableDataSize += (origLen + 3) & ~3; // 4-byte aligned
    dirOffset += 20;
  }

  const sfntHeaderSize = 12;
  const sfntDirSize = 16 * numTables;
  const out = new Uint8Array(sfntHeaderSize + sfntDirSize + tableDataSize);
  const outView = new DataView(out.buffer);

  // SFNT header
  outView.setUint32(0, flavor);
  outView.setUint16(4, numTables);
  // searchRange / entrySelector / rangeShift — pdf-lib/fontkit tolerates exact values
  let entrySelector = 0;
  let searchRange = 1;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector += 1;
  }
  searchRange *= 16;
  outView.setUint16(6, searchRange);
  outView.setUint16(8, entrySelector);
  outView.setUint16(10, numTables * 16 - searchRange);

  // Table directory + table data
  let dataCursor = sfntHeaderSize + sfntDirSize;
  for (let i = 0; i < numTables; i++) {
    const e = dirEntries[i];
    // Table directory entry
    const dirEntryOffset = sfntHeaderSize + i * 16;
    outView.setUint32(dirEntryOffset, e.tag);
    outView.setUint32(dirEntryOffset + 4, e.checksum);
    outView.setUint32(dirEntryOffset + 8, dataCursor);
    outView.setUint32(dirEntryOffset + 12, e.origLen);

    // Table data — decompress if compLen != origLen
    const sourceBytes = new Uint8Array(woffBuffer, e.offset, e.compLen);
    let tableBytes;
    if (e.compLen === e.origLen) {
      tableBytes = sourceBytes;
    } else {
      tableBytes = inflate(sourceBytes);
      if (tableBytes.length !== e.origLen) {
        throw new Error(`Table size mismatch: tag=${e.tag.toString(16)} expected=${e.origLen} got=${tableBytes.length}`);
      }
    }
    out.set(tableBytes, dataCursor);
    dataCursor += (e.origLen + 3) & ~3; // pad to 4-byte boundary (zeros)
  }

  return out.buffer;
}

// ─── Font cache (one fetch per page-load lifetime) ────────────────────────
let _fontBytesCache = null;
async function loadFontBytes() {
  if (_fontBytesCache) return _fontBytesCache;
  const fetchAndDecode = async (url) => {
    const ab = await fetch(url).then((r) => r.arrayBuffer());
    return woffToSfnt(ab);
  };
  const [serifReg, serifBold, sansReg, sansBold, monoReg] = await Promise.all([
    fetchAndDecode(serifRegularUrl),
    fetchAndDecode(serifBoldUrl),
    fetchAndDecode(sansRegularUrl),
    fetchAndDecode(sansBoldUrl),
    fetchAndDecode(monoRegularUrl),
  ]);
  _fontBytesCache = { serifReg, serifBold, sansReg, sansBold, monoReg };
  return _fontBytesCache;
}

// ─── Type sizes ───────────────────────────────────────────────────────────
const SIZE = {
  title: 22,
  sectionHead: 14,
  body: 11,
  authority: 12,
  label: 8,
  citation: 9,
  url: 8,
  pageNum: 8,
  wordmark: 14,
  letterDate: 9,
  footerBlock: 9,
};

const LINE = 1.4; // body line-height multiplier

// ─── Text utilities ───────────────────────────────────────────────────────

function wrapText(text, font, size, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // If a single word exceeds maxWidth (long URL), force-break it
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            if (chunk) lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Convert a tracked-letter-spaced label string by inserting spaces between
// uppercase letters. pdf-lib doesn't expose letterSpacing, so we render
// labels in plain caps; tracking is approximated by font choice.
function upperLabel(s) {
  return String(s ?? "").toUpperCase();
}

// ─── Page state ───────────────────────────────────────────────────────────
//
// pages: array of { page, isFirst } in render order
// cursorY: current baseline-aware top position on the active page
// addPage(): pushes a new page, resets cursor to content top (with running header)
//
function makeState(pdfDoc, fonts) {
  const state = {
    pdfDoc,
    fonts,
    pages: [],
    cursorY: 0,
  };

  state.addPage = () => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const isFirst = state.pages.length === 0;
    state.pages.push({ page, isFirst });

    if (isFirst) {
      state.cursorY = CONTENT_TOP;
    } else {
      // Running header on pages 2+: right-aligned title text + rule
      const text = "Breach Notification Deadline Analysis";
      const w = fonts.sansReg.widthOfTextAtSize(text, SIZE.pageNum);
      page.drawText(text, {
        x: CONTENT_X + CONTENT_W - w,
        y: CONTENT_TOP - SIZE.pageNum,
        size: SIZE.pageNum,
        font: fonts.sansReg,
        color: MIST,
      });
      const ruleY = CONTENT_TOP - SIZE.pageNum - 10;
      page.drawLine({
        start: { x: CONTENT_X, y: ruleY },
        end: { x: CONTENT_X + CONTENT_W, y: ruleY },
        thickness: 0.75,
        color: MIST,
      });
      state.cursorY = ruleY - 22;
    }
    return page;
  };

  state.ensureRoom = (neededHeight) => {
    if (state.cursorY - neededHeight < CONTENT_BOTTOM) {
      state.addPage();
    }
  };

  state.currentPage = () => state.pages[state.pages.length - 1].page;

  return state;
}

// ─── Drawing primitives that advance cursor ───────────────────────────────

function drawTextLine(page, text, x, baselineY, font, size, color) {
  page.drawText(text, { x, y: baselineY, size, font, color });
}

function drawWrapped(page, text, x, topY, opts) {
  // Returns the new top-Y (below the last line)
  const { font, size, color, maxWidth, lineHeight = LINE } = opts;
  const lines = wrapText(text, font, size, maxWidth);
  const lh = size * lineHeight;
  let y = topY;
  for (const line of lines) {
    page.drawText(line, { x, y: y - size, size, font, color });
    y -= lh;
  }
  return y;
}

function measureWrapped(text, font, size, maxWidth, lineHeight = LINE) {
  const lines = wrapText(text, font, size, maxWidth);
  return lines.length * size * lineHeight;
}

// ─── Letterhead and incident summary ──────────────────────────────────────

function drawLetterhead(page, fonts, generatedAt) {
  // Wordmark on its own line, left-aligned, 14pt Inter Semibold MIDNIGHT
  const wordmarkBaselineY = CONTENT_TOP - SIZE.wordmark;
  drawTextLine(page, "Arkidel", CONTENT_X, wordmarkBaselineY, fonts.sansBold, SIZE.wordmark, MIDNIGHT);

  // Generation date one line below, left-aligned, 9pt MIST
  const dateBaselineY = wordmarkBaselineY - SIZE.letterDate * LINE - 2;
  const dateText = formatGeneratedAt(generatedAt);
  drawTextLine(page, dateText, CONTENT_X, dateBaselineY, fonts.sansReg, SIZE.letterDate, MIST);

  // Centered title below
  const titleY = dateBaselineY - 36 - SIZE.title;
  const title = "Breach Notification Deadline Analysis";
  const titleW = fonts.serifBold.widthOfTextAtSize(title, SIZE.title);
  drawTextLine(page, title, CONTENT_X + (CONTENT_W - titleW) / 2, titleY, fonts.serifBold, SIZE.title, MIDNIGHT);

  // Rule below
  const ruleY = titleY - 14;
  page.drawLine({
    start: { x: CONTENT_X, y: ruleY },
    end: { x: CONTENT_X + CONTENT_W, y: ruleY },
    thickness: 0.5,
    color: MIST,
  });

  // Priority 3b: 18pt extra space below the rule before next section
  return ruleY - 42;
}

function drawSectionHeading(page, fonts, text, topY) {
  const baselineY = topY - SIZE.sectionHead;
  drawTextLine(page, text, CONTENT_X, baselineY, fonts.serifBold, SIZE.sectionHead, MIDNIGHT);
  const ruleY = baselineY - 6;
  page.drawLine({
    start: { x: CONTENT_X, y: ruleY },
    end: { x: CONTENT_X + CONTENT_W, y: ruleY },
    thickness: 0.5,
    color: MIST,
  });
  return ruleY - 14;
}

function drawIncidentSummary(state, facts) {
  const { fonts } = state;
  const labelW = 108; // 1.5"
  const valueX = CONTENT_X + labelW;
  const valueMaxW = CONTENT_W - labelW;

  const rows = [
    ["Awareness", facts.awarenessDate ? formatAwareness(facts.awarenessDate) : "Not provided"],
    ["Jurisdictions", facts.jurisdictionList || "None selected"],
    ...(facts.sensitivityLabels && facts.sensitivityLabels.length
      ? [["Data categories", facts.sensitivityLabels.join(", ")]]
      : []),
    ["Encryption", facts.encryptionApplied
      ? "Reported as applied — see analysis below for which obligations are suppressed"
      : "Not reported"],
  ];

  // Section heading
  state.ensureRoom(SIZE.sectionHead + 30);
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Incident summary", state.cursorY);

  for (const [label, value] of rows) {
    const valueLines = wrapText(value, fonts.serifReg, SIZE.body, valueMaxW);
    const rowH = Math.max(SIZE.body * LINE, valueLines.length * SIZE.body * LINE) + 6;
    state.ensureRoom(rowH);
    const page = state.currentPage();

    // Label (Inter 8pt uppercase, MIST)
    drawTextLine(
      page,
      upperLabel(label),
      CONTENT_X,
      state.cursorY - SIZE.label,
      fonts.sansReg,
      SIZE.label,
      MIST
    );
    // Value (Source Serif 11pt INK)
    let y = state.cursorY;
    for (const line of valueLines) {
      page.drawText(line, { x: valueX, y: y - SIZE.body, size: SIZE.body, font: fonts.serifReg, color: INK });
      y -= SIZE.body * LINE;
    }
    state.cursorY = y - 4;
  }
  state.cursorY -= 8;
}

// ─── Card rendering (deadline / suppressed / note) ────────────────────────
//
// A card has a 3pt left border, 12pt left/right padding, 10pt top/bottom
// padding. Body wraps within (CONTENT_W - 12 - 12) = 444pt.
//
const CARD_PAD_X = 12;
const CARD_PAD_Y = 10;
const CARD_BORDER_W = 3;
const CARD_INNER_W = CONTENT_W - 2 * CARD_PAD_X;
const CARD_GAP = 12; // between cards
const SECTION_GAP_IN_CARD = 8;
const LABEL_TO_BODY_GAP = 4;

function measureCard(blocks, fonts) {
  let h = CARD_PAD_Y * 2;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (i > 0) h += SECTION_GAP_IN_CARD;
    h += measureBlock(b, fonts);
  }
  return h;
}

function measureBlock(b, fonts) {
  if (b.type === "topRow") {
    return SIZE.authority * LINE;
  }
  if (b.type === "label") {
    return SIZE.label * LINE;
  }
  if (b.type === "body") {
    return measureWrapped(b.text, fonts.serifReg, SIZE.body, CARD_INNER_W);
  }
  if (b.type === "labelBody") {
    return SIZE.label * LINE + LABEL_TO_BODY_GAP +
      measureWrapped(b.body, fonts.serifReg, SIZE.body, CARD_INNER_W);
  }
  if (b.type === "labelMono") {
    return SIZE.label * LINE + LABEL_TO_BODY_GAP +
      measureWrapped(b.body, fonts.monoReg, SIZE.citation, CARD_INNER_W);
  }
  if (b.type === "url") {
    return SIZE.label * LINE + LABEL_TO_BODY_GAP +
      measureWrapped(b.url, fonts.monoReg, SIZE.url, CARD_INNER_W);
  }
  if (b.type === "noteHeader") {
    // jurisdiction label + note title (semibold serif)
    return SIZE.label * LINE + LABEL_TO_BODY_GAP +
      measureWrapped(b.title, fonts.serifBold, SIZE.authority, CARD_INNER_W);
  }
  return 0;
}

function drawCard(page, blocks, topY, borderColor, fonts) {
  const cardTop = topY;
  const cardHeight = measureCard(blocks, fonts);
  const cardBottom = cardTop - cardHeight;

  // Border (left side, full card height)
  page.drawRectangle({
    x: CONTENT_X,
    y: cardBottom,
    width: CARD_BORDER_W,
    height: cardHeight,
    color: borderColor,
  });

  let y = cardTop - CARD_PAD_Y;
  const innerX = CONTENT_X + CARD_BORDER_W + CARD_PAD_X;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (i > 0) y -= SECTION_GAP_IN_CARD;

    if (b.type === "topRow") {
      // Authority left, deadline right
      drawTextLine(page, b.left, innerX, y - SIZE.authority, fonts.sansBold, SIZE.authority, MIDNIGHT);
      if (b.right) {
        const rW = fonts.sansReg.widthOfTextAtSize(b.right, SIZE.body);
        drawTextLine(
          page,
          b.right,
          CONTENT_X + CONTENT_W - CARD_PAD_X - rW,
          y - SIZE.authority + 1,
          fonts.sansReg,
          SIZE.body,
          INK
        );
      }
      y -= SIZE.authority * LINE;
    } else if (b.type === "labelBody") {
      drawTextLine(page, upperLabel(b.label), innerX, y - SIZE.label, fonts.sansReg, SIZE.label, MIST);
      y -= SIZE.label * LINE + LABEL_TO_BODY_GAP - 2;
      y = drawWrapped(page, b.body, innerX, y, {
        font: fonts.serifReg, size: SIZE.body, color: INK, maxWidth: CARD_INNER_W,
      });
      y += 2;
    } else if (b.type === "labelMono") {
      drawTextLine(page, upperLabel(b.label), innerX, y - SIZE.label, fonts.sansReg, SIZE.label, MIST);
      y -= SIZE.label * LINE + LABEL_TO_BODY_GAP - 2;
      y = drawWrapped(page, b.body, innerX, y, {
        font: fonts.monoReg, size: SIZE.citation, color: INK, maxWidth: CARD_INNER_W,
      });
      y += 2;
    } else if (b.type === "url") {
      drawTextLine(page, upperLabel(b.label), innerX, y - SIZE.label, fonts.sansReg, SIZE.label, MIST);
      y -= SIZE.label * LINE + LABEL_TO_BODY_GAP - 2;
      // Render URL lines, attach link annotation across the whole URL block
      const urlLines = wrapText(b.url, fonts.monoReg, SIZE.url, CARD_INNER_W);
      const lh = SIZE.url * LINE;
      const blockTop = y;
      for (const line of urlLines) {
        page.drawText(line, { x: innerX, y: y - SIZE.url, size: SIZE.url, font: fonts.monoReg, color: MIST });
        y -= lh;
      }
      // Link annotation
      attachLink(page, b.url, innerX, y, blockTop - y, CARD_INNER_W);
      y += 2;
    } else if (b.type === "body") {
      y = drawWrapped(page, b.text, innerX, y, {
        font: fonts.serifReg, size: SIZE.body, color: INK, maxWidth: CARD_INNER_W,
      });
    } else if (b.type === "noteHeader") {
      drawTextLine(page, upperLabel(b.label), innerX, y - SIZE.label, fonts.sansReg, SIZE.label, MIST);
      y -= SIZE.label * LINE + LABEL_TO_BODY_GAP - 2;
      y = drawWrapped(page, b.title, innerX, y, {
        font: fonts.serifBold, size: SIZE.authority, color: MIDNIGHT, maxWidth: CARD_INNER_W,
      });
    }
  }

  return cardBottom;
}

function attachLink(page, url, x, bottomY, height, width) {
  const ctx = page.doc.context;
  const annot = ctx.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, bottomY, x + width, bottomY + height],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });
  const ref = ctx.register(annot);
  page.node.addAnnot(ref);
}

// ─── Section: deadlines / suppressed / notes ──────────────────────────────

function deadlineBlocks(d) {
  return [
    { type: "topRow", left: `${d.jurisdiction} — ${d.authority}`, right: formatDeadline(d.deadline) },
    { type: "labelBody", label: "Basis", body: d.basis || "—" },
    ...(d.conditional ? [{ type: "labelBody", label: "Conditional", body: d.conditional }] : []),
    ...(d.source_url ? [{ type: "url", label: "Source", url: d.source_url }] : []),
  ];
}

function suppressedBlocks(s) {
  const mech = s.suppression_type === "breach_definition"
    ? "breach-definition exclusion"
    : "unintelligibility exemption";
  return [
    { type: "topRow", left: `${s.jurisdiction} — ${s.authority}` },
    ...(s.original_citation ? [{ type: "labelMono", label: "Original obligation", body: s.original_citation }] : []),
    ...(s.suppression_citation ? [{ type: "labelMono", label: "Suppressed by", body: `${s.suppression_citation} (${mech})` }] : []),
    ...(s.suppression_description ? [{ type: "body", text: s.suppression_description }] : []),
    ...(s.source_url ? [{ type: "url", label: "Source", url: s.source_url }] : []),
  ];
}

function noteBlocks(jurShort, note) {
  return [
    { type: "noteHeader", label: jurShort, title: note.title },
    ...(note.content ? [{ type: "body", text: note.content }] : []),
    ...(note.citation ? [{ type: "labelMono", label: "Citation", body: note.citation }] : []),
    ...(note.source_url ? [{ type: "url", label: "Source", url: note.source_url }] : []),
  ];
}

function drawCardSection(state, headingText, items, blocksFn, borderColor) {
  if (items.length === 0) return;
  const { fonts } = state;

  // Reserve room for heading PLUS first card so the heading is never orphaned
  // at the bottom of a page.
  const firstBlocks = blocksFn(items[0]);
  const firstCardHeight = measureCard(firstBlocks, fonts);
  const headingFootprint = SIZE.sectionHead + 30; // text + rule + gap below
  state.ensureRoom(headingFootprint + firstCardHeight);
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, headingText, state.cursorY);

  for (let i = 0; i < items.length; i++) {
    const blocks = i === 0 ? firstBlocks : blocksFn(items[i]);
    const h = i === 0 ? firstCardHeight : measureCard(blocks, fonts);
    state.ensureRoom(h);
    const page = state.currentPage();
    const cardBottom = drawCard(page, blocks, state.cursorY, borderColor, fonts);
    state.cursorY = cardBottom - CARD_GAP;
  }
  state.cursorY -= 8;
}

// ─── Further considerations (bullets) ─────────────────────────────────────

const FURTHER_CONSIDERATIONS = [
  "Sectoral regimes (HIPAA, GLBA, NYDFS Part 500, FTC Safeguards Rule, financial services regulators) may impose separate notification obligations not modeled in this preliminary analysis.",
  "Contractual notification duties owed to controllers, customers, business partners, insurers, or joint controllers may run on shorter timelines than statutory obligations and should be reviewed.",
  "Law-enforcement holds may permit delay of individual notification in some U.S. jurisdictions; any such request should be documented in writing from the requesting agency.",
  "Residents of U.S. states beyond those modeled here may also be affected. A 50-state analysis is recommended for any multi-state incident.",
  "The trigger for the GDPR / UK GDPR 72-hour clock is awareness — interpreted as a reasonable degree of certainty that a security incident has compromised personal data — not initial discovery or suspicion.",
  "Where the assessment that a breach is unlikely to result in a risk to data subjects is relied upon to avoid notification, that assessment should be documented contemporaneously under Art. 33(5) GDPR.",
];

function drawFurtherConsiderations(state) {
  const { fonts } = state;
  state.ensureRoom(SIZE.sectionHead + 30);
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Further considerations", state.cursorY);

  const bulletX = CONTENT_X;
  const bulletGap = 14;
  const textX = CONTENT_X + bulletGap;
  const textMaxW = CONTENT_W - bulletGap;

  for (const item of FURTHER_CONSIDERATIONS) {
    const lines = wrapText(item, fonts.serifReg, SIZE.body, textMaxW);
    const blockH = lines.length * SIZE.body * LINE + 6;
    // Bullets can break across pages (per spec) — but try to keep at least
    // the first line with the bullet character on the same page.
    state.ensureRoom(SIZE.body * LINE + 6);
    let page = state.currentPage();

    // Bullet character
    page.drawText("•", {
      x: bulletX,
      y: state.cursorY - SIZE.body,
      size: SIZE.body,
      font: fonts.serifReg,
      color: MIDNIGHT,
    });

    let y = state.cursorY;
    for (const line of lines) {
      // If next line doesn't fit, push a new page (continuation, no bullet)
      if (y - SIZE.body * LINE < CONTENT_BOTTOM) {
        state.cursorY = y;
        state.addPage();
        page = state.currentPage();
        y = state.cursorY;
      }
      page.drawText(line, { x: textX, y: y - SIZE.body, size: SIZE.body, font: fonts.serifReg, color: INK });
      y -= SIZE.body * LINE;
    }
    state.cursorY = y - 6;
  }
  state.cursorY -= 8;
}

// ─── Footer block (last page) ─────────────────────────────────────────────

function drawFooterBlock(state, generatedAt) {
  const { fonts } = state;
  // Need rule + 12pt + ~6 lines of 9pt at LINE-height + spacing
  const rough = 24 + 1 + 12 + 200;
  state.ensureRoom(rough);
  // Rule
  state.cursorY -= 12;
  const page = state.currentPage();
  page.drawLine({
    start: { x: CONTENT_X, y: state.cursorY },
    end: { x: CONTENT_X + CONTENT_W, y: state.cursorY },
    thickness: 0.5,
    color: MIST,
  });
  state.cursorY -= 16;

  const drawPara = (label, text) => {
    drawTextLine(state.currentPage(), upperLabel(label), CONTENT_X, state.cursorY - SIZE.label, fonts.sansReg, SIZE.label, MIST);
    state.cursorY -= SIZE.label * LINE + 2;
    state.cursorY = drawWrapped(state.currentPage(), text, CONTENT_X, state.cursorY, {
      font: fonts.sansReg, size: SIZE.footerBlock, color: MIST, maxWidth: CONTENT_W,
    });
    state.cursorY -= 10;
  };

  drawPara(
    "Disclaimer",
    "This document was generated by Arkidel Breach Clock based solely on the inputs provided. It constitutes a preliminary timeline triage and does not constitute legal advice. All conclusions must be confirmed with qualified counsel before any notification decision is made or omitted."
  );
  drawPara(
    "Privilege",
    "Prepared at the direction of counsel — attorney work product. Privilege and work product designations are suggested but depend on the circumstances of the engagement."
  );
  drawPara(
    "Generated",
    `${formatGeneratedAt(generatedAt)} · arkidel.com`
  );
}

// ─── Page numbers (final pass) ────────────────────────────────────────────

function drawPageNumbers(state) {
  const total = state.pages.length;
  state.pages.forEach(({ page }, i) => {
    const text = `Page ${i + 1} of ${total}`;
    const w = state.fonts.sansReg.widthOfTextAtSize(text, SIZE.pageNum);
    page.drawText(text, {
      x: (PAGE_W - w) / 2,
      y: MARGIN / 2,
      size: SIZE.pageNum,
      font: state.fonts.sansReg,
      color: MIST,
    });
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────

function formatGeneratedAt(d) {
  const dateOpts = { year: "numeric", month: "long", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  return `Generated ${d.toLocaleDateString("en-US", dateOpts)} ${d.toLocaleTimeString("en-US", timeOpts)}`;
}

function formatAwareness(d) {
  const dateOpts = { year: "numeric", month: "long", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  return `${d.toLocaleDateString("en-US", dateOpts)} at ${d.toLocaleTimeString("en-US", timeOpts)}`;
}

function formatDeadline(d) {
  if (!d) return "Without unreasonable delay";
  const dateOpts = { year: "numeric", month: "long", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  return `${d.toLocaleDateString("en-US", dateOpts)} at ${d.toLocaleTimeString("en-US", timeOpts)}`;
}

function buildJurisdictionList(facts) {
  const selected = JURISDICTIONS.filter((j) => facts.jurisdictions[j.id]);
  return selected.map((j) => {
    const c = facts.residentCounts?.[j.id];
    const n = parseInt(c, 10);
    const suffix = j.residentField && Number.isFinite(n) && n > 0 ? ` (${n.toLocaleString()})` : "";
    return `${j.short}${suffix}`;
  }).join(", ");
}

function collectJurisdictionalNotes(facts) {
  const out = [];
  for (const j of JURISDICTIONS) {
    if (!facts.jurisdictions[j.id]) continue;
    if (!j.counselNotes || j.counselNotes.length === 0) continue;
    for (const note of j.counselNotes) {
      out.push({ jurShort: j.short, note });
    }
  }
  return out;
}

// ─── Main entry point ─────────────────────────────────────────────────────

export async function generateMemoPdf(facts, deadlines, suppressed) {
  const generatedAt = new Date();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = await loadFontBytes();
  const fonts = {
    serifReg: await pdfDoc.embedFont(fontBytes.serifReg),
    serifBold: await pdfDoc.embedFont(fontBytes.serifBold),
    sansReg: await pdfDoc.embedFont(fontBytes.sansReg),
    sansBold: await pdfDoc.embedFont(fontBytes.sansBold),
    monoReg: await pdfDoc.embedFont(fontBytes.monoReg),
  };

  const state = makeState(pdfDoc, fonts);
  state.addPage();

  // Letterhead (page 1 only)
  state.cursorY = drawLetterhead(state.currentPage(), fonts, generatedAt);

  // Section: Incident summary
  drawIncidentSummary(state, {
    awarenessDate: facts.awarenessDate,
    jurisdictionList: buildJurisdictionList(facts),
    sensitivityLabels: facts.sensitivityLabels || [],
    encryptionApplied: facts.encryptionApplied,
  });

  // Section: Deadline obligations (always render heading even if empty array? — spec says "one card per firing obligation")
  if (deadlines && deadlines.length > 0) {
    drawCardSection(state, "Deadline obligations", deadlines, deadlineBlocks, MIDNIGHT);
  }

  // Section: Suppressed obligations (conditional)
  if (suppressed && suppressed.length > 0) {
    drawCardSection(state, "Notification suppressed by encryption", suppressed, suppressedBlocks, MOSS);
  }

  // Section: Jurisdictional notes (conditional)
  const jurNotes = collectJurisdictionalNotes(facts);
  if (jurNotes.length > 0) {
    drawCardSection(state, "Jurisdictional notes", jurNotes, ({ jurShort, note }) => noteBlocks(jurShort, note), PARCHMENT);
  }

  // Section: Further considerations
  drawFurtherConsiderations(state);

  // Footer block (last page)
  drawFooterBlock(state, generatedAt);

  // Final pass: page numbers
  drawPageNumbers(state);

  return await pdfDoc.save();
}
