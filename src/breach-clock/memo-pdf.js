// =============================================================================
// MEMO PDF — browser entry
//
// Loads the bundled fonts and logo PNG via Vite `?url` imports + `fetch`,
// then delegates to the pure render path in memo-pdf-core.js. The split
// exists so the render path is importable from Node (the `?url` suffix is
// Vite-specific and breaks under plain Node ESM resolution) — see
// scripts/render-gate-memo.mjs for the Node-side caller.
//
// Font handling — bundled TTFs in src/assets/fonts/.
//
// We bundle TTF directly (rather than @fontsource WOFF) because pdf-lib's
// font subsetter mishandles tables decoded out of WOFF1 containers — colons,
// slashes, hyphens, and fi/ff/fl ligatures all came out wrong. TTF files
// from the original font releases (Inter from rsms/inter, Merriweather from
// SorkinType/Merriweather, JetBrainsMonoNL from JetBrains/JetBrainsMono)
// embed cleanly with no transformation.
//
// Mono: JetBrainsMonoNL — the No-Ligatures variant from the same upstream
// release. pdf-lib's fontkit subsetter applies GSUB ligature substitutions
// when embedding the standard JetBrainsMono build, which corrupts plain
// adjacencies like `://` (a programming-ligature trigger) into mojibake
// glyphs. The NL build has the GSUB ligature tables stripped and is
// JetBrains' own recommended variant for non-coding contexts. Same metrics,
// same glyph shapes — drop-in safe. Regression guard: scripts/mono-gate.mjs.
// =============================================================================

import serifRegularUrl from "../assets/fonts/Merriweather-Regular.ttf?url";
import serifBoldUrl from "../assets/fonts/Merriweather-Bold.ttf?url";
import sansRegularUrl from "../assets/fonts/Inter-Regular.ttf?url";
import sansBoldUrl from "../assets/fonts/Inter-SemiBold.ttf?url";
import monoRegularUrl from "../assets/fonts/JetBrainsMonoNL-Regular.ttf?url";

// Logo PNG (96×96 MIDNIGHT, transparent background; rendered at 24pt in the PDF).
// Re-generate with `node scripts/build-logo.js` if the icon SVG changes.
import logoPngUrl from "../assets/logo-arkidel.png?url";

import { renderMemoPdfBytes } from "./memo-pdf-core.js";

let _fontBytesCache = null;
async function loadFontBytes() {
  if (_fontBytesCache) return _fontBytesCache;
  const fetchAB = (url) => fetch(url).then((r) => r.arrayBuffer());
  const [serifReg, serifBold, sansReg, sansBold, monoReg] = await Promise.all([
    fetchAB(serifRegularUrl),
    fetchAB(serifBoldUrl),
    fetchAB(sansRegularUrl),
    fetchAB(sansBoldUrl),
    fetchAB(monoRegularUrl),
  ]);
  _fontBytesCache = { serifReg, serifBold, sansReg, sansBold, monoReg };
  return _fontBytesCache;
}

export async function generateMemoPdf(facts, deadlines, suppressed, review = []) {
  const fontBytes = await loadFontBytes();
  const logoBytes = await fetch(logoPngUrl).then((r) => r.arrayBuffer());
  return renderMemoPdfBytes(facts, deadlines, suppressed, {
    fontBytes,
    logoBytes,
    generatedAt: new Date(),
  }, review);
}
