// =============================================================================
// gen-favicons.mjs — regenerate the raster favicon fallbacks from the rune.
//
// Source of truth for the glyph is the Arkidel rune (see public/favicon.svg
// and src/components/Layout.jsx). This script does NOT redraw it — it embeds
// the same geometry with a fixed Midnight (#1B2A3F) fill on a transparent
// canvas, the right choice for single-colour fallbacks: it reads on light
// browser chrome (the common default) and degrades acceptably on dark chrome.
//
// Outputs (all into public/):
//   favicon.ico         — multi-size ICO (16/32/48), PNG-encoded entries
//   apple-touch-icon.png — 180x180
//
// The colour-adaptive version (Midnight on light / Parchment on dark) lives
// in public/favicon.svg, which modern browsers prefer. These rasters are the
// fallback path for older browsers and iOS home-screen.
//
// Run:  node scripts/gen-favicons.mjs
// =============================================================================

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Rune with a fixed Midnight fill, transparent background. Geometry is byte-
// for-byte the canonical rune; only `currentColor` is resolved to #1B2A3F.
const MIDNIGHT = "#1B2A3F";
// viewBox is trimmed to "5 5 90 90" (the box plus a hair of air) rather than the
// full 0..100 canvas, so the glyph fills more of the small raster sizes and the
// interior detail survives at 16px. Same geometry as the canonical rune — only
// the dead margin is cropped. public/favicon.svg uses the same viewBox.
const runeSvg = `<svg viewBox="5 5 90 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="${MIDNIGHT}" stroke-width="6" stroke-linejoin="round"/>
  <line x1="50" y1="22" x2="50" y2="78" stroke="${MIDNIGHT}" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="38" x2="72" y2="28" stroke="${MIDNIGHT}" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="62" x2="72" y2="72" stroke="${MIDNIGHT}" stroke-width="6" stroke-linecap="round"/>
  <path d="M 38 42 L 24 50 L 38 58 Z" fill="${MIDNIGHT}" stroke="${MIDNIGHT}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

function renderPng(size) {
  // density bumps the rasteriser resolution so small sizes stay crisp.
  return sharp(Buffer.from(runeSvg), { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// --- ICO assembly ----------------------------------------------------------
// ICO is a tiny container: a 6-byte header, one 16-byte directory entry per
// image, then the image payloads. Each payload here is a complete PNG, which
// every ICO-aware browser supports.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const payloads = [];
  let offset = 6 + images.length * 16;

  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 means 256)
    entry.writeUInt8(0, 2); // palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4);   // colour planes
    entry.writeUInt16LE(32, 6);  // bits per pixel
    entry.writeUInt32LE(data.length, 8); // payload size
    entry.writeUInt32LE(offset, 12);     // payload offset
    entries.push(entry);
    payloads.push(data);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...payloads]);
}

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({ size, data: await renderPng(size) }))
);
writeFileSync(join(PUBLIC_DIR, "favicon.ico"), buildIco(icoImages));
console.log(`favicon.ico written (${icoSizes.join(", ")} px)`);

const apple = await renderPng(180);
writeFileSync(join(PUBLIC_DIR, "apple-touch-icon.png"), apple);
console.log("apple-touch-icon.png written (180 px)");
