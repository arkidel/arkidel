// Renders the canonical Arkidel rune-glyph SVG to a 96×96 PNG with transparent
// background, using MIDNIGHT (#1B2A3F) as the resolved currentColor. Output is
// committed at src/assets/logo-arkidel.png and consumed by the PDF memo.
//
// Re-run with `node scripts/build-logo.js` if the icon changes.

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MIDNIGHT = "#1B2A3F";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="96" height="96">
  <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="${MIDNIGHT}" stroke-width="6" stroke-linejoin="round"/>
  <line x1="50" y1="22" x2="50" y2="78" stroke="${MIDNIGHT}" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="38" x2="72" y2="28" stroke="${MIDNIGHT}" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="62" x2="72" y2="72" stroke="${MIDNIGHT}" stroke-width="6" stroke-linecap="round"/>
  <path d="M 38 42 L 24 50 L 38 58 Z" fill="${MIDNIGHT}" stroke="${MIDNIGHT}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "assets", "logo-arkidel.png");

const pngBuffer = await sharp(Buffer.from(svg))
  .resize(96, 96)
  .png()
  .toBuffer();

await writeFile(outPath, pngBuffer);
console.log(`Wrote ${pngBuffer.length} bytes to ${outPath}`);
