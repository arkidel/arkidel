// Gate render for the suppressed-card heading-truncation fix.
//
// Generates a Breach Notification Deadline Analysis PDF that exercises:
//   (a) the Massachusetts suppressed-obligation card with the long
//       "Massachusetts Office of Consumer Affairs and Business Regulation
//       (OCABR)" authority string — confirms the heading wraps to two
//       lines rather than truncating at the right edge;
//   (b) the MA AG suppressed card and the MA Affected Residents suppressed
//       card — both share the topRow code path and validate normal-length
//       headings still render on a single line;
//   (c) a parallel deadline-card render with encryption off, so the same
//       OCABR heading appears alongside a right-aligned timestamp; this
//       proves the heading wraps under the timestamp and the timestamp
//       stays on the first-line baseline.
//
// Run: node scripts/render-truncation-gate.mjs
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

const fontDir = path.join(ROOT, "src/assets/fonts");
const fontBytes = {
  serifReg: await readBytes(path.join(fontDir, "Merriweather-Regular.ttf")),
  serifBold: await readBytes(path.join(fontDir, "Merriweather-Bold.ttf")),
  sansReg: await readBytes(path.join(fontDir, "Inter-Regular.ttf")),
  sansBold: await readBytes(path.join(fontDir, "Inter-SemiBold.ttf")),
  monoReg: await readBytes(path.join(fontDir, "JetBrainsMonoNL-Regular.ttf")),
};
const logoBytes = await readBytes(path.join(ROOT, "src/assets/logo-arkidel.png"));

async function render(label, facts, outName) {
  const { deadlines, suppressed, review } = computeDeadlines(facts);
  const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, {
    fontBytes,
    logoBytes,
    generatedAt: new Date("2026-05-23T12:00:00Z"),
  }, review);
  const outPath = path.join("/tmp", outName);
  await fs.writeFile(outPath, bytes);
  console.log(`[${label}] ${outPath} (${bytes.length} bytes) — deadlines: ${deadlines.length}, suppressed: ${suppressed.length}, review: ${review.length}`);
}

// (a) Review-card path — MA harbor met (encrypted, 128-bit, key not acquired), so
//     all three MA obligations route to REVIEW (the § 3(b) second trigger).
//     Expect three review cards (Residents, AG, OCABR); the OCABR heading should
//     wrap onto a second line and render in full. (Pre-S5 this was the
//     "suppressed" path via the global encryption switch; that switch is gone.)
await render(
  "review",
  {
    awarenessDate: new Date("2026-05-22T15:00:00Z"),
    jurisdictions: { ma: true },
    residentCounts: {},
    sensitivity: ["identifiers"],
    sensitivityLabels: ["Government identifiers (SSN, driver's license, etc.)"],
    encrypted: "yes",
    encryptionStrength: "ge_128",
    keyAcquired: "no",
  },
  "gate-truncation-review.pdf"
);

// (c) Deadline-card path — encryption off, MA selected.
//     Same OCABR heading appears, this time as a firing deadline alongside
//     a right-aligned "Without unreasonable delay" or timestamp. Confirms
//     the wrap reserves room for the right element and the right element
//     stays on the first-line baseline.
await render(
  "deadline",
  {
    awarenessDate: new Date("2026-05-22T15:00:00Z"),
    jurisdictions: { ma: true },
    residentCounts: {},
    sensitivity: ["identifiers"],
    sensitivityLabels: ["Government identifiers (SSN, driver's license, etc.)"],
  },
  "gate-truncation-deadline.pdf"
);
