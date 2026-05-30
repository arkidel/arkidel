// =============================================================================
// gen-favicons.mjs — regenerate raster brand assets from the canonical rune.
//
// This script produces TWO families of output from one shared rune geometry:
//
//   1. Favicons (into public/) — runtime assets the site references.
//      - favicon.ico          multi-size ICO (16/32/48), PNG-encoded entries
//      - apple-touch-icon.png  180x180
//
//   2. SaaS-upload brand assets (into outputs/brand-assets/) — NOT runtime
//      assets. These are for manual upload to third-party tools (Google
//      Workspace org logo, Buttondown email header, etc.). They live outside
//      public/ on purpose: public/ is copied into dist/ at build and would
//      publish them on arkidel.com, which is not their job.
//      - arkidel-square-512.png      512x512, rune alone, centered
//      - arkidel-horizontal-600.png  600x200, rune + "Arkidel" wordmark
//
// Source of truth for the glyph is the Arkidel rune (see public/favicon.svg
// and src/components/Layout.jsx). This script does NOT redraw it.
//
// The two output families use DIFFERENT colour regimes on purpose:
//
//   - Favicons embed the rune in Midnight (#1B2A3F) on a TRANSPARENT canvas.
//     That follows CLAUDE.md's "logo colour follows surface" rule: on the
//     browser chrome / home-screen surfaces we don't control, a single-colour
//     Midnight mark reads on the common light default and degrades acceptably
//     on dark.
//
//   - Brand assets are the signature header look — Parchment (#E8DDC4) rune
//     on a solid Midnight PANEL that fills the whole canvas. For third-party
//     SaaS uploads we don't control the surrounding surface, so the mark
//     carries its own visual context rather than relying on the host's
//     background. This is a deliberate departure from "colour follows
//     surface": the panel IS the surface.
//
// The wordmark in the horizontal asset is NOT set with a system font. It is
// converted to vector glyph outlines read directly from the embedded
// Merriweather TTF (src/assets/fonts/Merriweather-Regular.ttf, the same file
// the PDF memo embeds) via fontkit, then those paths are baked into the SVG.
// No font resolution happens at raster time, so the wordmark is guaranteed to
// be Merriweather — never a fallback — and stays crisp at any size.
//
// The colour-adaptive favicon (Midnight on light / Parchment on dark) lives
// in public/favicon.svg, which modern browsers prefer. The rasters here are
// the fallback path for older browsers and iOS home-screen.
//
// Run:  node scripts/gen-favicons.mjs
// =============================================================================

import sharp from "sharp";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const BRAND_DIR = join(ROOT, "outputs", "brand-assets");

const MIDNIGHT = "#1B2A3F";
const PARCHMENT = "#E8DDC4";

// --- Shared rune geometry --------------------------------------------------
// Byte-for-byte the canonical rune; only `currentColor` is resolved to
// Midnight. Returned as the inner elements so the same drawing can be dropped
// into a standalone <svg> (favicons / square asset) or a nested <svg> (the
// rune slot of the horizontal asset).
function runeElements(color = MIDNIGHT) {
  return `
  <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>
  <line x1="50" y1="22" x2="50" y2="78" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="38" x2="72" y2="28" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="62" x2="72" y2="72" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
  <path d="M 38 42 L 24 50 L 38 58 Z" fill="${color}" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// viewBox is trimmed to "5 5 90 90" (the box plus a hair of air) rather than
// the full 0..100 canvas, so the glyph fills more of the raster and interior
// detail survives at small sizes. Same geometry as the canonical rune — only
// the dead margin is cropped. public/favicon.svg uses the same viewBox, and
// the horizontal asset's rune slot reuses it too, so every raster matches the
// site's rune exactly.
const RUNE_VIEWBOX = "5 5 90 90";
const runeSvg = `<svg viewBox="${RUNE_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">${runeElements()}</svg>`;

// The brand assets use the CANONICAL 0..100 viewBox instead — the full
// geometry with its built-in 10% margin. These render large (512 / 600 px)
// with plenty of canvas, so the canonical padding is the right call; the
// favicon tightening above exists only because 16x16 has no pixels to spare.
// At this viewBox the visible rune box (the rect at 10..90) is 80% of the
// rendered viewBox dimension — the 10% margin sits on each side.
const CANONICAL_VIEWBOX = "0 0 100 100";

// --- Merriweather wordmark, vectorised -------------------------------------
// Lay out "Arkidel" with fontkit and convert each glyph to an SVG path in the
// destination canvas's pixel space. Glyph outlines come out in font units with
// Y pointing up (font convention); the per-glyph transform flips Y and scales
// to the target font size, placing the baseline at `baselineY`.
const merriweather = fontkit.create(
  readFileSync(join(ROOT, "src", "assets", "fonts", "Merriweather-Regular.ttf"))
);

function wordmarkPaths({ text, fontSize, originX, baselineY, letterSpacing, color = MIDNIGHT }) {
  const scale = fontSize / merriweather.unitsPerEm;
  const run = merriweather.layout(text);
  let penX = originX;
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  let inkTop = Infinity;
  let inkBottom = -Infinity;
  const paths = [];

  run.glyphs.forEach((glyph, i) => {
    const d = glyph.path.toSVG();
    if (d) {
      paths.push(
        `<path d="${d}" fill="${color}" transform="translate(${penX} ${baselineY}) scale(${scale} ${-scale})"/>`
      );
      // Track the inked bounding box (in canvas px) for centring. Glyph bbox is
      // in font units with Y up; convert to canvas space (Y down, flipped).
      const b = glyph.bbox;
      inkLeft = Math.min(inkLeft, penX + b.minX * scale);
      inkRight = Math.max(inkRight, penX + b.maxX * scale);
      inkTop = Math.min(inkTop, baselineY - b.maxY * scale);
      inkBottom = Math.max(inkBottom, baselineY - b.minY * scale);
    }
    penX += run.positions[i].xAdvance * scale + letterSpacing;
  });

  return { svg: paths.join("\n  "), inkLeft, inkRight, inkTop, inkBottom };
}

// --- Raster helpers --------------------------------------------------------
// Supersample by rendering the SVG at SS× the target then downscaling, so
// strokes and glyph curves come out cleanly anti-aliased.
const SS = 3;

function renderRune(size) {
  // Square rune render. density bumps the rasteriser resolution so small sizes
  // (favicons) stay crisp; the contain-fit keeps the transparent background.
  return sharp(Buffer.from(runeSvg), { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function rasterize(svg, width, height) {
  // SVG carries an explicit width/height of SS× the target so librsvg renders
  // at supersampled resolution regardless of DPI; then resize to exact target.
  return sharp(Buffer.from(svg))
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

// --- 1. Favicons (public/) -------------------------------------------------
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
  icoSizes.map(async (size) => ({ size, data: await renderRune(size) }))
);
writeFileSync(join(PUBLIC_DIR, "favicon.ico"), buildIco(icoImages));
console.log(`favicon.ico written (${icoSizes.join(", ")} px)`);

const apple = await renderRune(180);
writeFileSync(join(PUBLIC_DIR, "apple-touch-icon.png"), apple);
console.log("apple-touch-icon.png written (180 px)");

// --- 2. SaaS-upload brand assets (outputs/brand-assets/) -------------------
// Signature header look: Parchment rune (+ wordmark) on a solid Midnight panel
// that fills the whole canvas. Self-contained marks for third-party uploads.
mkdirSync(BRAND_DIR, { recursive: true });

// arkidel-square-512.png — rune alone, centred, Parchment on a Midnight panel.
// For square-frame contexts (e.g. the Google Workspace organisation logo).
//
// Sizing: the visible rune box (the rect at 10..90) is sized to 56% of the
// canvas — a contained mark, not an edge-to-edge icon. Because the canonical
// viewBox carries a 10% margin, the visible box is 80% of the rendered viewBox
// dimension, so a 56% (287px) box means rendering the 100-unit viewBox at
// 287 / 0.8 = 359px, leaving ~112px (22%) of clear Midnight on every side.
const SQUARE = 512;
const SQUARE_BOX_RATIO = 0.56;                       // visible box / canvas
const squareRuneRender = (SQUARE * SQUARE_BOX_RATIO) / 0.8; // viewBox render px
const squareRuneXY = (SQUARE - squareRuneRender) / 2;       // centre it
const squareSvg = `<svg width="${SQUARE * SS}" height="${SQUARE * SS}" viewBox="0 0 ${SQUARE} ${SQUARE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${SQUARE}" height="${SQUARE}" fill="${MIDNIGHT}"/>
  <svg x="${squareRuneXY}" y="${squareRuneXY}" width="${squareRuneRender}" height="${squareRuneRender}" viewBox="${CANONICAL_VIEWBOX}" overflow="visible">${runeElements(PARCHMENT)}</svg>
</svg>`;
writeFileSync(join(BRAND_DIR, "arkidel-square-512.png"), await rasterize(squareSvg, SQUARE, SQUARE));
console.log(
  `arkidel-square-512.png written (${SQUARE}x${SQUARE} px) — visible box ${Math.round(SQUARE * SQUARE_BOX_RATIO)}px (${Math.round(SQUARE_BOX_RATIO * 100)}%), ${Math.round(squareRuneXY + 0.1 * squareRuneRender)}px clear each side`
);

// arkidel-horizontal-600.png — rune left, "Arkidel" wordmark right, Parchment
// on a Midnight panel, for horizontal-strip contexts (e.g. the Buttondown
// email header). Proportions track the site header exactly: rune:gap:font-size
// = 28:12:20, letter-spacing 1.2px @ 20px, and the wordmark carries the same
// 2px-@-20px downward optical nudge (see CLAUDE.md: "Arkidel" has no
// descenders, so its mass rides high relative to the rune's centre).
const H_W = 600;
const H_H = 200;

// Font size F drives everything via the header ratios. F=87 was chosen so the
// horizontal margin (bounded by the wide wordmark) and the vertical margin
// (bounded by the rune box) come out essentially equal at ~51px — symmetric
// breathing room rather than a mark floating in navy.
const F = 87;
const runeSize = 1.4 * F;              // 28/20 * F  (rendered viewBox dimension)
const gap = 0.6 * F;                   // 12/20 * F  (from rune svg edge, as in header)
const letterSpacing = (1.2 / 20) * F;  // 1.2px @ 20px, scaled
const nudge = (2 / 20) * F;            // 2px  @ 20px, scaled (the header's translateY)

// Vertical placement reproduces the site's CSS line-box centring so the PNG
// matches the live header: Tailwind text-xl has line-height 1.4 (28px @ 20px).
// The line box is centred on the rune's vertical centre, then nudged down.
const runeCenterY = H_H / 2;
const lineHeight = 1.4 * F;
const ascentPx = (merriweather.ascent / merriweather.unitsPerEm) * F;
const descentPx = (-merriweather.descent / merriweather.unitsPerEm) * F;
const halfLeading = (lineHeight - (ascentPx + descentPx)) / 2;
const baselineY = runeCenterY - lineHeight / 2 + halfLeading + ascentPx + nudge;

// Measure the wordmark's inked width at originX=0, then centre the VISIBLE
// composition. "Visible" matters because the canonical rune viewBox has a 10%
// margin: the box starts 0.1*runeSize in from the svg's left edge, so we
// centre on the box's left edge (not the svg edge) for true optical balance.
const measure = wordmarkPaths({ text: "Arkidel", fontSize: F, originX: 0, baselineY, letterSpacing, color: PARCHMENT });
const wordmarkInkWidth = measure.inkRight - measure.inkLeft;
const runeBoxInset = 0.1 * runeSize; // the canonical viewBox's left/right margin
// Visible span: from the rune box's left edge to the wordmark's right ink edge.
const visibleWidth = (runeSize - runeBoxInset) + gap + wordmarkInkWidth;
const visibleLeft = (H_W - visibleWidth) / 2;
const runeX = visibleLeft - runeBoxInset;            // svg edge sits left of box edge
const runeY = runeCenterY - runeSize / 2;
// originX so the wordmark's left ink edge lands one gap past the rune svg edge.
const wordmarkOriginX = runeX + runeSize + gap - measure.inkLeft;

const wordmark = wordmarkPaths({ text: "Arkidel", fontSize: F, originX: wordmarkOriginX, baselineY, letterSpacing, color: PARCHMENT });

const horizontalSvg = `<svg width="${H_W * SS}" height="${H_H * SS}" viewBox="0 0 ${H_W} ${H_H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${H_W}" height="${H_H}" fill="${MIDNIGHT}"/>
  <svg x="${runeX}" y="${runeY}" width="${runeSize}" height="${runeSize}" viewBox="${CANONICAL_VIEWBOX}" overflow="visible">${runeElements(PARCHMENT)}</svg>
  ${wordmark.svg}
</svg>`;
writeFileSync(join(BRAND_DIR, "arkidel-horizontal-600.png"), await rasterize(horizontalSvg, H_W, H_H));
// Report the actual margins so the composition can be checked at a glance.
const hMargin = Math.round(visibleLeft);
const vBoxMargin = Math.round((H_H - 0.8 * runeSize) / 2); // clear navy above/below rune box
console.log(
  `arkidel-horizontal-600.png written (${H_W}x${H_H} px) — h-margin ~${hMargin}px, v-margin ~${vBoxMargin}px (rune box)`
);
