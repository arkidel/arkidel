// Headless memo gate — renders Breach Notification Deadline Analysis PDFs
// through the production render path (src/breach-clock/memo-pdf-core.js) and
// asserts critical strings in the extracted text.
//
// Fixture 1 (original, 2026-05): VA memo for a human read of the citation
//   `Va. Code § 32.1-127.1:05` / source URLs under the JetBrainsMonoNL swap.
// Fixture 2 (category-conditioned pass, commit 2): CT+DE+MA incident with
//   ssn + credentials — service cards (2 years / 1 year / 18 months) and the
//   two DECLARED credential advisories. Asserts the service right slots read
//   "{duration} (minimum)" and carry NO "Due " prefix (never routed through
//   formatDeadline), and that the screen-only "Edit data categories" link
//   does not print.
// Fixture 3: same jurisdictions with gov_id but NO ssn — the three AUTO
//   advisories ("… may apply — confirm whether Social Security numbers were
//   included"). Asserts no service durations print and no edit link prints.
//
// Run: node scripts/render-gate-memo.mjs   (exit code non-zero on failure)
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

const renderOpts = { fontBytes, logoBytes, generatedAt: new Date("2026-07-26T12:00:00Z") };

// Extract the full text of a rendered PDF, space-joined so phrases that wrap
// across drawn lines reassemble at word boundaries.
async function extractText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    for (const it of tc.items) text += it.str + " ";
  }
  return text.replace(/\s+/g, " ");
}

let failures = 0;
function check(label, ok) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) failures++;
}

// ── Fixture 1 — original VA memo (human-read artifact, kept for continuity) ──
{
  const facts = {
    awarenessDate: new Date("2026-05-22T15:00:00Z"),
    jurisdictions: { va: true },
    residentCounts: { va: 5000 },
    sensitivity: ["health"],
    sensitivityLabels: ["Health or medical information"],
  };
  const { deadlines, suppressed } = computeDeadlines(facts);
  const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, renderOpts);
  await fs.writeFile("/tmp/gate-memo.pdf", bytes);
  console.log(`\nFixture 1 (VA): wrote /tmp/gate-memo.pdf (${bytes.length} bytes); deadlines: ${deadlines.length}; suppressed: ${suppressed.length}`);
}

// ── Fixture 2 — CT+DE+MA with ssn + credentials: services + declared advisories ──
{
  const facts = {
    awarenessDate: new Date("2026-07-20T15:00:00Z"),
    jurisdictions: { ct: true, de: true, ma: true },
    residentCounts: { ct: 800, de: 501 },
    sensitivity: ["identifiers", "ssn", "credentials"],
    sensitivityLabels: [
      "Identifiers (name, email, address)",
      "Social Security numbers (or ITIN / other taxpayer IDs)",
      "Authentication credentials (passwords, tokens)",
    ],
  };
  const { deadlines, suppressed, review, services, advisories } = computeDeadlines(facts);
  const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, renderOpts, review, null, services, advisories);
  await fs.writeFile("/tmp/gate-memo-services.pdf", bytes);
  console.log(`\nFixture 2 (CT+DE+MA, ssn+credentials): wrote /tmp/gate-memo-services.pdf (${bytes.length} bytes); services: ${services.length}; advisories: ${advisories.length}`);
  const text = await extractText(bytes);
  check("CT service duration renders '2 years (minimum)'", text.includes("2 years (minimum)"));
  check("DE service duration renders '1 year (minimum)'", text.includes("1 year (minimum)"));
  check("MA service duration renders '18 months (minimum)'", text.includes("18 months (minimum)"));
  check("no service slot carries a 'Due ' prefix", !text.includes("Due 2 years") && !text.includes("Due 1 year") && !text.includes("Due 18 months"));
  check("service card titles print", text.includes("Identity Theft Prevention Services for Affected Connecticut Residents"));
  check("CT declared credential advisory prints", text.includes("Login-credential breaches"));
  check("DE declared credential advisory prints", text.includes("Email-credential breaches"));
  check("screen-only 'Edit data categories' link never prints", !text.includes("Edit data categories"));
  check("no auto-advisory prints when ssn is confirmed", !text.includes("confirm whether Social Security numbers"));
  // No-fixed-clock deadline slots now carry the statute's own phrase under the
  // "Due " prefix (MA here) instead of the former hardcoded wording.
  check("MA no-fixed-clock slot reads 'Due {statutory phrase}'", text.includes("Due as soon as practicable and without unreasonable delay"));
}

// ── Fixture 3 — CT+DE+MA with gov_id but NO ssn: auto-advisories ──
{
  const facts = {
    awarenessDate: new Date("2026-07-20T15:00:00Z"),
    jurisdictions: { ct: true, de: true, ma: true },
    residentCounts: { ct: 800, de: 501 },
    sensitivity: ["identifiers", "gov_id"],
    sensitivityLabels: [
      "Identifiers (name, email, address)",
      "Government IDs (passport, driver's license, state ID)",
    ],
  };
  const { deadlines, suppressed, review, services, advisories } = computeDeadlines(facts);
  const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, renderOpts, review, null, services, advisories);
  await fs.writeFile("/tmp/gate-memo-advisories.pdf", bytes);
  console.log(`\nFixture 3 (CT+DE+MA, gov_id without ssn): wrote /tmp/gate-memo-advisories.pdf (${bytes.length} bytes); services: ${services.length}; advisories: ${advisories.length}`);
  const text = await extractText(bytes);
  check("CT auto-advisory title prints", text.includes("Identity theft prevention services may apply"));
  check("DE/MA auto-advisory title prints", text.includes("Credit monitoring may apply"));
  check("auto-advisory title carries the confirm clause", text.includes("confirm whether Social Security numbers were included"));
  check("no service card prints without ssn", !text.includes("(minimum)"));
  check("screen-only 'Edit data categories' link never prints", !text.includes("Edit data categories"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
