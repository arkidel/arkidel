// One-off gate: embed Merriweather + Inter via the same pdf-lib pipeline
// memo-pdf.js uses, render the same source URLs that appear in deadline
// cards, and dump both visible text (via pdfjs-dist) and the raw URI from
// the link annotation, so we can confirm whether the historic
// URL-corruption defect survives the Crimson-Text → Merriweather swap.
import { PDFDocument, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = "/Users/jamesdcormier/Library/CloudStorage/Dropbox/Coding/Arkidel";

const TEST_URLS = [
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679#d1e3185-1-1",
  "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.82.&lawCode=CIV",
  "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/security-data-protection/personal-data-breaches/",
];

async function main() {
  const serifRegBytes = await fs.readFile(path.join(ROOT, "src/assets/fonts/Merriweather-Regular.ttf"));
  const serifBoldBytes = await fs.readFile(path.join(ROOT, "src/assets/fonts/Merriweather-Bold.ttf"));
  const monoBytes = await fs.readFile(path.join(ROOT, "src/assets/fonts/JetBrainsMono-Regular.ttf"));
  const sansBytes = await fs.readFile(path.join(ROOT, "src/assets/fonts/Inter-Regular.ttf"));

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const serifReg = await pdf.embedFont(serifRegBytes);
  const serifBold = await pdf.embedFont(serifBoldBytes);
  const mono = await pdf.embedFont(monoBytes);
  const sans = await pdf.embedFont(sansBytes);

  const page = pdf.addPage([612, 792]);
  let y = 740;
  page.drawText("Arkidel", { x: 72, y, size: 22, font: serifReg, color: rgb(0.1, 0.16, 0.25) });
  y -= 40;
  page.drawText("Source URL encoding gate — Merriweather TTF", { x: 72, y, size: 14, font: serifBold });
  y -= 30;
  // Render each URL once in the mono face (matches memo-pdf.js url block) and once in serif body
  for (const url of TEST_URLS) {
    page.drawText("SOURCE", { x: 72, y, size: 8, font: sans, color: rgb(0.62, 0.68, 0.76) });
    y -= 14;
    page.drawText(url, { x: 72, y, size: 8, font: mono });
    y -= 14;
    page.drawText("(serif body) " + url, { x: 72, y, size: 11, font: serifReg });
    y -= 22;
    // also attach a Link annotation as memo-pdf.js does, to make sure the URI in the annot dict is intact
    const ctx = page.doc.context;
    const annot = ctx.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [72, y, 72 + 400, y + 30],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    const ref = ctx.register(annot);
    page.node.addAnnot(ref);
    y -= 20;
  }

  const bytes = await pdf.save();
  const outPath = "/tmp/url-gate.pdf";
  await fs.writeFile(outPath, bytes);
  console.log("Wrote", outPath, bytes.length, "bytes");

  // Extract text + link URIs using pdfjs-dist
  const pdfjs = await import(path.join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).catch(() => null);
  if (!pdfjs) {
    console.log("pdfjs-dist not installed; skipping extraction. Install with: npm i -D pdfjs-dist");
    return;
  }
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const p = await doc.getPage(1);
  const tc = await p.getTextContent();
  const items = tc.items.map((it) => it.str);
  const annots = await p.getAnnotations();
  console.log("=== Visible text items ===");
  for (const s of items) console.log(JSON.stringify(s));
  console.log("=== Link annotation URIs ===");
  for (const a of annots) if (a.url || a.unsafeUrl) console.log(JSON.stringify(a.url || a.unsafeUrl));
}

main().catch((e) => { console.error(e); process.exit(1); });
