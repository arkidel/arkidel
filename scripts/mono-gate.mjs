// Regression guard for the mono PDF font.
//
// Renders a set of mono strings through the same pdf-lib pipeline memo-pdf.js
// uses, extracts them with pdfjs-dist, and asserts each string round-trips
// intact. Exits non-zero on any corruption.
//
// History: the standard JetBrainsMono-Regular.ttf was previously bundled
// here; pdf-lib's fontkit subsetter silently applied its GSUB ligature
// substitutions when embedding, which mangled plain text like `https://`
// (a `//` ligature trigger) and the colon in `Va. Code § 32.1-127.1:05`
// (a `1:0` ligature trigger) into mojibake glyphs. The bundled font was
// swapped to JetBrainsMonoNL-Regular.ttf (the No-Ligatures variant of the
// same family, same metrics, same glyph shapes — no GSUB ligatures) and
// the corruption cleared. Run this gate before any change to the mono
// font asset or to the embed/subset pipeline to confirm the class of bug
// stays fixed.
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MONO_PATH = path.join(ROOT, "src/assets/fonts/JetBrainsMonoNL-Regular.ttf");

// Strings chosen to cover the historic corruption modes: URL adjacencies
// (`://`, `//`), statutory-citation digit-colon combinations (`1:05`,
// `1:0`), the section-mark glyph, and lone suspect characters. If any of
// these stops round-tripping, the mono pipeline is regressed.
const TEST_STRINGS = [
  "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml",
  "https://law.lis.virginia.gov/vacode/title32.1/chapter5/section32.1-127.1:05/",
  "Va. Code § 32.1-127.1:05",
  "Cal. Civ. Code § 1798.82(d)",
  ": / // ://",
  "1:0 1:05 32.1-127.1:05",
];

async function main() {
  const monoBytes = await fs.readFile(MONO_PATH);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const mono = await pdf.embedFont(monoBytes);

  // One test string per page — keeps pdfjs text-content extraction
  // unambiguous (no reassembly across rows, no whitespace-item handling).
  for (const s of TEST_STRINGS) {
    const page = pdf.addPage([612, 792]);
    page.drawText(s, { x: 72, y: 740, size: 9, font: mono });
  }

  const bytes = await pdf.save();
  const outPath = "/tmp/mono-gate.pdf";
  await fs.writeFile(outPath, bytes);
  // pdfjs.getDocument transfers ownership of the buffer; record length now.
  const byteLen = bytes.length;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;

  let bad = 0;
  for (let i = 0; i < TEST_STRINGS.length; i++) {
    const expected = TEST_STRINGS[i];
    const p = await doc.getPage(i + 1);
    const tc = await p.getTextContent();
    // Concatenate items in x-order (preserves whitespace items if pdfjs emits any).
    const found = tc.items
      .slice()
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((it) => it.str)
      .join("");
    const ok = found === expected;
    if (!ok) bad++;
    console.log(`${ok ? "OK " : "BAD"}  expected ${JSON.stringify(expected)}`);
    if (!ok) console.log(`     got      ${JSON.stringify(found)}`);
  }

  console.log(`\n${bad === 0 ? "PASS — mono font round-trips cleanly" : `FAIL — ${bad} corrupted row(s)`}`);
  console.log(`Wrote ${outPath} (${byteLen} bytes) for visual inspection`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
