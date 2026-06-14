// Generate a realistic Breach Notification Deadline Analysis PDF through
// the production render path (src/breach-clock/memo-pdf-core.js) so a human
// reader can confirm the citation `Va. Code § 32.1-127.1:05` and the
// source URLs render cleanly under the JetBrainsMonoNL swap.
//
// Run: node scripts/render-gate-memo.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeDeadlines } from "../src/breach-clock/engine.js";
import { renderMemoPdfBytes } from "../src/breach-clock/memo-pdf-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function readBytes(p) {
  return new Uint8Array(await fs.readFile(p));
}

const facts = {
  awarenessDate: new Date("2026-05-22T15:00:00Z"),
  jurisdictions: { va: true },
  residentCounts: { va: 5000 },
  sensitivity: ["health"],
  sensitivityLabels: ["Health or medical information"],
};

const { deadlines, suppressed } = computeDeadlines(facts);

const fontDir = path.join(ROOT, "src/assets/fonts");
const fontBytes = {
  serifReg: await readBytes(path.join(fontDir, "Merriweather-Regular.ttf")),
  serifBold: await readBytes(path.join(fontDir, "Merriweather-Bold.ttf")),
  sansReg: await readBytes(path.join(fontDir, "Inter-Regular.ttf")),
  sansBold: await readBytes(path.join(fontDir, "Inter-SemiBold.ttf")),
  monoReg: await readBytes(path.join(fontDir, "JetBrainsMonoNL-Regular.ttf")),
};
const logoBytes = await readBytes(path.join(ROOT, "src/assets/logo-arkidel.png"));

const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, {
  fontBytes,
  logoBytes,
  generatedAt: new Date("2026-05-23T12:00:00Z"),
});

const outPath = "/tmp/gate-memo.pdf";
await fs.writeFile(outPath, bytes);
console.log(`Wrote ${outPath} (${bytes.length} bytes)`);
console.log(`Deadlines fired: ${deadlines.length}; suppressed: ${suppressed.length}`);
