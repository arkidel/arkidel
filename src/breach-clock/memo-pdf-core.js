// =============================================================================
// MEMO PDF CORE — pure render path
//
// All the layout, drawing primitives, formatters, and section builders that
// produce the Breach Notification Deadline Analysis PDF. No Vite-specific
// imports — this module is importable from Node so the render path can be
// exercised end-to-end outside the browser (see scripts/render-gate-memo.mjs).
//
// The browser entry (`generateMemoPdf` in memo-pdf.js) loads font + logo
// bytes via Vite `?url` imports and `fetch`, then calls `renderMemoPdfBytes`
// here. Node callers load bytes from disk and call the same function.
//
// Sections rendered:
//   1. Page-1 letterhead (Arkidel wordmark · date · centered title · rule)
//   2. Incident summary (compact metadata table)
//   3. Deadline obligations (one card per firing obligation)
//   4. Suppressed obligations (conditional — only if any suppressed)
//   5. Jurisdictional notes (conditional — only if any selected jur has notes)
//   6. Notification record (conditional — the Authority/Due/Notified table;
//      omitted when there are no recorded notifications)
//   7. Incident report (conditional — full mode only; fresh page)
//   8. Incident log (conditional — included entries only; omitted when none)
//   9. Further considerations (six fixed bullets)
//  10. Disclaimer + generation footer block
// =============================================================================

import { PDFDocument, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { JURISDICTIONS } from "./data.js";
import { groupResultsByJurisdiction } from "./results-grouping.js";

// ─── Brand colors as pdf-lib RGB ──────────────────────────────────────────
const MIDNIGHT = rgb(0.106, 0.165, 0.247);
const INK = rgb(0.173, 0.141, 0.094);
const MIST = rgb(0.624, 0.682, 0.761);
const MOSS = rgb(0.353, 0.431, 0.290);
const PARCHMENT = rgb(0.910, 0.867, 0.769);
// Ember (#C76E3A) — the memo's due-date color. Every due date the memo prints
// renders in Ember unconditionally (deadline cards AND the Notification
// Record table): it is the deadline color, not a warning, and must never vary
// with status or timing (durable decision).
const EMBER = rgb(0.780, 0.431, 0.227);

// ─── Page geometry (points; 72pt = 1in) ───────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_X = MARGIN;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 468
const CONTENT_TOP = PAGE_H - MARGIN;   // 720
const CONTENT_BOTTOM = MARGIN;         // 72

// ─── Type sizes ───────────────────────────────────────────────────────────

// Body text size — applies to incident-summary row values, card body blocks
// (deadline / suppressed), and the further-considerations bullets. Single
// point of adjustment for the memo's running body type.
const BODY_TEXT_SIZE = 10.5;

const SIZE = {
  title: 22,
  sectionHead: 14,
  body: BODY_TEXT_SIZE,
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
  return wrapTextTwoCol(text, font, size, maxWidth, maxWidth);
}

// Wrap with a (potentially different) first-line max width. Used by the
// card top row, where a right-aligned element (deadline timestamp) reserves
// space on line 1 only; lines 2+ have the full card-inner width.
function wrapTextTwoCol(text, font, size, firstLineMaxW, restMaxW) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const widthFor = () => (lines.length === 0 ? firstLineMaxW : restMaxW);
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= widthFor()) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // If a single word exceeds the available width (long URL or token),
      // force-break it. The threshold uses the now-current line position,
      // since lines.length may have just advanced.
      if (font.widthOfTextAtSize(word, size) > widthFor()) {
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > widthFor()) {
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

function upperLabel(s) {
  return String(s ?? "").toUpperCase();
}

// ─── Page state ───────────────────────────────────────────────────────────

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

function drawLetterhead(page, fonts, logoImage, generatedAt) {
  const ICON_SIZE = 24;
  const ICON_GAP = 8;
  const iconTop = CONTENT_TOP;
  const iconBottom = iconTop - ICON_SIZE;
  const iconCenterY = (iconTop + iconBottom) / 2;

  page.drawImage(logoImage, {
    x: CONTENT_X,
    y: iconBottom,
    width: ICON_SIZE,
    height: ICON_SIZE,
  });

  // Wordmark baseline so its visual center aligns with the icon center.
  // For Merriweather at 14pt, cap-height is roughly 0.66em.
  const wordmarkBaselineY = iconCenterY - SIZE.wordmark * 0.33;
  drawTextLine(
    page,
    "Arkidel",
    CONTENT_X + ICON_SIZE + ICON_GAP,
    wordmarkBaselineY,
    fonts.serifReg,
    SIZE.wordmark,
    MIDNIGHT
  );

  const dateBaselineY = iconBottom - SIZE.letterDate - 6;
  const dateText = formatGeneratedAt(generatedAt);
  drawTextLine(page, dateText, CONTENT_X, dateBaselineY, fonts.sansReg, SIZE.letterDate, MIST);

  const titleY = dateBaselineY - 36 - SIZE.title;
  const title = "Breach Notification Deadline Analysis";
  const titleW = fonts.serifBold.widthOfTextAtSize(title, SIZE.title);
  drawTextLine(page, title, CONTENT_X + (CONTENT_W - titleW) / 2, titleY, fonts.serifBold, SIZE.title, MIDNIGHT);

  const ruleY = titleY - 14;
  page.drawLine({
    start: { x: CONTENT_X, y: ruleY },
    end: { x: CONTENT_X + CONTENT_W, y: ruleY },
    thickness: 0.5,
    color: MIST,
  });

  return ruleY - 42;
}

// Keep-with-next: ensure a header plus the first line of the content that
// follows it both fit on the current page; otherwise break to a new page
// first, so a header never lands orphaned at the bottom of a page.
function keepHeaderWithNext(state, headerHeight, firstContentHeight) {
  if (state.cursorY - (headerHeight + firstContentHeight) < CONTENT_BOTTOM) {
    state.addPage();
  }
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

  // Lifecycle status renders for every status, first — the record states what
  // the matter was when the memo was cut. Omitted when the caller passes no
  // status (the four-arg gate harnesses predate the lifecycle).
  const statusLabel = { draft: "Draft", active: "Active", closed: "Closed" }[facts.status];

  const rows = [
    ...(statusLabel ? [["Status", statusLabel]] : []),
    ["Awareness", facts.awarenessDate ? formatAwareness(facts.awarenessDate) : "Not provided"],
    ["Jurisdictions", facts.jurisdictionList || "None selected"],
    ...(facts.sensitivityLabels && facts.sensitivityLabels.length
      ? [["Data categories", facts.sensitivityLabels.join(", ")]]
      : []),
    ["Encryption", facts.encryptionSummary || "Not reported"],
  ];

  // Keep-with-next: don't strand the heading without its first row.
  const firstRowH = rows.length
    ? Math.max(SIZE.body * LINE, wrapText(rows[0][1], fonts.sansReg, SIZE.body, valueMaxW).length * SIZE.body * LINE) + 6
    : 0;
  keepHeaderWithNext(state, SIZE.sectionHead + 20, firstRowH);
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Analysis Inputs", state.cursorY);

  for (const [label, value] of rows) {
    const valueLines = wrapText(value, fonts.sansReg, SIZE.body, valueMaxW);
    const rowH = Math.max(SIZE.body * LINE, valueLines.length * SIZE.body * LINE) + 6;
    state.ensureRoom(rowH);
    const page = state.currentPage();

    drawTextLine(
      page,
      upperLabel(label),
      CONTENT_X,
      state.cursorY - SIZE.label,
      fonts.sansReg,
      SIZE.label,
      MIST
    );
    let y = state.cursorY;
    for (const line of valueLines) {
      page.drawText(line, { x: valueX, y: y - SIZE.body, size: SIZE.body, font: fonts.sansReg, color: INK });
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
const CARD_GAP = 12;
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

// Right-edge gap between the heading text and the right-aligned timestamp
// on a card's top row. Keeps the two from kissing when the heading wraps
// near the boundary.
const TOPROW_RIGHT_GAP = 12;

function topRowLines(b, fonts) {
  let firstLineMaxW = CARD_INNER_W;
  if (b.right) {
    const rightW = fonts.sansReg.widthOfTextAtSize(b.right, SIZE.body);
    firstLineMaxW = Math.max(SIZE.authority, CARD_INNER_W - rightW - TOPROW_RIGHT_GAP);
  }
  const lines = wrapTextTwoCol(b.left, fonts.sansBold, SIZE.authority, firstLineMaxW, CARD_INNER_W);
  return lines.length === 0 ? [""] : lines;
}

function measureBlock(b, fonts) {
  if (b.type === "topRow") {
    return topRowLines(b, fonts).length * SIZE.authority * LINE;
  }
  if (b.type === "label") {
    return SIZE.label * LINE;
  }
  if (b.type === "body") {
    return measureWrapped(b.text, fonts.sansReg, SIZE.body, CARD_INNER_W);
  }
  if (b.type === "labelBody") {
    return SIZE.label * LINE + LABEL_TO_BODY_GAP +
      measureWrapped(b.body, fonts.sansReg, SIZE.body, CARD_INNER_W);
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
    const labelH = b.label ? SIZE.label * LINE + LABEL_TO_BODY_GAP : 0;
    return labelH + measureWrapped(b.title, fonts.serifBold, SIZE.authority, CARD_INNER_W);
  }
  return 0;
}

function drawCard(page, blocks, topY, borderColor, fonts) {
  const cardTop = topY;
  const cardHeight = measureCard(blocks, fonts);
  const cardBottom = cardTop - cardHeight;

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
      const lines = topRowLines(b, fonts);
      let lineY = y;
      for (const line of lines) {
        drawTextLine(page, line, innerX, lineY - SIZE.authority, fonts.sansBold, SIZE.authority, MIDNIGHT);
        lineY -= SIZE.authority * LINE;
      }
      if (b.right) {
        const rW = fonts.sansReg.widthOfTextAtSize(b.right, SIZE.body);
        drawTextLine(
          page,
          b.right,
          CONTENT_X + CONTENT_W - CARD_PAD_X - rW,
          y - SIZE.authority + 1,
          fonts.sansReg,
          SIZE.body,
          // Due dates render Ember unconditionally (see EMBER above).
          b.rightColor === "ember" ? EMBER : INK
        );
      }
      y -= lines.length * SIZE.authority * LINE;
    } else if (b.type === "labelBody") {
      drawTextLine(page, upperLabel(b.label), innerX, y - SIZE.label, fonts.sansReg, SIZE.label, MIST);
      y -= SIZE.label * LINE + LABEL_TO_BODY_GAP - 2;
      y = drawWrapped(page, b.body, innerX, y, {
        font: fonts.sansReg, size: SIZE.body, color: INK, maxWidth: CARD_INNER_W,
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
      const urlLines = wrapText(b.url, fonts.monoReg, SIZE.url, CARD_INNER_W);
      const lh = SIZE.url * LINE;
      const blockTop = y;
      for (const line of urlLines) {
        page.drawText(line, { x: innerX, y: y - SIZE.url, size: SIZE.url, font: fonts.monoReg, color: MIST });
        y -= lh;
      }
      attachLink(page, b.url, innerX, y, blockTop - y, CARD_INNER_W);
      y += 2;
    } else if (b.type === "body") {
      y = drawWrapped(page, b.text, innerX, y, {
        font: fonts.sansReg, size: SIZE.body, color: INK, maxWidth: CARD_INNER_W,
      });
    } else if (b.type === "noteHeader") {
      if (b.label) {
        drawTextLine(page, upperLabel(b.label), innerX, y - SIZE.label, fonts.sansReg, SIZE.label, MIST);
        y -= SIZE.label * LINE + LABEL_TO_BODY_GAP - 2;
      }
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
    { type: "topRow", left: d.authority, right: formatDeadline(d.deadline), rightColor: "ember" },
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
    // Jurisdiction is carried by the block heading / running header, so the
    // not-required card titles by authority alone (matching the screen).
    { type: "topRow", left: s.authority },
    ...(s.original_citation ? [{ type: "labelMono", label: "Original obligation", body: s.original_citation }] : []),
    ...(s.suppression_citation ? [{ type: "labelMono", label: "Suppressed by", body: `${s.suppression_citation} (${mech})` }] : []),
    ...(s.suppression_description ? [{ type: "body", text: s.suppression_description }] : []),
    ...(s.source_url ? [{ type: "url", label: "Source", url: s.source_url }] : []),
  ];
}

function reviewBlocks(r) {
  return [
    { type: "topRow", left: r.authority },
    ...(r.original_citation ? [{ type: "labelMono", label: "Obligation", body: r.original_citation }] : []),
    ...(r.review_citation ? [{ type: "labelMono", label: "Requires review under", body: r.review_citation }] : []),
    ...(r.review_reason ? [{ type: "body", text: r.review_reason }] : []),
    ...(r.source_url ? [{ type: "url", label: "Source", url: r.source_url }] : []),
  ];
}

// Note card content. The group eyebrow / per-note lead is drawn as a separate
// sub-label line above the card (drawSubLabel in the block plan), so the card
// header itself is label-less — just the note title, then body / citation / src.
function noteBlocks(note) {
  return [
    { type: "noteHeader", title: note.title },
    ...(note.content ? [{ type: "body", text: note.content }] : []),
    ...(note.citation ? [{ type: "labelMono", label: "Citation", body: note.citation }] : []),
    ...(note.source_url ? [{ type: "url", label: "Source", url: note.source_url }] : []),
  ];
}

// ─── Section: jurisdiction-first blocks ───────────────────────────────────
//
// Presentation grouping shared with the on-screen results page via
// results-grouping.js, so the two surfaces cannot drift: one block per
// jurisdiction. Counsel notes are PLACED (not bucketed): a caveat group at the
// block top, each parallel note right after its anchored (AG) card, and a
// sectoral group at the foot — the same order as the screen, rendered FLAT in
// the parchment register here (no lap; pdf-lib can't reproduce it). Card and
// note CONTENT is still built by the same per-item block-builders
// (deadlineBlocks / reviewBlocks / suppressedBlocks / noteBlocks) and drawn by
// the same drawCard.

// Obligation/suppressed group sub-labels (kept from the outcome-first layout);
// the parchment note groups carry the placement eyebrows below.
const REVIEW_LABEL = "Counsel review required";
const SUPPRESSED_LABEL = "Notification likely not required";
const CAVEAT_EYEBROW = "Pre-Notification Considerations";
const SECTORAL_EYEBROW = "Other Applicable Requirements";
const PARALLEL_LEAD = "Parallel AG obligation — may also apply";

// Heading advance for keep-with-next: section heading + rule (mirrors
// drawSectionHeading) + the statute-subtitle line.
const JUR_HEADING_H = SIZE.sectionHead + 6 + 14 + SIZE.citation * LINE + 4;
const SUBLABEL_H = SIZE.label * LINE + 6;

function drawJurisdictionHeading(state, name, statute) {
  const { fonts } = state;
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, name, state.cursorY);
  drawTextLine(state.currentPage(), statute, CONTENT_X, state.cursorY - SIZE.citation, fonts.monoReg, SIZE.citation, MIST);
  state.cursorY -= SIZE.citation * LINE + 4;
}

function drawSubLabel(state, text) {
  drawTextLine(state.currentPage(), upperLabel(text), CONTENT_X, state.cursorY - SIZE.label, state.fonts.sansReg, SIZE.label, MIST);
  state.cursorY -= SIZE.label * LINE + 6;
}

// Reprinted at the top of a continued page when a jurisdiction block spills over.
function drawContinuedHeader(state, name) {
  const { fonts } = state;
  drawTextLine(state.currentPage(), `${name} (continued)`, CONTENT_X, state.cursorY - SIZE.authority, fonts.serifBold, SIZE.authority, MIDNIGHT);
  const ruleY = state.cursorY - SIZE.authority - 6;
  state.currentPage().drawLine({ start: { x: CONTENT_X, y: ruleY }, end: { x: CONTENT_X + CONTENT_W, y: ruleY }, thickness: 0.5, color: MIST });
  state.cursorY = ruleY - 12;
}

// Ordered render plan for one block: { t: "label", text } | { t: "card", blocks, color }.
// Placement order mirrors the screen: caveat group → obligations (each followed
// by its parallel notes) → suppressed group → sectoral group → orphaned parallels.
function buildBlockPlan(block) {
  const plan = [];
  const label = (text) => plan.push({ t: "label", text });
  const card = (blocks, color) => plan.push({ t: "card", blocks, color });
  const noteCard = (entry) => card(noteBlocks(entry.note), PARCHMENT);

  if (block.caveatNotes.length) {
    label(CAVEAT_EYEBROW);
    block.caveatNotes.forEach(noteCard);
  }

  let reviewLabelled = false;
  for (const ob of block.obligations) {
    if (ob.role === "review" && !reviewLabelled) {
      label(REVIEW_LABEL);
      reviewLabelled = true;
    }
    card(
      ob.role === "active" ? deadlineBlocks(ob.card) : reviewBlocks(ob.card),
      ob.role === "active" ? MIDNIGHT : MIST
    );
    ob.parallelNotes.forEach((pn) => {
      label(PARALLEL_LEAD);
      noteCard(pn);
    });
  }

  if (block.suppressedCards.length) {
    label(SUPPRESSED_LABEL);
    block.suppressedCards.forEach((s) => card(suppressedBlocks(s), MOSS));
  }

  if (block.sectoralNotes.length) {
    label(SECTORAL_EYEBROW);
    block.sectoralNotes.forEach(noteCard);
  }
  block.footParallelNotes.forEach((pn) => {
    label(PARALLEL_LEAD);
    noteCard(pn);
  });

  return plan;
}

function planItemHeight(item, fonts) {
  return item.t === "label" ? SUBLABEL_H : measureCard(item.blocks, fonts);
}

function drawJurisdictionBlock(state, block) {
  const { fonts } = state;
  const plan = buildBlockPlan(block);
  if (plan.length === 0) return;

  // Keep the jurisdiction heading with its first plan item (a label, or the
  // whole first card — measureCard is the card's true height; cards draw
  // atomically). Same keep-with-next guard the rest of the memo uses.
  keepHeaderWithNext(state, JUR_HEADING_H, planItemHeight(plan[0], fonts));
  drawJurisdictionHeading(state, block.name, block.statuteSubtitle);

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const h = planItemHeight(item, fonts);
    const pagesBefore = state.pages.length;
    if (item.t === "label") {
      // Keep a label with the first item that follows it.
      const nextH = i + 1 < plan.length ? planItemHeight(plan[i + 1], fonts) : 0;
      keepHeaderWithNext(state, h, nextH);
    } else {
      state.ensureRoom(h);
    }
    // If that break detection added a page mid-block, reprint the running header.
    if (state.pages.length > pagesBefore) drawContinuedHeader(state, block.name);

    if (item.t === "label") {
      drawSubLabel(state, item.text);
    } else {
      const cardBottom = drawCard(state.currentPage(), item.blocks, state.cursorY, item.color, fonts);
      state.cursorY = cardBottom - CARD_GAP;
    }
  }
  state.cursorY -= 8;
}

// ─── Sections: notification record + incident log ─────────────────────────
//
// Both are built UI-side (the core renders exactly what it's given, matching
// the incidentReport pattern) and arrive together as one `notificationRecord`
// object, but they render as two separate sections in different places (JDC
// ruling 2026-07-24):
//   - "Notification Record" — the dates-only Authority / Due / Notified
//     table, one row per obligation with a recorded notification — renders
//     after the deadline analysis. Due dates Ember (the memo's unconditional
//     due-date color), notified dates Ink. No deltas, no status words — the
//     record is non-evaluative (durable decision). Omits itself when there
//     are no recorded notifications.
//   - "Incident Log" — the included log entries in the memo's label/value
//     idiom — renders AFTER the incident report section. Only entries the
//     caller passed render; the caller filters to include_in_memo silently —
//     no counts, no gaps, no indication that filtering exists. Omits itself
//     when there are no included entries.
// Both omission rules apply on closed incidents too.

const NOTIF_AUTH_W = 220; // authority column width (wraps)
const NOTIF_DUE_X = 240;  // due column x-offset from CONTENT_X
const NOTIF_NOTIF_X = 356; // notified column x-offset from CONTENT_X

function drawNotificationRecord(state, record) {
  const rows = record && Array.isArray(record.rows) ? record.rows : [];
  if (rows.length === 0) return;
  const { fonts } = state;

  const rowH = (r) =>
    Math.max(
      wrapText(r.authority, fonts.sansReg, SIZE.body, NOTIF_AUTH_W).length * SIZE.body * LINE,
      SIZE.body * LINE
    ) + 6;
  const headerRowH = SIZE.label * LINE + 8;

  // Keep the section heading with the column-label row plus the first table
  // row (mirroring their renderers below).
  keepHeaderWithNext(state, SIZE.sectionHead + 24, headerRowH + rowH(rows[0]));
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Notification Record", state.cursorY);

  state.ensureRoom(headerRowH + rowH(rows[0]));
  const headerPage = state.currentPage();
  drawTextLine(headerPage, "AUTHORITY", CONTENT_X, state.cursorY - SIZE.label, fonts.sansReg, SIZE.label, MIST);
  drawTextLine(headerPage, "DUE", CONTENT_X + NOTIF_DUE_X, state.cursorY - SIZE.label, fonts.sansReg, SIZE.label, MIST);
  drawTextLine(headerPage, "NOTIFIED", CONTENT_X + NOTIF_NOTIF_X, state.cursorY - SIZE.label, fonts.sansReg, SIZE.label, MIST);
  state.cursorY -= headerRowH;

  for (const r of rows) {
    state.ensureRoom(rowH(r));
    const page = state.currentPage();
    let y = state.cursorY;
    for (const line of wrapText(r.authority, fonts.sansReg, SIZE.body, NOTIF_AUTH_W)) {
      page.drawText(line, { x: CONTENT_X, y: y - SIZE.body, size: SIZE.body, font: fonts.sansReg, color: INK });
      y -= SIZE.body * LINE;
    }
    drawTextLine(page, r.dueText, CONTENT_X + NOTIF_DUE_X, state.cursorY - SIZE.body, fonts.sansReg, SIZE.body, EMBER);
    drawTextLine(page, r.notifiedText, CONTENT_X + NOTIF_NOTIF_X, state.cursorY - SIZE.body, fonts.sansReg, SIZE.body, INK);
    state.cursorY = Math.min(y, state.cursorY - SIZE.body * LINE) - 6;
  }
  state.cursorY -= 16;
}

function drawIncidentLog(state, record) {
  const entries = record && Array.isArray(record.entries) ? record.entries : [];
  if (entries.length === 0) return;
  const { fonts } = state;

  const entryH = (e) =>
    SIZE.label * LINE + LABEL_TO_BODY_GAP +
    measureWrapped(e.value, fonts.sansReg, SIZE.body, CONTENT_W) + 10;

  // Keep the section heading with the whole of its first entry (mirroring the
  // entry renderer below) — same uniform keep-with-next guard as the rest.
  keepHeaderWithNext(state, SIZE.sectionHead + 24, entryH(entries[0]));
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Incident Log", state.cursorY);

  for (const e of entries) {
    state.ensureRoom(entryH(e));
    drawTextLine(state.currentPage(), upperLabel(e.label), CONTENT_X, state.cursorY - SIZE.label, fonts.sansReg, SIZE.label, MIST);
    state.cursorY -= SIZE.label * LINE + 2;
    state.cursorY = drawWrapped(state.currentPage(), e.value, CONTENT_X, state.cursorY, {
      font: fonts.sansReg, size: SIZE.body, color: INK, maxWidth: CONTENT_W,
    });
    state.cursorY -= 10;
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
  // Keep the heading with the first bullet's first line — mirror the per-bullet
  // renderer's own reservation (SIZE.body * LINE + 6) so the header can't land
  // at a page foot with the whole list pushed to the next page.
  keepHeaderWithNext(state, SIZE.sectionHead + 24, SIZE.body * LINE + 6);
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Further Considerations", state.cursorY);

  const bulletX = CONTENT_X;
  const bulletGap = 14;
  const textX = CONTENT_X + bulletGap;
  const textMaxW = CONTENT_W - bulletGap;

  for (const item of FURTHER_CONSIDERATIONS) {
    const lines = wrapText(item, fonts.sansReg, SIZE.body, textMaxW);
    state.ensureRoom(SIZE.body * LINE + 6);
    let page = state.currentPage();

    page.drawText("•", {
      x: bulletX,
      y: state.cursorY - SIZE.body,
      size: SIZE.body,
      font: fonts.sansReg,
      color: MIDNIGHT,
    });

    let y = state.cursorY;
    for (const line of lines) {
      if (y - SIZE.body * LINE < CONTENT_BOTTOM) {
        state.cursorY = y;
        state.addPage();
        page = state.currentPage();
        y = state.cursorY;
      }
      page.drawText(line, { x: textX, y: y - SIZE.body, size: SIZE.body, font: fonts.sansReg, color: INK });
      y -= SIZE.body * LINE;
    }
    state.cursorY = y - 6;
  }
  state.cursorY -= 8;
}

// ─── Footer block (last page) ─────────────────────────────────────────────

function drawFooterBlock(state, generatedAt) {
  const { fonts } = state;
  const rough = 24 + 1 + 12 + 200;
  state.ensureRoom(rough);
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
    "This document was generated by Arkidel Respond based solely on the inputs provided. Use of Arkidel does not constitute legal advice, does not create an attorney-client relationship, and this memo is not attorney work product. It constitutes a preliminary timeline triage only. All conclusions must be confirmed with qualified counsel before any notification decision is made or omitted."
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

// Single composition point for the deadline right slot: both branches carry
// the inline "Due " label, so when the queued statutory-phrase repair lands
// the phrase swaps under the prefix (JDC 2026-07-25). The Notification Record
// table builds its own dueText and must never gain this prefix — its DUE
// column header already labels it.
function formatDeadline(d) {
  if (!d) return "Due without unreasonable delay";
  const dateOpts = { year: "numeric", month: "long", day: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  return `Due ${d.toLocaleDateString("en-US", dateOpts)} at ${d.toLocaleTimeString("en-US", timeOpts)}`;
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

// ─── Section: incident report (record fields) ─────────────────────────────
//
// Renders the unified-form record fields (general info, discovery, occurrence,
// summary, data-subject categories, measures) as an ordered list of group
// sub-headings and stacked label/value fields. The structure is built UI-side
// and arrives as facts.incidentReport — an array of { type: "group", title } and
// { type: "field", label, value, multiline } entries — so all field labels and
// option text live in the component, not here. Only populated fields are passed
// in; "information not available" groups are dropped before this runs.
//
// Quick mode passes no incidentReport, so the memo is the deadline analysis
// alone; full mode includes this section after the analysis and before the
// further-considerations bullets.
function drawIncidentReport(state, sections) {
  if (!sections || sections.length === 0) return;
  const { fonts } = state;

  // Full rendered height of a field block — mirrors drawField exactly (label
  // line + every wrapped value line + the 10pt bottom pad). Used for
  // keep-with-next sizing so a header is reserved together with the WHOLE of
  // its first field; reserving only the first line would let drawField's own
  // ensureRoom break the page right after the header and orphan it.
  const fieldHeight = (entry) => {
    if (!entry || entry.type !== "field") return 0;
    const paras = entry.multiline
      ? String(entry.value).split(/\n+/).map((s) => s.trim()).filter(Boolean)
      : [String(entry.value).trim()];
    if (paras.length === 0) return 0;
    let h = SIZE.label * LINE + LABEL_TO_BODY_GAP;
    paras.forEach((p, i) => {
      if (i > 0) h += 4;
      h += measureWrapped(p, fonts.sansReg, SIZE.body, CONTENT_W);
    });
    return h + 10;
  };
  const groupH = SIZE.authority * LINE + 12;

  // Section heading kept with the first group heading + that group's first field.
  const firstGroup = sections.find((e) => e.type === "group");
  const firstFieldAfterGroup = (() => {
    const gi = sections.indexOf(firstGroup);
    for (let i = gi + 1; i < sections.length; i++) {
      if (sections[i].type === "field") return sections[i];
      if (sections[i].type === "group") break;
    }
    return null;
  })();
  keepHeaderWithNext(state, SIZE.sectionHead + 24, (firstGroup ? groupH : 0) + fieldHeight(firstFieldAfterGroup));
  state.cursorY = drawSectionHeading(state.currentPage(), fonts, "Incident Report", state.cursorY);

  const drawGroup = (title) => {
    state.cursorY -= 6;
    drawTextLine(state.currentPage(), title, CONTENT_X, state.cursorY - SIZE.authority, fonts.serifBold, SIZE.authority, MIDNIGHT);
    state.cursorY -= SIZE.authority * LINE + 6;
  };

  const drawField = (label, value, multiline) => {
    const paras = multiline
      ? String(value).split(/\n+/).map((s) => s.trim()).filter(Boolean)
      : [String(value).trim()];
    if (paras.length === 0) return;
    let h = SIZE.label * LINE + LABEL_TO_BODY_GAP;
    paras.forEach((p, i) => {
      if (i > 0) h += 4;
      h += measureWrapped(p, fonts.sansReg, SIZE.body, CONTENT_W);
    });
    h += 10;
    state.ensureRoom(h);
    drawTextLine(state.currentPage(), upperLabel(label), CONTENT_X, state.cursorY - SIZE.label, fonts.sansReg, SIZE.label, MIST);
    state.cursorY -= SIZE.label * LINE + 2;
    paras.forEach((p, i) => {
      if (i > 0) state.cursorY -= 4;
      state.cursorY = drawWrapped(state.currentPage(), p, CONTENT_X, state.cursorY, {
        font: fonts.sansReg, size: SIZE.body, color: INK, maxWidth: CONTENT_W,
      });
    });
    state.cursorY -= 10;
  };

  for (let i = 0; i < sections.length; i++) {
    const entry = sections[i];
    if (entry.type === "group") {
      // Keep the group heading with the whole of its first field — this covers
      // every group in the report, including each repeated "Data Subjects — …"
      // category header in the Q2 repeater, not just the first group.
      const next = sections[i + 1];
      keepHeaderWithNext(state, groupH, fieldHeight(next));
      drawGroup(entry.title);
    } else if (entry.type === "field") {
      drawField(entry.label, entry.value, entry.multiline);
    }
  }
  state.cursorY -= 8;
}

// ─── Main entry point ─────────────────────────────────────────────────────
//
// renderMemoPdfBytes(facts, deadlines, suppressed, { fontBytes, logoBytes, generatedAt }, review)
//
// fontBytes:  { serifReg, serifBold, sansReg, sansBold, monoReg } — each an ArrayBuffer / Uint8Array
// logoBytes:  ArrayBuffer / Uint8Array — the rune-glyph PNG
// generatedAt: Date — when the memo was generated; affects letterhead + footer
// review:     Array — obligations requiring counsel review (Stage 2 quad-state
//             bucket). Trailing param with an empty-array default so existing
//             four-arg callers (the gate harnesses) keep working untouched. Empty
//             until Stage 4 routes the MA second-trigger here, so its section
//             omits itself.
// notificationRecord: { rows, entries } | null — content for TWO sections,
//             built UI-side: `rows` feeds the "Notification Record" table
//             (after the deadline analysis) and `entries` feeds the
//             "Incident Log" section (after the incident report). Passed as
//             its own trailing param, never inside facts — notification data
//             must not mix with the engine-facing shape. Each section omits
//             itself independently when its half is empty.
//
// Returns: Uint8Array — the serialized PDF bytes
//
export async function renderMemoPdfBytes(facts, deadlines, suppressed, { fontBytes, logoBytes, generatedAt }, review = [], notificationRecord = null) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fonts = {
    serifReg: await pdfDoc.embedFont(fontBytes.serifReg),
    serifBold: await pdfDoc.embedFont(fontBytes.serifBold),
    sansReg: await pdfDoc.embedFont(fontBytes.sansReg),
    sansBold: await pdfDoc.embedFont(fontBytes.sansBold),
    monoReg: await pdfDoc.embedFont(fontBytes.monoReg),
  };

  const logoImage = await pdfDoc.embedPng(logoBytes);

  const state = makeState(pdfDoc, fonts);
  state.addPage();

  state.cursorY = drawLetterhead(state.currentPage(), fonts, logoImage, generatedAt);

  drawIncidentSummary(state, {
    status: facts.status,
    awarenessDate: facts.awarenessDate,
    jurisdictionList: buildJurisdictionList(facts),
    sensitivityLabels: facts.sensitivityLabels || [],
    encryptionSummary: facts.encryptionSummary,
  });

  // Jurisdiction-first grouping (shared with the on-screen results page via
  // results-grouping.js so the two surfaces can't drift). One block per
  // jurisdiction holding its active / counsel-review / suppressed cards and
  // counsel notes. `pending` is not passed to the memo, so — as before — it
  // does not appear here.
  const groups = groupResultsByJurisdiction({
    deadlines: deadlines || [],
    suppressed: suppressed || [],
    review: review || [],
    jurisdictions: facts.jurisdictions || {},
  });
  for (const block of groups) {
    drawJurisdictionBlock(state, block);
  }

  // Notification Record (the Authority/Due/Notified table) — after the
  // deadline analysis. Omits itself when there are no recorded notifications.
  drawNotificationRecord(state, notificationRecord);

  if (facts.incidentReport && facts.incidentReport.length > 0) {
    // The incident report is a distinct artifact appended to the analysis —
    // always start it on a fresh page.
    state.addPage();
    drawIncidentReport(state, facts.incidentReport);
  }

  // Incident Log — after the incident report (JDC ruling 2026-07-24; quick
  // mode has no incident report, so the log follows the Notification Record
  // table directly). Omits itself when there are no included entries.
  drawIncidentLog(state, notificationRecord);

  drawFurtherConsiderations(state);
  drawFooterBlock(state, generatedAt);
  drawPageNumbers(state);

  return await pdfDoc.save();
}
