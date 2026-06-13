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

import { computeDeadlines } from "../src/breach-clock/engine.js";

// --- Fixtures ----------------------------------------------------------------

// Default awareness: same instant the in-file harness uses, for continuity.
const AW = new Date("2026-05-01T09:00:00.000Z");

// --- Bucket finders (mirror the engine's output shape) -----------------------
// deadlines/suppressed/pending entries are keyed by `jurisdiction` (jur.short)
// and `authority` (ob.authority).
const D = (r, j, au) => r.deadlines.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
const S = (r, j, au) => r.suppressed.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
const P = (r, j, au) => r.pending.find((x) => x.jurisdiction === j && x.authority.toLowerCase().includes(au.toLowerCase()));
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

T("A. Mixed", "All EIGHT, riskLevel high + encryption (global suppression)", (a) => {
  // Encryption is global. Order is risk -> threshold -> encryption.
  //   GDPR Art.33 has no encryption mechanism -> fires (EU SA + UK ICO) = 2 deadlines.
  //   GDPR Art.34 (high meets risk, then encryption) -> unintelligibility-suppressed x2.
  //   Every US obligation whose threshold is met -> breach_definition-suppressed.
  // Counts: ca1000, tx20000, co5000, ny6000, va2000 -> all thresholds met.
  //   Suppressed US: CA 2, TX 3, CO 3, MA 3, NY 5, VA 3 = 19; +2 GDPR DS = 21.
  const r = computeDeadlines({
    awarenessDate: AW,
    jurisdictions: { eu: true, uk: true, ca: true, tx: true, co: true, ma: true, ny: true, va: true },
    residentCounts: { ca: 1000, tx: 20000, co: 5000, ny: 6000, va: 2000 },
    riskLevel: "high",
    encryptionApplied: true,
  });
  a.eq(r.deadlines.length, 2, "deadlines count (EU SA + UK ICO only)");
  a.eq(r.pending.length, 0, "pending count");
  a.eq(r.suppressed.length, 21, "suppressed count");
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
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "unlikely", encryptionApplied: true });
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
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "risk", encryptionApplied: true });
  a.ok(D(r, "EU GDPR", "Supervisory Authority"), "EU SA fires (72h, no encryption mechanism)");
  const ds = S(r, "EU GDPR", "Data Subjects");
  a.eq(ds?.suppression_type, "risk_assessment", "DS suppression type");
  a.eq(ds?.suppression_citation, "Art. 34 GDPR", "DS citation is risk citation, not 34(3)(a)");
});

T("B. Ordering", "Art.34 'high' + encryption -> ENCRYPTION wins (risk satisfied, citation 34(3)(a))", (a) => {
  // riskLevel high satisfies Art.34's risk gate, so it falls through to the encryption
  // block; encryption then suppresses via unintelligibility with citation Art.34(3)(a) GDPR.
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { eu: true }, riskLevel: "high", encryptionApplied: true });
  a.ok(D(r, "EU GDPR", "Supervisory Authority"), "EU SA fires");
  const ds = S(r, "EU GDPR", "Data Subjects");
  a.eq(ds?.suppression_type, "unintelligibility_exemption", "DS suppression type");
  a.eq(ds?.suppression_citation, "Art. 34(3)(a) GDPR", "DS citation");
});

T("B. Ordering", "UK Art.34 'unlikely' + encryption -> RISK wins (citation Art.34 UK GDPR)", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { uk: true }, riskLevel: "unlikely", encryptionApplied: true });
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
    encryptionApplied: false,
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

T("G. Degenerate", "No jurisdictions selected -> all buckets empty", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: {}, sensitivity: ["health"] });
  a.eq(r.deadlines.length, 0, "no deadlines");
  a.eq(r.suppressed.length, 0, "no suppressed");
  a.eq(r.pending.length, 0, "no pending");
});

T("G. Degenerate", "All jurisdiction flags false -> empty", (a) => {
  const r = computeDeadlines({ awarenessDate: AW, jurisdictions: { ca: false, eu: false, ny: false } });
  a.eq(r.deadlines.length + r.suppressed.length + r.pending.length, 0, "everything empty");
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

T("G. Degenerate", "Missing awarenessDate -> empty buckets (engine short-circuits)", (a) => {
  const r = computeDeadlines({ jurisdictions: { eu: true, ca: true }, residentCounts: { ca: 1000 }, riskLevel: "high" });
  a.eq(r.deadlines.length + r.suppressed.length + r.pending.length, 0, "no awareness -> nothing");
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
