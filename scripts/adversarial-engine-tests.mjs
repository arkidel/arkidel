// =============================================================================
// ADVERSARIAL ENGINE TEST PASS — external harness for the deadline engine.
//
// These are hostile cases over `computeDeadlines` (src/breach-clock/engine.js),
// kept OUT of the in-file TEST_CASES because:
//   1. engine.js is a protected file (read-only in this pass), and
//   2. the in-file `runTests` force-overrides facts.awarenessDate to a single
//      fixed TEST_AWARENESS (engine.js:1061-1064), so it cannot exercise
//      custom awareness timestamps (midnight / DST / end-of-month / sub-second).
// This harness imports the exported engine and calls it directly, so awareness
// time is a free variable.
//
// Every expectation below is DERIVED FROM data.js's stated rules first (the
// derivation is in the comment on each case), then checked against output —
// not reverse-engineered from what the engine happens to print.
//
// Run: node scripts/adversarial-engine-tests.mjs
// Exit code is non-zero if any case fails.
// =============================================================================

import { readFileSync } from "node:fs";
import { computeDeadlines } from "../src/breach-clock/engine.js";
import { JURISDICTIONS, RULESET_VERSION } from "../src/breach-clock/data.js";
import { factsFromPayload } from "../src/breach-clock/facts.js";

// --- Fixtures ----------------------------------------------------------------

// Default awareness: same instant the in-file harness uses, for continuity.
const AW = new Date("2026-05-01T09:00:00.000Z");

// --- Bucket finders (mirror the engine's output shape) -----------------------
// deadlines/suppressed/pending entries are keyed by `jurisdiction` (jur.short)
// and `authority` (ob.authority).
const D = (r, j, au) => r.deadlines.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
const S = (r, j, au) => r.suppressed.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
const P = (r, j, au) => r.pending.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
const R = (r, j, au) => (r.review || []).find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
const ISO = (d) => (d ? d.toISOString() : null);
// Canonical JSON for deep-equality (Date -> ISO via default toJSON).
const J = (v) => JSON.stringify(v);

// --- Runner ------------------------------------------------------------------

const results = [];
function T(group, name, fn) {
  const fails = [];
  const a = {
    ok: (c, m) => { if (!c) fails.push(m); },
    eq: (x, y, m) => { if (x !== y) fails.push(`${m}: expected ${J(y)}, got ${J(x)}`); },
  };
  try {
    fn(a);
  } catch (e) {
    fails.push("THREW: " + (e && (e.stack || e.message) ? e.stack || e.message : String(e)));
  }
  results.push({ group, name, pass: fails.length === 0, detail: fails.join(" | ") });
}

// =============================================================================
// A. MIXED STATES — firing US alongside pending / suppressed GDPR
// =============================================================================

T("A. Mixed", "GDPR pending (riskLevel unset) while CA fires", (a) => {
  // data.js: CA individual has no gating -> fires; CA AG threshold 500 gt, 1000>500 -> fires.
  // EU/UK Art.33 (riskRequired) + Art.34 (highRiskRequired) with riskLevel unset -> pending.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true, eu: true, uk: true }, residentCounts: { ca: 1000 } });
  a.eq(r.deadlines.length, 2, "deadlines count");
  a.eq(r.pending.length, 4, "pending count");
  a.eq(r.suppressed.length, 0, "suppressed count");
  a.ok(D(r, "California", "California Residents"), "CA individual fires");
  a.ok(D(r, "California", "Attorney General"), "CA AG fires (1000>500)");
  a.ok(P(r, "EU GDPR", "Supervisory Authority"), "EU SA pending");
  a.ok(P(r, "EU GDPR", "Data Subjects"), "EU DS pending");
  a.ok(P(r, "UK GDPR", "ICO"), "UK ICO pending");
  a.ok(P(r, "UK GDPR", "Data Subjects"), "UK DS pending");
});

T("A. Mixed", "GDPR risk-suppressed ('unlikely') while TX fires", (a) => {
  // data.js: TX individual no gating -> fires; TX AG 250 gte, 300>=250 -> fires; TX CRA 10000 gt, 300 no.
  // riskLevel 'unlikely': EU Art.33 needs risk/high -> suppressed (Art.33(5) GDPR);
  //                       EU Art.34 needs high -> suppressed (Art.34 GDPR).
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { tx: true, eu: true }, residentCounts: { tx: 300 }, riskLevel: "unlikely" });
  a.eq(r.deadlines.length, 2, "deadlines count (TX ind + AG)");
  a.eq(r.pending.length, 0, "pending count");
  a.eq(r.suppressed.length, 2, "suppressed count (EU SA + DS)");
  a.ok(D(r, "Texas", "Texas Residents"), "TX individual fires");
  a.ok(D(r, "Texas", "Attorney General"), "TX AG fires");
  a.eq(S(r, "EU GDPR", "Supervisory Authority")?.suppression_type, "risk_assessment", "EU SA suppression type");
  a.eq(S(r, "EU GDPR", "Supervisory Authority")?.suppression_citation, "Art. 33(5) GDPR", "EU SA suppression citation");
  a.eq(S(r, "EU GDPR", "Data Subjects")?.suppression_type, "risk_assessment", "EU DS suppression type");
});

T("A. Mixed", "All EIGHT jurisdictions, riskLevel unset, mixed counts", (a) => {
  // Counts chosen to straddle thresholds:
  //   ca 501 (AG 500 gt -> fires), tx 250 (AG 250 gte -> fires; CRA 10000 gt -> no),
  //   co 1000 (AG 500 gte -> fires; CRA 1000 gt -> no), ny 5000 (CRA 5000 gt -> no),
  //   va 1001 (CRA 1000 gt -> fires). MA count-independent (3 fire).
  // riskLevel unset -> EU/UK all 4 pending.
  // Expected firing: CA 2, TX 2, CO 2, MA 3, NY 4, VA 3 = 16.
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: { eu: true, uk: true, ca: true, tx: true, co: true, ma: true, ny: true, va: true },
    residentCounts: { ca: 501, tx: 250, co: 1000, ny: 5000, va: 1001 },
  });
  a.eq(r.deadlines.length, 16, "deadlines count");
  a.eq(r.pending.length, 4, "pending count (EU+UK x2)");
  a.eq(r.suppressed.length, 0, "suppressed count");
  a.ok(D(r, "California", "Attorney General"), "CA AG fires (501>500)");
  a.ok(!D(r, "Texas", "Consumer Reporting"), "TX CRA does not fire (250)");
  a.ok(!D(r, "Colorado", "Consumer Reporting"), "CO CRA does not fire (1000 not >1000)");
  a.ok(!D(r, "New York", "Consumer Reporting"), "NY CRA does not fire (5000 not >5000)");
  a.ok(D(r, "Virginia", "Consumer Reporting"), "VA CRA fires (1001>1000)");
  a.ok(P(r, "EU GDPR", "Supervisory Authority"), "EU SA pending");
});

T("A. Mixed", "All EIGHT, riskLevel high + encryption (per-obligation safeHarbor gates)", (a) => {
  // Encryption is per-obligation safeHarbor gates, not a global switch. US states
  // read encrypted/keyAcquired; GDPR Art.34 reads gdprUnintelligibility (S5).
  // Order is risk(fireCondition) -> threshold -> encryption(safeHarbor).
  //   GDPR Art.33 has no encryption gate -> fires (EU SA + UK ICO) = 2 deadlines.
  //   GDPR Art.34 (high meets risk, then gdprUnintelligibility) -> suppressed x2.
  //   Every US obligation whose threshold is met -> breach_definition-suppressed,
  //   EXCEPT MA: S4 routes MA's harbor (encrypted + 128-bit + key-not-acquired) to
  //   REVIEW (the § 3(b) second trigger), so strength ge_128 is supplied here.
  // Counts: ca1000, tx20000, co5000, ny6000, va2000 -> all thresholds met.
  //   Suppressed US: CA 2, TX 3, CO 3, NY 5, VA 3 = 16; +2 GDPR DS = 18.
  //   Review: MA 3. Deadlines: EU SA + UK ICO = 2. (firing + suppressed + review.)
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: { eu: true, uk: true, ca: true, tx: true, co: true, ma: true, ny: true, va: true },
    residentCounts: { ca: 1000, tx: 20000, co: 5000, ny: 6000, va: 2000 },
    riskLevel: "high",
    gdprUnintelligibility: "yes",
    encrypted: "yes",
    encryptionStrength: "ge_128",
    keyAcquired: "no",
  });
  a.eq(r.deadlines.length, 2, "deadlines count (EU SA + UK ICO only)");
  a.eq(r.pending.length, 0, "pending count");
  a.eq(r.suppressed.length, 18, "suppressed count (MA 3 moved to review)");
  a.eq(r.review.length, 3, "review count (MA AG + OCABR + residents)");
  a.ok(R(r, "Massachusetts", "Massachusetts Residents"), "MA residents -> review");
  a.ok(!S(r, "Massachusetts", "Massachusetts Residents"), "MA not suppressed");
  a.ok(D(r, "EU GDPR", "Supervisory Authority"), "EU SA fires (no encryption mechanism on Art.33)");
  a.ok(!S(r, "EU GDPR", "Supervisory Authority"), "EU SA not suppressed");
  a.eq(S(r, "EU GDPR", "Data Subjects")?.suppression_type, "unintelligibility_exemption", "EU DS suppression type");
  a.eq(S(r, "EU GDPR", "Data Subjects")?.suppression_citation, "Art. 34(3)(a) GDPR", "EU DS suppression citation");
  a.eq(S(r, "California", "California Residents")?.suppression_type, "breach_definition", "CA ind suppression type");
});

// =============================================================================
// B. ORDERING — risk gating precedes encryption; winning suppression + citation
// =============================================================================

T("B. Ordering", "Art.34 'unlikely' risk + encryption -> RISK wins (citation Art.34 GDPR, not 34(3)(a))", (a) => {
  // Both could apply to Art.34: risk ('unlikely' fails high) AND encryption (unintelligibility).
  // Engine runs risk BEFORE encryption, returns at risk -> suppression_type risk_assessment,
  // suppression_citation = riskSuppression.citation = "Art. 34 GDPR".
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "unlikely", gdprUnintelligibility: "yes" });
  a.eq(r.deadlines.length, 0, "deadlines count");
  a.eq(r.suppressed.length, 2, "suppressed count (SA + DS)");
  const ds = S(r, "EU GDPR", "Data Subjects");
  a.eq(ds?.suppression_type, "risk_assessment", "DS suppression type is risk, not encryption");
  a.eq(ds?.suppression_citation, "Art. 34 GDPR", "DS citation is risk citation");
  a.ok(ds?.suppression_citation !== "Art. 34(3)(a) GDPR", "DS citation is NOT the unintelligibility citation");
  // Art.33 has no encryption mechanism anyway; risk suppresses it with Art.33(5).
  a.eq(S(r, "EU GDPR", "Supervisory Authority")?.suppression_citation, "Art. 33(5) GDPR", "SA citation");
});

T("B. Ordering", "Art.34 'risk' (not high) + encryption -> RISK wins over encryption", (a) => {
  // riskLevel 'risk': Art.33 fires (72h). Art.34 needs high -> risk-suppressed BEFORE encryption.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "risk", gdprUnintelligibility: "yes" });
  a.ok(D(r, "EU GDPR", "Supervisory Authority"), "EU SA fires (72h, no encryption mechanism)");
  const ds = S(r, "EU GDPR", "Data Subjects");
  a.eq(ds?.suppression_type, "risk_assessment", "DS suppression type");
  a.eq(ds?.suppression_citation, "Art. 34 GDPR", "DS citation is risk citation, not 34(3)(a)");
});

T("B. Ordering", "Art.34 'high' + encryption -> ENCRYPTION wins (risk satisfied, citation 34(3)(a))", (a) => {
  // riskLevel high satisfies Art.34's risk gate, so it falls through to the encryption
  // block; encryption then suppresses via unintelligibility with citation Art.34(3)(a) GDPR.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "high", gdprUnintelligibility: "yes" });
  a.ok(D(r, "EU GDPR", "Supervisory Authority"), "EU SA fires");
  const ds = S(r, "EU GDPR", "Data Subjects");
  a.eq(ds?.suppression_type, "unintelligibility_exemption", "DS suppression type");
  a.eq(ds?.suppression_citation, "Art. 34(3)(a) GDPR", "DS citation");
});

T("B. Ordering", "UK Art.34 'unlikely' + encryption -> RISK wins (citation Art.34 UK GDPR)", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { uk: true }, riskLevel: "unlikely", gdprUnintelligibility: "yes" });
  a.eq(S(r, "UK GDPR", "Data Subjects")?.suppression_type, "risk_assessment", "UK DS suppression type");
  a.eq(S(r, "UK GDPR", "Data Subjects")?.suppression_citation, "Art. 34 UK GDPR", "UK DS citation");
  a.eq(S(r, "UK GDPR", "ICO")?.suppression_citation, "Art. 33(5) UK GDPR", "UK ICO citation");
});

// =============================================================================
// C. BOUNDARIES — at / below / above every US threshold, plus parse edges & zero
// =============================================================================

// Each US threshold from data.js, exercised AT / -1 / +1.
const THRESHOLDS = [
  // jurId, jur.short, authority-substring, threshold, comparator
  ["ca", "California", "Attorney General", 500, "gt"],
  ["tx", "Texas", "Attorney General", 250, "gte"],
  ["tx", "Texas", "Consumer Reporting", 10000, "gt"],
  ["co", "Colorado", "Attorney General", 500, "gte"],
  ["co", "Colorado", "Consumer Reporting", 1000, "gt"],
  ["ny", "New York", "Consumer Reporting", 5000, "gt"],
  ["va", "Virginia", "Consumer Reporting", 1000, "gt"],
];
for (const [jid, jshort, auth, thr, cmp] of THRESHOLDS) {
  const fires = (n) => (cmp === "gt" ? n > thr : n >= thr);
  for (const n of [thr - 1, thr, thr + 1]) {
    T("C. Boundaries", `${jshort} ${auth} @ ${n} (threshold ${cmp} ${thr})`, (a) => {
      const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { [jid]: true }, residentCounts: { [jid]: n } });
      const expectFire = fires(n);
      a.eq(!!D(r, jshort, auth), expectFire, `${auth} fires?`);
    });
  }
}

T("C. Boundaries", "Zero residents, CA selected -> individual fires, AG does not", (a) => {
  // 0 is a number (not NaN), so threshold is evaluated: 0>500 false. Individual has no gate.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: 0 } });
  a.ok(D(r, "California", "California Residents"), "CA individual fires at 0");
  a.ok(!D(r, "California", "Attorney General"), "CA AG does not fire at 0");
});

T("C. Boundaries", "Zero residents, NY selected -> 4 count-independent obligations still fire", (a) => {
  // data.js: NY individual/AG/DOS/State Police have NO threshold -> fire even at 0.
  // CRA (5000 gt) does not. This documents 'selected but zero' behavior.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ny: true }, residentCounts: { ny: 0 } });
  a.eq(r.deadlines.length, 4, "NY deadlines at 0 residents");
  a.ok(!D(r, "New York", "Consumer Reporting"), "NY CRA does not fire at 0");
});

T("C. Boundaries", "String count at boundary: '500' no AG, '501' fires AG (parseInt)", (a) => {
  const lo = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "500" } });
  const hi = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "501" } });
  a.ok(!D(lo, "California", "Attorney General"), "'500' -> no AG");
  a.ok(D(hi, "California", "Attorney General"), "'501' -> AG fires");
});

T("C. Boundaries", "Lenient parse: '501abc' fires AG; 'abc' and '' do not (NaN), individual still fires", (a) => {
  // parseInt('501abc',10) === 501 (leading-numeric); parseInt('abc') === NaN; '' -> NaN by engine guard.
  const abc501 = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "501abc" } });
  const abc = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "abc" } });
  const empty = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "" } });
  a.ok(D(abc501, "California", "Attorney General"), "'501abc' -> AG fires (parseInt=501)");
  a.ok(!D(abc, "California", "Attorney General"), "'abc' -> no AG (NaN)");
  a.ok(!D(empty, "California", "Attorney General"), "'' -> no AG (NaN)");
  a.ok(D(abc, "California", "California Residents"), "'abc' -> individual still fires (no threshold)");
});

T("C. Boundaries", "Float string truncates: '1000.9' no CO CRA, '1001.0' fires CO CRA", (a) => {
  // parseInt('1000.9',10)=1000 (not >1000); parseInt('1001.0',10)=1001 (>1000).
  const lo = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: "1000.9" } });
  const hi = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: "1001.0" } });
  a.ok(!D(lo, "Colorado", "Consumer Reporting"), "'1000.9' -> no CRA");
  a.ok(D(hi, "Colorado", "Consumer Reporting"), "'1001.0' -> CRA fires");
});

T("C. Boundaries", "Negative count: CA individual fires, AG does not", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: -5 } });
  a.ok(D(r, "California", "California Residents"), "individual fires");
  a.ok(!D(r, "California", "Attorney General"), "AG does not fire (-5)");
});

T("C. Boundaries", "'0' string vs '' string: both block AG, individual fires (different code paths)", (a) => {
  const zero = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "0" } });
  const empty = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: "" } });
  a.ok(!D(zero, "California", "Attorney General"), "'0' (parsed 0) -> no AG");
  a.ok(!D(empty, "California", "Attorney General"), "'' (NaN) -> no AG");
  a.ok(D(zero, "California", "California Residents") && D(empty, "California", "California Residents"), "individual fires in both");
});

// =============================================================================
// D. TIME — midnight / DST / end-of-month / sub-second / cascade arithmetic.
//    The engine uses pure epoch-ms arithmetic, so it must be DST-agnostic.
// =============================================================================

T("D. Time", "Midnight awareness: CA individual = +720h to the second", (a) => {
  const aw = new Date("2026-05-01T00:00:00.000Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { ca: true } });
  a.eq(ISO(D(r, "California", "California Residents")?.deadline), "2026-05-31T00:00:00.000Z", "CA ind deadline");
});

T("D. Time", "DST spring-forward (US, 2026-03-08): 72h is epoch-exact, not calendar", (a) => {
  // 2026-03-08 is US spring-forward. Pure ms math: +72h = same wall-time +72h in UTC.
  const aw = new Date("2026-03-08T06:30:00.000Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { eu: true }, riskLevel: "risk" });
  a.eq(ISO(D(r, "EU GDPR", "Supervisory Authority")?.deadline), "2026-03-11T06:30:00.000Z", "EU SA 72h across DST");
  // And a 30-day clock across the same transition:
  const r2 = computeDeadlines({ awarenessDate: aw, jurisdictions: { ca: true } });
  a.eq(ISO(D(r2, "California", "California Residents")?.deadline), "2026-04-07T06:30:00.000Z", "CA ind 30d across DST");
});

T("D. Time", "DST fall-back (US, 2026-11-01): CO 30-day clock epoch-exact", (a) => {
  const aw = new Date("2026-10-31T12:00:00.000Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { co: true } });
  a.eq(ISO(D(r, "Colorado", "Colorado Residents")?.deadline), "2026-11-30T12:00:00.000Z", "CO ind 30d across fall-back");
});

T("D. Time", "End-of-month rollover: Jan 31 + 30d (non-leap 2026) -> Mar 2", (a) => {
  const aw = new Date("2026-01-31T12:00:00.000Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { ny: true }, residentCounts: { ny: 1 } });
  a.eq(ISO(D(r, "New York", "New York Residents")?.deadline), "2026-03-02T12:00:00.000Z", "NY ind 30d EOM");
});

T("D. Time", "Leap February: Jan 31 2028 + 30d -> Mar 1 (Feb has 29 days)", (a) => {
  const aw = new Date("2028-01-31T00:00:00.000Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { ca: true } });
  a.eq(ISO(D(r, "California", "California Residents")?.deadline), "2028-03-01T00:00:00.000Z", "CA ind 30d leap");
});

T("D. Time", "Sub-second awareness preserved: 72h keeps .500 ms", (a) => {
  const aw = new Date("2026-05-01T09:00:00.500Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { eu: true }, riskLevel: "risk" });
  a.eq(ISO(D(r, "EU GDPR", "Supervisory Authority")?.deadline), "2026-05-04T09:00:00.500Z", "EU SA sub-second");
});

T("D. Time", "Cascade across month boundary: CA AG = awareness + 45d", (a) => {
  // CA individual = +30d; CA AG = parent + 15d = +45d total (data.js: 1798.82(a)/(f)).
  const aw = new Date("2026-01-20T00:00:00.000Z");
  const r = computeDeadlines({ awarenessDate: aw, jurisdictions: { ca: true }, residentCounts: { ca: 1000 } });
  a.eq(ISO(D(r, "California", "California Residents")?.deadline), "2026-02-19T00:00:00.000Z", "CA ind +30d");
  a.eq(ISO(D(r, "California", "Attorney General")?.deadline), "2026-03-06T00:00:00.000Z", "CA AG +45d");
});

// =============================================================================
// E. riskLevel EDGE VALUES — only the three valid sentinels engage the risk
//    logic; anything else fails SAFE to pending, never suppressed.
//
//    Suppression of a GDPR obligation tells the user no notification is
//    required. That determination must rest on a real assessment — exactly
//    "unlikely" / "risk" / "high". The UI emits only those three or "" today,
//    but a serialization round-trip (e.g. Supabase) could feed 0, false,
//    "High", or " risk "; those must land in PENDING (engine waiting on the
//    assessment), not SUPPRESSED. These cases pin that fail-safe behavior.
// =============================================================================

T("E. riskLevel", "missing key == explicit undefined == null == '' (all pending, identical output)", (a) => {
  const base = { awarenessDate: AW, jurisdictions: { eu: true } };
  const missing = computeDeadlines({ ...base });
  const undef = computeDeadlines({ ...base, riskLevel: undefined });
  const nul = computeDeadlines({ ...base, riskLevel: null });
  const empty = computeDeadlines({ ...base, riskLevel: "" });
  a.eq(missing.pending.length, 2, "missing -> 2 pending");
  a.eq(J(undef), J(missing), "undefined identical to missing");
  a.eq(J(nul), J(missing), "null identical to missing");
  a.eq(J(empty), J(missing), "'' identical to missing");
});

// Fail-safe hardening: an invalid riskLevel must route to PENDING (identical to
// unset), NOT to suppression. One case per required round-trip artifact.
T("E. riskLevel", "Invalid 0 fails safe to pending (not suppressed), identical to unset", (a) => {
  const unset = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true } });
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: 0 });
  a.eq(r.pending.length, 2, "0 -> both GDPR pending");
  a.eq(r.suppressed.length, 0, "0 -> nothing suppressed");
  a.eq(J(r), J(unset), "0 output identical to unset");
});

T("E. riskLevel", "Invalid false fails safe to pending (not suppressed), identical to unset", (a) => {
  const unset = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true } });
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: false });
  a.eq(r.pending.length, 2, "false -> both GDPR pending");
  a.eq(r.suppressed.length, 0, "false -> nothing suppressed");
  a.eq(J(r), J(unset), "false output identical to unset");
});

T("E. riskLevel", "Invalid 'High' (wrong case) fails safe to pending (not suppressed)", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "High" });
  a.eq(r.pending.length, 2, "'High' -> both GDPR pending");
  a.eq(r.suppressed.length, 0, "'High' -> nothing suppressed");
  a.eq(r.deadlines.length, 0, "'High' fires nothing");
  a.eq(P(r, "EU GDPR", "Supervisory Authority")?.citation, "Art. 33 GDPR", "SA pending carries Art.33 citation");
});

T("E. riskLevel", "Invalid ' risk ' (padded) fails safe to pending (not suppressed)", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: " risk " });
  a.eq(r.pending.length, 2, "' risk ' -> both GDPR pending");
  a.eq(r.suppressed.length, 0, "' risk ' -> nothing suppressed");
  a.eq(r.deadlines.length, 0, "' risk ' fires nothing");
});

T("E. riskLevel", "Unknown string fails safe to pending; valid sentinels still behave", (a) => {
  // Guards against the inverse regression: the hardening must not also break
  // the three valid values.
  const junk = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "maybe" });
  a.eq(junk.pending.length, 2, "'maybe' -> pending");
  a.eq(junk.suppressed.length, 0, "'maybe' -> nothing suppressed");
  const unlikely = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "unlikely" });
  a.eq(unlikely.suppressed.length, 2, "'unlikely' still suppresses both");
  const risk = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "risk" });
  a.eq(risk.deadlines.length, 1, "'risk' still fires Art.33");
  a.eq(risk.suppressed.length, 1, "'risk' still risk-suppresses Art.34");
  const high = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "high" });
  a.eq(high.deadlines.length, 2, "'high' still fires both");
});

T("E. riskLevel", "High-risk sensitivity does NOT auto-fire GDPR; riskLevel still governs", (a) => {
  // isHighRisk(['health']) is true, but the engine gates on riskLevel, not sensitivity.
  const unset = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, sensitivity: ["health"] });
  a.eq(unset.pending.length, 2, "health + unset riskLevel -> still pending");
  a.eq(unset.deadlines.length, 0, "health does not auto-fire");
  const unlikely = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, sensitivity: ["health"], riskLevel: "unlikely" });
  a.eq(unlikely.suppressed.length, 2, "health + 'unlikely' -> suppressed (categories don't override)");
});

// =============================================================================
// F. QUICK-MODE PARITY — engine ignores record-only fields; identical output
// =============================================================================

T("F. Parity", "Operative-only facts == operative + record noise (identical engine output)", (a) => {
  const operative = {
    awarenessDate: AW,
    jurisdictions: { ca: true, eu: true },
    residentCounts: { ca: 1000 },
    sensitivity: ["health", "financial"],
    gdprUnintelligibility: "no",
    riskLevel: "risk",
  };
  // Full mode passes the same operative keys plus a pile of record-only fields.
  const full = {
    ...operative,
    sensitivityLabels: ["Health or medical information", "Payment card information"],
    incidentTitle: "ACME breach 2026-05",
    incidentReport: [{ type: "group", title: "Incident summary" }, { type: "field", label: "X", value: "Y" }],
    dataSubjectCategories: [{ name: "Customers", count: 1000, elements: ["Name", "Email"] }],
    howDiscovered: "internal audit",
    randomGarbage: { nested: [1, 2, 3] },
  };
  const rOperative = computeDeadlines(operative);
  const rFull = computeDeadlines(full);
  a.eq(J(rFull), J(rOperative), "engine output identical across quick/full");
});

// =============================================================================
// G. DEGENERATE INPUTS
// =============================================================================

// Structured refusal (JDC 2026-08-22): incomplete facts are REFUSED with
// { error: "incomplete_facts", missing }, never answered with empty buckets.
T("G. Degenerate", "No jurisdictions selected -> structured refusal, not empty buckets", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: {}, sensitivity: ["health"] });
  a.eq(r.error, "incomplete_facts", "refusal shape");
  a.eq(J(r.missing), J(["jurisdictions"]), "missing names jurisdictions");
  a.ok(!("deadlines" in r), "no obligation buckets on a refusal");
});

T("G. Degenerate", "All jurisdiction flags false -> structured refusal", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: false, eu: false, ny: false } });
  a.eq(r.error, "incomplete_facts", "refusal shape");
  a.eq(J(r.missing), J(["jurisdictions"]), "missing names jurisdictions");
});

T("G. Degenerate", "Unknown sensitivity tags are inert in the engine", (a) => {
  // sensitivity feeds only the UI hint/cross-check, never deadline gating.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: 600 }, sensitivity: ["unicorn", "", "??", 42] });
  a.ok(D(r, "California", "California Residents"), "CA individual fires regardless of unknown tags");
  a.ok(D(r, "California", "Attorney General"), "CA AG fires (600>500) regardless of tags");
});

T("G. Degenerate", "Unknown jurisdiction id is ignored; only real ones compute", (a) => {
  // Engine iterates the JURISDICTIONS array, so a bogus 'zz' flag never matches.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true, zz: true, foobar: true }, residentCounts: { ca: 100, zz: 99999 } });
  a.ok(D(r, "California", "California Residents"), "CA fires");
  a.eq(r.deadlines.length, 1, "only CA individual fires; bogus ids produce nothing");
});

T("G. Degenerate", "Extra residentCounts keys for unselected jurisdictions are ignored", (a) => {
  // Analog of 'duplicate data-subject categories', which are record-only and never
  // reach the engine: residentCounts is a flat per-jurisdiction map keyed by id.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { va: true }, residentCounts: { va: 1001, tx: 999999, ny: 999999 } });
  a.ok(D(r, "Virginia", "Consumer Reporting"), "VA CRA fires (1001>1000)");
  a.ok(!D(r, "Texas", "Texas Residents"), "TX not selected -> nothing despite count");
  a.eq(r.deadlines.length, 3, "only VA's 3 obligations (ind+AG+CRA)");
});

T("G. Degenerate", "Missing awarenessDate -> structured refusal (never silently empty)", (a) => {
  const r = computeDeadlines({ jurisdictions: { eu: true, ca: true }, residentCounts: { ca: 1000 }, riskLevel: "high" });
  a.eq(r.error, "incomplete_facts", "refusal shape");
  a.eq(J(r.missing), J(["awarenessDate"]), "missing names awarenessDate only");
});

// =============================================================================
// H. STATUTORY PHRASES — deadline language is data, never engine code.
//    The 2026-07-25 phrase repair moved every deadline phrase into data.js
//    (`deadline_phrase` per obligation); the engine composes the basis as
//    "{citation} — {deadline_phrase}". These cases pin that structurally.
// =============================================================================

T("H. Phrases", "engine.js code (pre-TEST_CASES) contains NO hardcoded deadline-phrase strings", (a) => {
  // Grep-style source assertion. Test-case expectations below TEST_CASES may
  // legitimately quote phrases (they verify data flows through); the engine
  // logic above it must not contain any.
  const src = readFileSync(new URL("../src/breach-clock/engine.js", import.meta.url), "utf8");
  const codeSection = src.split("const TEST_CASES")[0];
  for (const phrase of [
    "without undue delay",
    "without unreasonable delay",
    "no later than",
    "days from",
    "hours from",
    "as soon as practicable",
    "without delaying notice",
  ]) {
    a.ok(!codeSection.includes(phrase), `engine code contains hardcoded "${phrase}"`);
  }
});

T("H. Phrases", "every deadline obligation in data.js declares a non-empty deadline_phrase", (a) => {
  for (const jur of JURISDICTIONS) {
    for (const ob of jur.obligations) {
      if (ob.kind === "service" || ob.kind === "advisory") continue; // no deadline, no phrase
      a.ok(typeof ob.deadline_phrase === "string" && ob.deadline_phrase.length > 0,
        `${jur.id} / ${ob.authority} missing deadline_phrase`);
    }
  }
});

T("H. Phrases", "every fired basis is exactly '{citation} — {deadline_phrase}' from data.js (all ten jurisdictions)", (a) => {
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: Object.fromEntries(JURISDICTIONS.map((j) => [j.id, true])),
    residentCounts: { ca: 100000, tx: 100000, co: 100000, ny: 100000, va: 100000, de: 100000, ct: 100000 },
    riskLevel: "high",
  });
  a.ok(r.deadlines.length > 0, "scenario fires deadlines");
  for (const d of r.deadlines) {
    const jur = JURISDICTIONS.find((j) => j.short === d.jurisdiction);
    const ob = jur?.obligations.find((o) => o.authority === d.authority);
    a.ok(ob, `data.js obligation found for ${d.jurisdiction}/${d.authority}`);
    if (ob) a.eq(d.basis, `${ob.citation} — ${ob.deadline_phrase}`, `${d.jurisdiction}/${d.authority} basis`);
  }
});

T("H. Phrases", "DE AG basis carries the statutory phrase, not the '0 days from notification' artifact", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { de: true }, residentCounts: { de: 501 } });
  const ag = D(r, "Delaware", "Attorney General");
  a.eq(ag?.basis, "6 Del. C. § 12B-102(d) — no later than notice to residents", "DE AG basis");
  a.ok(!ag?.basis.includes("0 days"), "no '0 days' artifact");
});

// =============================================================================
// I. ADDITIVE OUTPUT SHAPE — services/advisories are additive; legacy arrays
//    never carry service or advisory entries (compat between commits 1 and 2).
// =============================================================================

T("I. Additive", "services/advisories present and empty on a plain legacy scenario", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: 1000 }, sensitivity: ["financial"] });
  a.ok(Array.isArray(r.services), "services is an array");
  a.ok(Array.isArray(r.advisories), "advisories is an array");
  a.eq(r.services.length, 0, "no services");
  a.eq(r.advisories.length, 0, "no advisories");
});

T("I. Additive", "service/advisory entries never leak into deadlines/suppressed/pending/review", (a) => {
  // CT + ssn + encryption: service exists and its harbor is satisfied — the
  // service must vanish from `services`, not surface in a legacy bucket.
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: { ct: true, de: true, ma: true },
    residentCounts: { ct: 800, de: 501 },
    sensitivity: ["ssn", "credentials"],
    encrypted: "yes",
    encryptionStrength: "ge_128", // MA's harbor needs the 128-bit floor; CT/DE ignore strength
    keyAcquired: "no",
  });
  const legacy = [...r.deadlines, ...r.suppressed, ...r.pending, ...(r.review || [])];
  for (const entry of legacy) {
    a.ok(!/Credit Monitoring|Identity Theft Prevention|credential/i.test(entry.authority),
      `service/advisory leaked into a legacy bucket: ${entry.jurisdiction}/${entry.authority}`);
  }
  // Declared credential advisories still compute (no encryption gate on advisories).
  a.ok(r.advisories.some((x) => x.jurisdiction === "Delaware"), "DE credential advisory present");
  a.ok(r.advisories.some((x) => x.jurisdiction === "Connecticut"), "CT credential advisory present");
  a.eq(r.services.length, 0, "no service computes under the satisfied harbor");
});

// =============================================================================
// J. HARM-ASSESSMENT GATE (commit 1, 2026-08-02) — "determined_unlikely" is
//    the ONLY suppressing value; harmGate absence is structural inertness
//    (CA/TX/NY/MA/EU/UK); CO carries two deliberately different standards;
//    VA's character is duty_element; encryption+harm double suppression is
//    one entry with both reasons; EU/UK risk behavior is byte-identical
//    under every harmAssessment value.
// =============================================================================

const HARM = (x) => (x?.suppression_reasons || []).find((m) => m.type === "harm");

T("J. Harm", "EU/UK byte-identical under every harmAssessment value, at every riskLevel (no cross-contamination)", (a) => {
  // EU/UK carry no harmGate, so even "determined_unlikely" must leave their
  // output byte-identical — pending, suppressed, and fired states alike.
  for (const riskLevel of ["", "unlikely", "risk", "high"]) {
    const base = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true, uk: true }, riskLevel });
    for (const harmAssessment of ["", "determined_unlikely", "harm_likely", "garbage"]) {
      const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true, uk: true }, riskLevel, harmAssessment });
      a.eq(J(r), J(base), `riskLevel=${J(riskLevel)} harmAssessment=${J(harmAssessment)}`);
    }
  }
});

T("J. Harm", "CA/TX byte-identical under all three harmAssessment values (harmGate absent — structural inertness)", (a) => {
  const facts = { awarenessDate: AW, jurisdictions: { ca: true, tx: true }, residentCounts: { ca: 1000, tx: 20000 }, sensitivity: ["financial"] };
  const base = computeDeadlines(facts);
  for (const v of ["", "determined_unlikely", "harm_likely"]) {
    a.eq(J(computeDeadlines({ ...facts, harmAssessment: v })), J(base), `harmAssessment=${J(v)}`);
  }
});

T("J. Harm", "NY and MA are NEVER harm-suppressed under any harmAssessment value", (a) => {
  // NY at 10000 (>5000) fires all 5; MA fires its count-independent 3; the
  // MA § 3A service still computes on ssn. Nothing lands in suppressed.
  for (const v of ["", "determined_unlikely", "harm_likely"]) {
    const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ny: true, ma: true }, residentCounts: { ny: 10000 }, sensitivity: ["ssn"], harmAssessment: v });
    a.eq(r.suppressed.length, 0, `suppressed empty at ${J(v)}`);
    a.eq(r.deadlines.length, 8, `NY 5 + MA 3 compute at ${J(v)}`);
    a.eq(r.services.length, 1, `MA § 3A service still computes at ${J(v)}`);
  }
});

T("J. Harm", "CO dual standards: residents/CRA carry (2)(a), AG carries (2)(f)(I); the two strings differ", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: 5000 }, harmAssessment: "determined_unlikely" });
  a.eq(r.deadlines.length, 0, "nothing computes");
  a.eq(r.suppressed.length, 3, "residents + AG + CRA suppressed");
  const res = HARM(S(r, "Colorado", "Colorado Residents"));
  const ag = HARM(S(r, "Colorado", "Attorney General"));
  const cra = HARM(S(r, "Colorado", "Consumer Reporting"));
  a.eq(res?.citation, "Colo. Rev. Stat. § 6-1-716(2)(a)", "residents citation");
  a.eq(cra?.citation, "Colo. Rev. Stat. § 6-1-716(2)(a)", "CRA cascades on the resident standard");
  a.eq(ag?.citation, "Colo. Rev. Stat. § 6-1-716(2)(f)(I)", "AG citation");
  a.ok(res?.standard && ag?.standard && res.standard !== ag.standard, "the two standards are different strings");
  a.eq(cra?.standard, res?.standard, "CRA shares the resident standard string");
  a.eq(res?.character, "exemption", "CO character is exemption");
});

T("J. Harm", "VA mechanism character is 'duty_element' on all three obligations", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { va: true }, residentCounts: { va: 5000 }, harmAssessment: "determined_unlikely" });
  a.eq(r.suppressed.length, 3, "all three suppressed");
  a.eq(r.deadlines.length, 0, "nothing computes");
  for (const au of ["Virginia Residents", "Attorney General", "Consumer Reporting"]) {
    a.eq(HARM(S(r, "Virginia", au))?.character, "duty_element", `${au} character`);
  }
});

T("J. Harm", "Encryption + harm double suppression: ONE entry per obligation, reasons [breach_definition, harm]", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["identifiers"], encrypted: "yes", keyAcquired: "no", harmAssessment: "determined_unlikely" });
  a.eq(r.suppressed.length, 2, "CT residents + AG, one entry each");
  for (const au of ["Connecticut Residents", "Attorney General"]) {
    const entries = r.suppressed.filter((x) => x.jurisdiction === "Connecticut" && x.authority.includes(au));
    a.eq(entries.length, 1, `${au}: exactly one suppressed entry`);
    const types = (entries[0]?.suppression_reasons || []).map((m) => m.type);
    a.eq(J(types), J(["breach_definition", "harm"]), `${au} reasons`);
    a.eq(entries[0]?.suppression_type, "breach_definition", `${au} flat type mirrors the first reason`);
  }
});

T("J. Harm", "Harm-excused CT/DE services land in `suppressed` with their mechanism, not silently absent", (a) => {
  // Unlike a satisfied encryption harbor (service silently does not compute),
  // a harm-excused service carries its own statutory excuse: CT cascades via
  // the resident (b)(1) gate; DE's § 12B-102(e) states the carve-out
  // expressly for the service.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ct: true, de: true }, residentCounts: { ct: 800, de: 501 }, sensitivity: ["ssn"], harmAssessment: "determined_unlikely" });
  a.eq(r.services.length, 0, "no service computes");
  a.eq(r.deadlines.length, 0, "no deadlines");
  a.eq(r.suppressed.length, 6, "CT 3 + DE 3");
  const ctSvc = S(r, "Connecticut", "Identity Theft Prevention");
  const deSvc = S(r, "Delaware", "Credit Monitoring");
  a.ok(ctSvc, "CT service suppressed entry present");
  a.ok(deSvc, "DE service suppressed entry present");
  a.eq(HARM(ctSvc)?.citation, "Conn. Gen. Stat. § 36a-701b(b)(1)", "CT service cascades via the (b)(1) gate");
  a.eq(HARM(deSvc)?.citation, "6 Del. C. § 12B-102(e)", "DE service carries its own § 12B-102(e) gate");
});

T("J. Harm", "Only the exact sentinel suppresses: junk values byte-identical to unset", (a) => {
  const facts = { awarenessDate: AW, jurisdictions: { ct: true, co: true, va: true, de: true }, residentCounts: { ct: 800, co: 5000, va: 5000, de: 501 }, sensitivity: ["ssn"] };
  const base = computeDeadlines(facts);
  for (const v of [undefined, null, "", "harm_likely", "DETERMINED_UNLIKELY", " determined_unlikely ", "determined unlikely", true, 1]) {
    a.eq(J(computeDeadlines({ ...facts, harmAssessment: v })), J(base), `harmAssessment=${String(J(v))} inert`);
  }
  const det = computeDeadlines({ ...facts, harmAssessment: "determined_unlikely" });
  a.ok(det.suppressed.length > 0 && det.deadlines.length === 0, "the exact sentinel still suppresses");
});

T("J. Harm", "Harm-only suppression: flat fields mirror the harm mechanism (type, citation, verbatim standard as description)", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { de: true }, residentCounts: { de: 501 }, harmAssessment: "determined_unlikely" });
  const res = S(r, "Delaware", "Delaware Residents");
  a.eq(res?.suppression_type, "harm", "flat type");
  a.eq(res?.suppression_citation, "6 Del. C. § 12B-102(a)", "flat citation");
  a.eq(res?.suppression_description, "unlikely to result in harm to the individuals whose personal information has been breached", "flat description carries the verbatim standard");
  a.eq(J((res?.suppression_reasons || []).map((m) => m.type)), J(["harm"]), "single harm reason");
});

T("J. Harm", "Harm suppression respects thresholds: below-threshold obligations stay silently absent, not suppressed", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { de: true, co: true }, residentCounts: { de: 100, co: 100 }, harmAssessment: "determined_unlikely" });
  a.ok(!S(r, "Delaware", "Attorney General"), "DE AG (gt 500) absent, not suppressed");
  a.ok(!S(r, "Colorado", "Attorney General"), "CO AG (gte 500) absent, not suppressed");
  a.ok(!S(r, "Colorado", "Consumer Reporting"), "CO CRA (gt 1000) absent, not suppressed");
  a.ok(S(r, "Delaware", "Delaware Residents"), "DE residents suppressed");
  a.ok(S(r, "Colorado", "Colorado Residents"), "CO residents suppressed");
  a.eq(r.suppressed.length, 2, "only the two resident obligations");
});

// =============================================================================
// K. CONTINGENT DEADLINES / QUINT-STATE INVARIANT (intake phase 2, 2026-08-15)
//
//    `residentCountUnknown` adds a FIFTH outcome bucket: a threshold-gated
//    obligation whose jurisdiction has no established count is `contingent` —
//    live but for the count — instead of being dropped. The invariant the
//    engine must hold: every obligation the engine EVALUATES lands in exactly
//    one of deadlines / suppressed / pending / review / contingent.
//    Threshold-failures on a KNOWN count remain outside all five (silently
//    absent), and services/advisories stay outside as additive output.
// =============================================================================

// Every non-service, non-advisory obligation declared in data.js, keyed the
// way the buckets key their entries.
const ALL_OBLIGATION_KEYS = (selected) =>
  JURISDICTIONS.filter((j) => selected[j.id]).flatMap((j) =>
    j.obligations
      .filter((o) => o.kind !== "advisory" && o.kind !== "service")
      .map((o) => `${j.short}/${o.authority}`)
  );

const BUCKET_KEYS = (r) => {
  const of = (list) => (list || []).map((x) => `${x.jurisdiction}/${x.authority}`);
  return {
    deadlines: of(r.deadlines),
    suppressed: of(r.suppressed),
    pending: of(r.pending),
    review: of(r.review),
    contingent: of(r.contingent),
  };
};

// Assert the quint-state invariant over one scenario: no obligation in two
// buckets, and every obligation accounted for either by a bucket or by a
// KNOWN below-threshold count (the only permitted silent absence).
function assertQuintState(a, facts, label) {
  const r = computeDeadlines(facts);
  const buckets = BUCKET_KEYS(r);
  const seen = new Map();
  for (const [name, keys] of Object.entries(buckets)) {
    for (const k of keys) {
      if (seen.has(k)) a.ok(false, `${label}: ${k} in both ${seen.get(k)} and ${name}`);
      seen.set(k, name);
    }
  }
  const belowKnownThreshold = new Set(
    JURISDICTIONS.filter((j) => facts.jurisdictions[j.id]).flatMap((j) => {
      const raw = facts.residentCounts?.[j.id];
      const n = typeof raw === "number" ? raw : parseInt(raw, 10);
      return j.obligations
        .filter((o) => {
          if (o.gating?.residentThreshold === undefined) return false;
          if (!Number.isFinite(n)) return !facts.residentCountUnknown?.[j.id];
          return (o.gating.comparator || "gte") === "gt" ? !(n > o.gating.residentThreshold) : !(n >= o.gating.residentThreshold);
        })
        .map((o) => `${j.short}/${o.authority}`);
    })
  );
  for (const k of ALL_OBLIGATION_KEYS(facts.jurisdictions)) {
    if (seen.has(k) || belowKnownThreshold.has(k)) continue;
    // Dependent obligations whose parent never fired are the one other
    // permitted absence; none of these scenarios produces that.
    a.ok(false, `${label}: ${k} landed in no bucket and is not a threshold failure`);
  }
  return r;
}

T("K. Contingent", "Quint-state invariant holds; all five buckets are exercised across the scenario set", (a) => {
  // The five buckets cannot all co-occur under the current data model, and
  // that is a property of the DATA, not of the invariant: `review` exists only
  // through MA's encryption harbor, and those same encryption facts satisfy
  // every other US state's harbor (suppressing them) — so a review scenario's
  // firing obligations can only be EU/UK Art. 33, which requires a riskLevel,
  // which empties `pending`. Two scenarios therefore span the five; the
  // invariant is asserted on each.
  const scenarios = [
    // deadlines + suppressed + pending + contingent: EU awaiting a risk
    // assessment, CT harm-suppressed, CA unknown count (residents fire, AG
    // contingent).
    ["four-bucket", {
      awarenessDate: AW,
      jurisdictions: { ca: true, ct: true, eu: true },
      residentCountUnknown: { ca: true },
      residentCounts: { ct: 800 },
      sensitivity: ["identifiers"],
      harmAssessment: "determined_unlikely",
    }],
    // deadlines + suppressed + review: EU Art. 33 fires, CA/CO encryption-
    // suppressed, MA in counsel review. Unknown counts are set on the
    // suppressed states to prove suppression outranks contingency here too.
    ["review-scenario", {
      awarenessDate: AW,
      jurisdictions: { ca: true, co: true, ma: true, eu: true },
      residentCountUnknown: { ca: true, co: true },
      sensitivity: ["financial"],
      riskLevel: "risk",
      encrypted: "yes",
      encryptionStrength: "ge_128",
      keyAcquired: "no",
    }],
  ];
  const exercised = new Set();
  for (const [label, facts] of scenarios) {
    const r = assertQuintState(a, facts, label);
    for (const [name, keys] of Object.entries(BUCKET_KEYS(r))) {
      if (keys.length) exercised.add(name);
    }
  }
  for (const bucket of ["deadlines", "suppressed", "pending", "review", "contingent"]) {
    a.ok(exercised.has(bucket), `bucket ${bucket} exercised by the scenario set`);
  }
});

T("K. Contingent", "Quint-state invariant holds with every modeled jurisdiction and mixed count states", (a) => {
  assertQuintState(a, {
    awarenessDate: AW,
    jurisdictions: { eu: true, uk: true, ca: true, tx: true, co: true, ma: true, ny: true, va: true, de: true, ct: true },
    residentCounts: { ca: 501, tx: 100, ny: 5000 },
    residentCountUnknown: { co: true, va: true, de: true },
    sensitivity: ["identifiers", "ssn"],
    riskLevel: "high",
  }, "all-jurisdictions");
});

T("K. Contingent", "Threshold failures on a KNOWN count stay out of all five buckets (unchanged)", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: 100 } });
  a.eq(r.contingent.length, 0, "no contingent entries on a known count");
  a.ok(!D(r, "Colorado", "Attorney General"), "CO AG absent");
  a.ok(!S(r, "Colorado", "Attorney General"), "CO AG not suppressed");
});

T("K. Contingent", "Numeric count beats the unknown flag; 0 is a real count, not unknown", (a) => {
  const stale = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: 5000 }, residentCountUnknown: { co: true } });
  a.eq(stale.contingent.length, 0, "numeric count wins over a stale flag");
  a.ok(D(stale, "Colorado", "Attorney General"), "CO AG fires on the numeric count");
  const zero = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: 0 }, residentCountUnknown: { co: true } });
  a.eq(zero.contingent.length, 0, "0 is an established count, not unknown");
  a.ok(!D(zero, "Colorado", "Attorney General"), "CO AG does not fire at 0");
});

T("K. Contingent", "Unparseable count with the flag set IS contingent ('abc' establishes nothing)", (a) => {
  // parseInt('abc') is NaN, so nothing is established — the flag governs.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { co: true }, residentCounts: { co: "abc" }, residentCountUnknown: { co: true } });
  a.eq(r.contingent.length, 2, "CO AG + CRA contingent");
});

T("K. Contingent", "Falsy / malformed flag values never create contingency", (a) => {
  const base = { awarenessDate: AW, jurisdictions: { co: true } };
  for (const flags of [{ co: false }, { co: 0 }, { co: "" }, { co: null }, { co: undefined }, {}]) {
    const r = computeDeadlines({ ...base, residentCountUnknown: flags });
    a.eq(r.contingent.length, 0, `flag ${J(flags)} -> no contingent entries`);
  }
});

T("K. Contingent", "Suppression outranks contingency (encryption AND harm), review too", (a) => {
  const enc = computeDeadlines({
    awarenessDate: AW, jurisdictions: { co: true }, residentCountUnknown: { co: true },
    sensitivity: ["financial"], encrypted: "yes", keyAcquired: "no",
  });
  a.eq(enc.contingent.length, 0, "encryption-suppressed -> nothing contingent");
  a.eq(enc.suppressed.length, 3, "all three CO obligations suppressed");
  const harm = computeDeadlines({
    awarenessDate: AW, jurisdictions: { co: true }, residentCountUnknown: { co: true },
    harmAssessment: "determined_unlikely",
  });
  a.eq(harm.contingent.length, 0, "harm-suppressed -> nothing contingent");
  a.eq(harm.suppressed.length, 3, "all three CO obligations harm-suppressed");
});

T("K. Contingent", "Conditional deadlines use the obligation's own clock, dependents included", (a) => {
  // CA AG = resident clock (+30d) + 15d = +45d; DE AG = resident clock (+60d)
  // + 0h; CO AG = +30d from awareness; CO CRA has no fixed clock -> null.
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: { ca: true, de: true, co: true },
    residentCountUnknown: { ca: true, de: true, co: true },
  });
  const C = (j, au) => r.contingent.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
  a.eq(ISO(C("California", "Attorney General")?.conditional_deadline), "2026-06-15T09:00:00.000Z", "CA AG +45d");
  a.eq(ISO(C("Delaware", "Attorney General")?.conditional_deadline), "2026-06-30T09:00:00.000Z", "DE AG +60d");
  a.eq(ISO(C("Colorado", "Attorney General")?.conditional_deadline), "2026-05-31T09:00:00.000Z", "CO AG +30d");
  a.eq(C("Colorado", "Consumer Reporting")?.conditional_deadline, null, "CO CRA has no fixed clock");
});

T("K. Contingent", "Condition sentences use exact comparator semantics and never engine vocabulary", (a) => {
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: { ca: true, co: true, tx: true },
    residentCountUnknown: { ca: true, co: true, tx: true },
  });
  const C = (j, au) => r.contingent.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
  a.eq(C("California", "Attorney General")?.condition,
    "Notice is required if more than 500 California residents are affected.", "CA gt sentence");
  a.eq(C("Colorado", "Attorney General")?.condition,
    "Notice is required if 500 or more Colorado residents are affected.", "CO gte sentence");
  a.eq(C("Texas", "Consumer Reporting")?.condition,
    "Notice is required if more than 10,000 Texas residents are affected.", "TX CRA gt sentence");
  for (const c of r.contingent) {
    a.ok(!/\bfires?\b|\bgates?\b|\btriggered\b|suppress/i.test(c.condition), `engine vocabulary in condition: ${c.condition}`);
    a.eq(c.comparator, c.comparator === "gt" ? "gt" : "gte", "comparator carried through");
  }
});

T("K. Contingent", "Record noise + residentCountUnknown: engine output identical to the operative set alone", (a) => {
  // The parity property of group F, extended to the new operative key: the
  // flag map is operative and must survive, while record-only fields around
  // it change nothing.
  const operative = {
    awarenessDate: AW,
    jurisdictions: { co: true, ca: true, eu: true },
    residentCounts: { ca: 1000 },
    residentCountUnknown: { co: true },
    sensitivity: ["identifiers"],
    riskLevel: "risk",
  };
  const full = {
    ...operative,
    sensitivityLabels: ["Identifiers (name, email, address)"],
    incidentTitle: "ACME breach 2026-08",
    incidentReport: [{ type: "group", title: "Incident summary" }, { type: "field", label: "X", value: "Y" }],
    residentCountUnknownNote: "counsel is still reconciling the export",
    dataSubjectCategories: [{ name: "Customers", count: 1000, elements: ["Name"] }],
    randomGarbage: { nested: [1, 2, 3] },
  };
  a.eq(J(computeDeadlines(full)), J(computeDeadlines(operative)), "record noise never changes engine output");
  // And the flag genuinely mattered — parity is not passing because both sides
  // ignore it.
  const withoutFlag = computeDeadlines({ ...operative, residentCountUnknown: {} });
  a.ok(J(withoutFlag) !== J(computeDeadlines(operative)), "the flag is operative, not inert");
});

// =============================================================================
// L. STRUCTURED REFUSAL + DETERMINISM HARDENING (serverless bundle, 2026-08-22)
// =============================================================================
//
// Contract: a malformed or incomplete facts object can NEVER produce an
// empty-but-valid result. Either the engine refuses ({ error:
// "incomplete_facts", missing }) or it evaluates real facts — and every
// evaluated result carries ruleset_version.

const isRefusal = (r) => r && r.error === "incomplete_facts" && Array.isArray(r.missing) && r.missing.length > 0 && !("deadlines" in r);
const isEmptyValid = (r) => r && !r.error && Array.isArray(r.deadlines) &&
  r.deadlines.length + r.suppressed.length + r.pending.length + (r.review || []).length + (r.contingent || []).length === 0;

T("L. Refusal", "Every malformed facts object is refused — none yields an empty-but-valid result", (a) => {
  const malformed = [
    undefined, null, {}, [], "facts", 42,
    { jurisdictions: { ca: true } },                                  // no awareness at all
    { awarenessDate: null, jurisdictions: { ca: true } },
    { awarenessDate: "2026-05-01T09:00:00Z", jurisdictions: { ca: true } }, // string, not Date
    { awarenessDate: 1777626000000, jurisdictions: { ca: true } },    // epoch number, not Date
    { awarenessDate: new Date("garbage"), jurisdictions: { ca: true } }, // Invalid Date
    { awarenessDate: AW },                                            // no jurisdictions key
    { awarenessDate: AW, jurisdictions: null },
    { awarenessDate: AW, jurisdictions: "ca" },
    { awarenessDate: AW, jurisdictions: [] },
    { awarenessDate: AW, jurisdictions: {} },
    { awarenessDate: AW, jurisdictions: { ca: false, tx: 0, ny: "" } },
    { awarenessDate: AW, jurisdictions: { zz: true, foobar: true } }, // only unmodeled ids
  ];
  malformed.forEach((facts, i) => {
    let r;
    try { r = computeDeadlines(facts); } catch (e) { a.ok(false, `case ${i} threw: ${e.message}`); return; }
    a.ok(isRefusal(r), `case ${i} (${J(facts) ?? String(facts)}) must be refused; got ${J(r)}`);
    a.ok(!isEmptyValid(r), `case ${i} must never be empty-but-valid`);
  });
});

T("L. Refusal", "Refusal names exactly what is missing, in a stable order", (a) => {
  a.eq(J(computeDeadlines({ jurisdictions: { ca: true } }).missing), J(["awarenessDate"]), "awareness only");
  a.eq(J(computeDeadlines({ awarenessDate: AW, jurisdictions: {} }).missing), J(["jurisdictions"]), "jurisdictions only");
  a.eq(J(computeDeadlines({}).missing), J(["awarenessDate", "jurisdictions"]), "both, awareness first");
  a.eq(computeDeadlines({}).ruleset_version, RULESET_VERSION, "refusal still identifies the ruleset");
});

T("L. Refusal", "The facts boundary never manufactures an instant: a zone-less or malformed payload refuses downstream", (a) => {
  const payloads = [
    {},                                                                    // nothing
    { awareness: "", jurisdictions: { ca: true } },
    { awareness: "not a date", awarenessTz: "America/Chicago", jurisdictions: { ca: true } },
    { awareness: "2026-02-30T09:00", awarenessTz: "America/Chicago", jurisdictions: { ca: true } }, // impossible day
    { awareness: "2026-05-01T09:00", awarenessTz: "America/Chicago", jurisdictions: {} },
  ];
  payloads.forEach((p, i) => {
    const r = computeDeadlines(factsFromPayload(p));
    a.ok(isRefusal(r), `payload ${i} (${J(p)}) must be refused; got ${J(r)}`);
  });
});

T("L. Refusal", "Complete facts are never refused and carry ruleset_version", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: 1 } });
  a.ok(!r.error, "no refusal");
  a.eq(r.ruleset_version, RULESET_VERSION, "ruleset_version present");
  a.ok(r.deadlines.length > 0, "CA residents obligation computes");
  // A modeled jurisdiction alongside junk ids is complete (junk is ignored).
  const mixed = computeDeadlines({ awarenessDate: AW, jurisdictions: { zz: true, ca: true }, residentCounts: { ca: 1 } });
  a.ok(!mixed.error, "junk ids beside a real one do not trigger refusal");
});

T("L. Refusal", "Zone-explicit payload resolves at the facts boundary; the engine sees one instant", (a) => {
  // 09:00 Chicago (CDT, UTC-5) on 2026-05-01 = 14:00Z. Same instant the
  // legacy harness anchors at 09:00Z would NOT be — so the two differ by 5h.
  const zoned = computeDeadlines(factsFromPayload({ awareness: "2026-05-01T09:00", awarenessTz: "America/Chicago", jurisdictions: { co: true }, residentCounts: { co: 1 } }));
  const utc = computeDeadlines(factsFromPayload({ awareness: "2026-05-01T09:00", awarenessTz: "UTC", jurisdictions: { co: true }, residentCounts: { co: 1 } }));
  const dz = D(zoned, "Colorado", "Colorado Residents").deadline.getTime();
  const du = D(utc, "Colorado", "Colorado Residents").deadline.getTime();
  a.eq(dz - du, 5 * 3600 * 1000, "Chicago awareness lands 5h after the UTC reading of the same wall time");
  a.eq(ISO(D(utc, "Colorado", "Colorado Residents").deadline), "2026-05-31T09:00:00.000Z", "30 days from 09:00Z");
});

T("L. Hardening", "JURISDICTIONS is deep-frozen — a write throws and the ruleset is unchanged", (a) => {
  const before = J(JURISDICTIONS);
  let threw = false;
  try { JURISDICTIONS[0].obligations[0].deadline_hours = 1; } catch { threw = true; }
  try { JURISDICTIONS.push({ id: "zz" }); } catch { threw = true; }
  a.ok(threw, "mutation attempt throws under strict-mode ESM");
  a.eq(J(JURISDICTIONS), before, "ruleset byte-identical after the attempt");
});

T("L. Hardening", "No output entry carries an internal association field", (a) => {
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: Object.fromEntries(JURISDICTIONS.map((j) => [j.id, true])),
    residentCounts: { ca: 1000 },
    residentCountUnknown: { co: true, tx: true },
    sensitivity: ["ssn"],
  });
  const all = [...r.deadlines, ...r.suppressed, ...r.pending, ...r.review, ...r.contingent, ...r.services, ...r.advisories];
  a.ok(all.length > 0, "scenario produced output");
  for (const e of all) {
    for (const k of Object.keys(e)) a.ok(!k.startsWith("_"), `internal key ${k} leaked on ${e.jurisdiction}/${e.authority}`);
  }
  a.ok(r.pending.every((p) => !("_jurId" in p)), "pending entries carry no _jurId");
});

T("L. Hardening", "Threshold phrases are locale-pinned (en-US grouping) and zone-free", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: true }, residentCounts: { ca: 1234567 }, sensitivity: ["health"] });
  const ag = D(r, "California", "Attorney General");
  a.ok(ag && ag.conditional.includes("1,234,567"), `count grouped en-US: ${ag && ag.conditional}`);
  a.ok(ag && ag.conditional.includes("more than 500"), "threshold phrase intact");
});

// =============================================================================
// REPORT
// =============================================================================

const groups = [...new Set(results.map((r) => r.group))];
let failed = 0;
console.log("\nADVERSARIAL ENGINE TEST PASS\n" + "=".repeat(72));
for (const g of groups) {
  console.log(`\n${g}`);
  for (const r of results.filter((x) => x.group === g)) {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log(`  [${tag}] ${r.name}`);
    if (!r.pass) console.log(`         -> ${r.detail}`);
  }
}
console.log("\n" + "=".repeat(72));
console.log(`TOTAL: ${results.length}   PASS: ${results.length - failed}   FAIL: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
