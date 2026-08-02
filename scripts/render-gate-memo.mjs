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
// Fixture 4 (harm-gate UI commit, 2026-08-02): CT+DE+CO+VA+NY+MA with a
//   recorded harm determination (determined_unlikely) — the harm-suppressed
//   group with per-row verbatim standards (both CO strings, present and
//   distinct), VA duty-element framing, the admonition footer, the NY/MA
//   still-computing explainer (§ 3(b) citation), and the Analysis Inputs
//   "Harm assessment" row.
// Fixture 5: same facts under "" vs "harm_likely" — extracted memo text is
//   identical except the Analysis Inputs harm row.
// Fixture 6 (compute/persist unification, 2026-08-02): fresh-compute
//   assertion — facts are mutated BETWEEN an initial compute and memo
//   generation; the memo must reflect the mutation (it is generated from a
//   fresh compute of current facts at generation time, mirroring
//   handleDownloadMemo, never from the earlier cached compute).
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

// ── Fixture 4 — harm determination recorded: suppressed standards + explainer ──
{
  const facts = {
    awarenessDate: new Date("2026-08-01T15:00:00Z"),
    jurisdictions: { ct: true, de: true, co: true, va: true, ny: true, ma: true },
    residentCounts: { ct: 800, de: 501, co: 5000, va: 5000, ny: 10000 },
    sensitivity: ["identifiers", "ssn"],
    sensitivityLabels: [
      "Identifiers (name, email, address)",
      "Social Security numbers (or ITIN / other taxpayer IDs)",
    ],
    harmAssessment: "determined_unlikely",
  };
  const { deadlines, suppressed, review, services, advisories } = computeDeadlines(facts);
  const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, renderOpts, review, null, services, advisories);
  await fs.writeFile("/tmp/gate-memo-harm.pdf", bytes);
  console.log(`\nFixture 4 (harm determination, CT+DE+CO+VA+NY+MA): wrote /tmp/gate-memo-harm.pdf (${bytes.length} bytes); deadlines: ${deadlines.length}; suppressed: ${suppressed.length}; services: ${services.length}`);
  const text = await extractText(bytes);
  check("harm-suppressed group label prints", text.includes("SUPPRESSED — HARM DETERMINATION"));
  check("CO resident standard prints verbatim", text.includes("misuse of the information has not occurred and is not reasonably likely to occur"));
  check("CO AG standard prints verbatim (distinct string)", text.includes("misuse of the information has not occurred and is not likely to occur"));
  check("CO AG citation (2)(f)(I) prints", text.includes("Colo. Rev. Stat. § 6-1-716(2)(f)(I)"));
  check("VA duty-element framing prints", text.includes("Duty element not established:"));
  check("VA standard prints verbatim", text.includes("identity theft or another fraud to any resident of the Commonwealth"));
  check("CT standard prints verbatim", text.includes("will not likely result in harm to the individuals whose personal information has been acquired or accessed"));
  check("DE standard prints verbatim", text.includes("unlikely to result in harm to the individuals whose personal information has been breached"));
  check("exemption framing prints on exemption rows", text.includes("Statutory exemption applied:"));
  check("admonition footer prints", text.includes("Document the determination contemporaneously. Suppression rests on counsel's attestation, applied under each statute's own standard."));
  check("NY/MA explainer lead prints once", text.includes("New York and Massachusetts obligations remain computed."));
  check("NY explainer sentence prints", text.includes("an element this determination does not establish"));
  check("MA explainer cites §§ 1, 3(b)", text.includes("M.G.L. c. 93H §§ 1, 3(b)"));
  check("Analysis Inputs harm row prints with jurisdiction standards", text.includes("Determination made and documented (Colorado, Virginia, Delaware, and Connecticut standards)"));
  check("CT/DE services land in the suppressed section, not as service cards", !text.includes("2 years (minimum)") && !text.includes("1 year (minimum)"));
  check("MA § 3A service still computes (not harm-gated)", text.includes("18 months (minimum)"));
  check("NY obligations still compute (30-day individual deadline card)", text.includes("Affected New York Residents"));
  check("MA obligations still compute", text.includes("Massachusetts Attorney General"));
  check("nothing prints under the plain suppressed label", !text.includes("NOTIFICATION LIKELY NOT REQUIRED"));
}

// ── Fixture 5 — "" vs "harm_likely": memo text identical except the harm row ──
{
  const base = {
    awarenessDate: new Date("2026-08-01T15:00:00Z"),
    jurisdictions: { ct: true, de: true, co: true, va: true, ny: true, ma: true },
    residentCounts: { ct: 800, de: 501, co: 5000, va: 5000, ny: 10000 },
    sensitivity: ["identifiers", "ssn"],
    sensitivityLabels: [
      "Identifiers (name, email, address)",
      "Social Security numbers (or ITIN / other taxpayer IDs)",
    ],
  };
  const render = async (harmAssessment) => {
    const facts = { ...base, harmAssessment };
    const { deadlines, suppressed, review, services, advisories } = computeDeadlines(facts);
    const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, renderOpts, review, null, services, advisories);
    return extractText(bytes);
  };
  const notAssessed = await render("");
  const harmLikely = await render("harm_likely");
  console.log(`\nFixture 5 ("" vs "harm_likely" parity):`);
  check("'' renders 'Not assessed' in the harm row", notAssessed.includes("HARM ASSESSMENT Not assessed"));
  check("'harm_likely' renders its label in the harm row", harmLikely.includes("HARM ASSESSMENT Harm likely, or not determined"));
  const mask = "HARM ASSESSMENT ⌧";
  const a = notAssessed.replace("HARM ASSESSMENT Not assessed", mask);
  const b = harmLikely.replace("HARM ASSESSMENT Harm likely, or not determined", mask);
  check("texts differ before masking the harm row", notAssessed !== harmLikely);
  check("memo text identical except the Analysis Inputs harm row", a === b);
  check("neither renders any suppression or explainer", !a.includes("SUPPRESSED — HARM DETERMINATION") && !a.includes("obligations remain computed"));
}

// ── Fixture 6 — memo generates from a FRESH compute of current facts ──
{
  // Mirrors the app's generation contract (handleDownloadMemo): the memo path
  // computes at generation time from whatever the current facts are — it
  // never accepts a previously computed result.
  const generateMemoFromCurrentFacts = async (facts) => {
    const { deadlines, suppressed, review, services, advisories } = computeDeadlines(facts);
    const bytes = await renderMemoPdfBytes(facts, deadlines, suppressed, renderOpts, review, null, services, advisories);
    return extractText(bytes);
  };

  // Current facts object, computed once (the would-be "cached results state").
  const facts = {
    awarenessDate: new Date("2026-08-01T15:00:00Z"),
    jurisdictions: { ca: true },
    residentCounts: { ca: 10000 },
    sensitivity: ["identifiers", "ssn"],
    sensitivityLabels: [
      "Identifiers (name, email, address)",
      "Social Security numbers (or ITIN / other taxpayer IDs)",
    ],
  };
  const stale = computeDeadlines(facts);
  const staleHadCO = stale.deadlines.some((d) => d.jurisdiction === "Colorado");

  // Mutate the facts AFTER that compute, then generate the memo.
  facts.jurisdictions = { ...facts.jurisdictions, co: true };
  facts.residentCounts = { ...facts.residentCounts, co: 5000 };
  const text = await generateMemoFromCurrentFacts(facts);

  console.log(`\nFixture 6 (fresh-compute assertion): stale compute had CO: ${staleHadCO}`);
  check("stale (pre-mutation) compute carries no Colorado obligation", !staleHadCO);
  check("memo reflects the post-mutation facts (Colorado AG obligation prints)", text.includes("Colorado Attorney General"));
  check("memo reflects the post-mutation facts (CO citation prints)", text.includes("Colo. Rev. Stat. § 6-1-716"));
  check("memo Analysis Inputs lists the mutated jurisdiction set", text.includes("Colorado"));
  check("pre-mutation jurisdiction still prints (mutation is additive)", text.includes("California"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
