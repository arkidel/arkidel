// =============================================================================
// PURE RULES ENGINE — module scope, no React state.
//
// These are the functions the test harness calls directly. The component
// consumes them through the same interface, so anything that's testable
// here is also testable as it actually runs in the UI.
//
// Three concerns live in this file:
//   1. The `isHighRisk` and `computeDeadlines` functions (pure, deterministic).
//   2. The `TEST_CASES` array — the test harness, with full coverage of
//      threshold boundaries, dependent deadlines, and encryption suppression.
//   3. The `runTests` function that executes the test suite and returns
//      categorised pass/fail results for the in-app Tests view.
// =============================================================================

import { JURISDICTIONS } from "./data.js";

const HIGH_RISK_CATEGORIES = ["gov_id", "financial", "health", "biometric", "children", "special", "credentials"];

function isHighRisk(sensitivity) {
  if (!Array.isArray(sensitivity)) return false;
  return sensitivity.some((s) => HIGH_RISK_CATEGORIES.includes(s));
}

/**
 * Pure deadline-builder. Produces the same arrays the UI renders, given a
 * facts object. No dependence on React state.
 *
 * @param {Object} facts
 * @param {Date}   facts.awarenessDate       - Required.
 * @param {Object} facts.jurisdictions       - { [id]: boolean } map of selected jurisdictions.
 * @param {Object} [facts.residentCounts]    - { [id]: number|string } resident counts per jurisdiction.
 * @param {string[]} [facts.sensitivity]     - Array of sensitivity category ids.
 * @param {boolean} [facts.encryptionApplied] - Whether the data was encrypted with industry-standard encryption AND the key was not compromised.
 * @returns {{deadlines: Array, suppressed: Array}}
 *   deadlines  — obligations that fire under the facts.
 *   suppressed — obligations that would have fired but were suppressed because
 *                encryption was reported. Each suppressed entry includes the
 *                citation for the suppression mechanism (either definitional
 *                breach exclusion or unintelligibility-of-data exemption), so the UI
 *                can render an explanatory card.
 *
 * Obligations may declare `deadline_relative_to: { parent_authority: "..." }` to specify
 * that their deadline runs from another obligation's deadline, not from awareness.
 * Used for cascading clocks (e.g., California's 15-day AG notification clock that
 * runs from the date of resident notification). If the parent doesn't fire, the
 * dependent obligation does not fire either.
 */
function computeDeadlines(facts) {
  const { awarenessDate, jurisdictions = {}, residentCounts = {}, sensitivity = [], encryptionApplied = false, riskLevel } = facts;
  const deadlines = [];
  const suppressed = [];
  const pending = [];
  if (!awarenessDate) return { deadlines, suppressed, pending };

  // Two-pass build:
  //   Pass 1 — collect obligations that fire, computing deadlines that anchor
  //            on awarenessDate. Obligations with `deadline_relative_to` get a
  //            null deadline placeholder; they're resolved in pass 2.
  //   Pass 2 — for each placeholder, look up the parent obligation (by authority,
  //            within the same jurisdiction) and compute the dependent deadline.
  //            If the parent didn't fire, or the parent has no fixed deadline,
  //            the dependent has no anchor → suppressed silently (do not fire).

  // Pass 1
  JURISDICTIONS.forEach((jur) => {
    if (!jurisdictions[jur.id]) return;
    const residentCountRaw = residentCounts[jur.id];
    const residentCount = residentCountRaw === undefined || residentCountRaw === null || residentCountRaw === ""
      ? NaN
      : (typeof residentCountRaw === "number" ? residentCountRaw : parseInt(residentCountRaw, 10));

    jur.obligations.forEach((ob) => {
      // Risk-assessment gating — engages only for obligations that declare
      // gating.riskRequired or gating.highRiskRequired (the GDPR authority and
      // individual notifications). US obligations gate on residentThreshold and
      // are left untouched here, which is what permits mixed states: a US state
      // can fire while EU/UK sit pending awaiting a risk assessment.
      //
      // Threshold:
      //   riskRequired     → met when riskLevel is "risk" or "high"
      //   highRiskRequired → met when riskLevel is "high"
      // Outcomes:
      //   riskLevel unset       → pending (the assessment hasn't been made yet)
      //   set but not met       → suppressed (risk_assessment mechanism)
      //   met                   → fall through to encryption check + deadline push
      // This runs BEFORE the encryption block, so a not-"high" individual
      // obligation is risk-suppressed, never encryption-suppressed.
      if (ob.gating?.riskRequired || ob.gating?.highRiskRequired) {
        if (riskLevel === undefined || riskLevel === null || riskLevel === "") {
          pending.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            citation: ob.citation,
            source_url: ob.source_url,
            statute: jur.statute,
            _jurId: jur.id,
          });
          return;
        }
        const thresholdMet = ob.gating.highRiskRequired
          ? riskLevel === "high"
          : riskLevel === "risk" || riskLevel === "high";
        if (!thresholdMet) {
          suppressed.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            original_citation: ob.citation,
            suppression_type: "risk_assessment",
            suppression_citation: ob.riskSuppression.citation,
            suppression_description: ob.riskSuppression.description,
            source_url: ob.source_url,
            statute: jur.statute,
          });
          return;
        }
      }
      if (ob.gating?.residentThreshold !== undefined) {
        const threshold = ob.gating.residentThreshold;
        const comparator = ob.gating.comparator || "gte";
        if (isNaN(residentCount)) return;
        const met = comparator === "gt" ? residentCount > threshold : residentCount >= threshold;
        if (!met) return;
      }

      // Encryption suppression — split into two distinct legal mechanisms:
      //
      //   1. breachDefinitionExcludesEncrypted: per-se statutory rule. The
      //      jurisdiction's definition of "breach" excludes encrypted data
      //      with uncompromised key (MA, CA, TX, CO). When encryption is
      //      reported, the obligation does not arise as a matter of statutory
      //      text. UI label: "Statutory breach definition excludes encrypted data".
      //
      //   2. obligationExemptedByUnintelligibility: judgment-based exemption.
      //      The obligation exists but is exempted when the controller
      //      implemented appropriate technical and organisational measures
      //      rendering the data unintelligible (EU GDPR Art. 34(3)(a), UK).
      //      Encryption is the canonical example of such a measure, not the
      //      only way. UI label: "Exempted by unintelligibility-of-data
      //      provision (encryption is the canonical example)".
      //
      // Both produce the same engine behavior (suppress the obligation), but
      // the suppressed-card text and memo language must distinguish them.
      if (encryptionApplied) {
        let suppressionMechanism = null;
        if (ob.breachDefinitionExcludesEncrypted?.applies) {
          suppressionMechanism = {
            type: "breach_definition",
            citation: ob.breachDefinitionExcludesEncrypted.citation,
            description: ob.breachDefinitionExcludesEncrypted.description,
          };
        } else if (ob.obligationExemptedByUnintelligibility?.applies) {
          suppressionMechanism = {
            type: "unintelligibility_exemption",
            citation: ob.obligationExemptedByUnintelligibility.citation,
            description: ob.obligationExemptedByUnintelligibility.description,
          };
        }
        if (suppressionMechanism) {
          suppressed.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            original_citation: ob.citation,
            suppression_type: suppressionMechanism.type,
            suppression_citation: suppressionMechanism.citation,
            suppression_description: suppressionMechanism.description,
            source_url: ob.source_url,
            statute: jur.statute,
          });
          return;
        }
      }

      // Compute deadline. Dependent obligations get null in pass 1 and are
      // resolved in pass 2.
      let deadline = null;
      if (!ob.deadline_relative_to) {
        if (ob.deadline_hours !== null && ob.deadline_hours !== undefined) {
          deadline = new Date(awarenessDate.getTime() + ob.deadline_hours * 3600 * 1000);
        }
      }

      // Build basis text. For dependent obligations, the trigger references the
      // parent authority; for absolute obligations, it references the trigger event.
      const basisParts = [ob.citation];
      if (ob.deadline_hours !== null && ob.deadline_hours !== undefined) {
        const h = ob.deadline_hours;
        const label = h % 24 === 0 ? `${h / 24} days` : `${h} hours`;
        const triggerLabel = ob.deadline_relative_to
          ? `notification of ${ob.deadline_relative_to.parent_authority}`
          : ob.deadline_trigger;
        basisParts.push(`${label} from ${triggerLabel}`);
      } else {
        basisParts.push("without undue delay");
      }
      const basis = basisParts.join(" — ");

      let conditional = ob.condition || "";
      if (ob.gating?.residentThreshold !== undefined && !isNaN(residentCount)) {
        const threshold = ob.gating.residentThreshold;
        const comparator = ob.gating.comparator || "gte";
        const thresholdPhrase = comparator === "gt"
          ? `more than ${threshold.toLocaleString()}`
          : `${threshold.toLocaleString()} or more`;
        conditional = `${conditional} Triggered: ${residentCount.toLocaleString()} ${jur.short} residents affected (threshold: ${thresholdPhrase}).`;
      }

      deadlines.push({
        jurisdiction: jur.short,
        authority: ob.authority,
        deadline,
        basis,
        conditional: conditional.trim(),
        source_url: ob.source_url,
        statute: jur.statute,
        // Internal — used in pass 2. Stripped before return.
        _jurId: jur.id,
        _deadlineRelativeTo: ob.deadline_relative_to || null,
        _deadlineHours: ob.deadline_hours,
      });
    });
  });

  // Pass 2 — resolve dependent deadlines. Iterate in place; if a dependent's
  // parent didn't fire (or has no fixed deadline), drop the dependent.
  const resolved = [];
  deadlines.forEach((d) => {
    if (!d._deadlineRelativeTo) {
      resolved.push(d);
      return;
    }
    const parent = deadlines.find(
      (p) => p._jurId === d._jurId && p.authority === d._deadlineRelativeTo.parent_authority
    );
    if (!parent || !parent.deadline) {
      // Parent didn't fire or has no fixed deadline — dependent has no anchor.
      // Drop silently (this is correct: if the resident notification doesn't
      // happen, the AG follow-up clock never starts).
      return;
    }
    if (d._deadlineHours !== null && d._deadlineHours !== undefined) {
      d.deadline = new Date(parent.deadline.getTime() + d._deadlineHours * 3600 * 1000);
    }
    resolved.push(d);
  });

  // Strip internal fields before returning.
  const cleaned = resolved.map((d) => {
    const { _jurId, _deadlineRelativeTo, _deadlineHours, ...rest } = d;
    return rest;
  });

  return { deadlines: cleaned, suppressed, pending };
}


// =============================================================================
// TEST HARNESS — runs entirely in-browser, in-artifact.
// Each case is a (facts → expectation) pair. Expectations are functions, so
// we can express "should fire", "should not fire", "should have N deadlines",
// or arbitrary structural checks without inventing a DSL.
//
// To add a test: append an object to TEST_CASES below. To add a category,
// just use a new `category` string — categories are derived from the data.
// =============================================================================

// Fixed reference time so tests are deterministic. May 1, 2026, 09:00 UTC.
const TEST_AWARENESS = new Date("2026-05-01T09:00:00.000Z");

// --- Expectation helpers -----------------------------------------------------

const findDeadline = (deadlines, jurisdiction, authoritySubstring) =>
  deadlines.find(
    (d) =>
      d.jurisdiction === jurisdiction &&
      d.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );

const expectFires = (jurisdiction, authoritySubstring) => (deadlines) => {
  const found = findDeadline(deadlines, jurisdiction, authoritySubstring);
  return found
    ? { pass: true }
    : { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to fire; got ${deadlines.length} deadlines: ${deadlines.map((d) => `${d.jurisdiction}/${d.authority}`).join(" | ")}` };
};

const expectDoesNotFire = (jurisdiction, authoritySubstring) => (deadlines) => {
  const found = findDeadline(deadlines, jurisdiction, authoritySubstring);
  return found
    ? { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" NOT to fire; but it did (${found.basis})` }
    : { pass: true };
};

const expectCount = (n) => (deadlines) =>
  deadlines.length === n
    ? { pass: true }
    : { pass: false, message: `Expected ${n} deadlines; got ${deadlines.length}` };

const expectAll = (...checks) => (deadlines, suppressed, pending) => {
  const failures = checks
    .map((c) => c(deadlines, suppressed, pending))
    .filter((r) => !r.pass)
    .map((r) => r.message);
  return failures.length === 0
    ? { pass: true }
    : { pass: false, message: failures.join("; ") };
};

const expectDeadlineHoursFromAwareness = (jurisdiction, authoritySubstring, expectedHours) => (deadlines) => {
  const found = findDeadline(deadlines, jurisdiction, authoritySubstring);
  if (!found) return { pass: false, message: `${jurisdiction} / ${authoritySubstring} not found` };
  if (!found.deadline) return { pass: false, message: `${jurisdiction} / ${authoritySubstring} has no fixed deadline` };
  const actualHours = (found.deadline.getTime() - TEST_AWARENESS.getTime()) / (3600 * 1000);
  return Math.abs(actualHours - expectedHours) < 0.01
    ? { pass: true }
    : { pass: false, message: `Expected ${expectedHours}h deadline; got ${actualHours.toFixed(2)}h` };
};

const expectSuppressed = (jurisdiction, authoritySubstring, suppressionType) => (deadlines, suppressed = []) => {
  const found = suppressed.find(
    (s) => s.jurisdiction === jurisdiction && s.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  if (!found) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to be suppressed; got ${suppressed.length} suppressions: ${suppressed.map((s) => `${s.jurisdiction}/${s.authority}`).join(" | ")}` };
  }
  if (suppressionType !== undefined && found.suppression_type !== suppressionType) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" suppression_type "${suppressionType}"; got "${found.suppression_type}"` };
  }
  return { pass: true };
};

const expectPending = (jurisdiction, authoritySubstring) => (deadlines, suppressed = [], pending = []) => {
  const found = pending.find(
    (p) => p.jurisdiction === jurisdiction && p.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  return found
    ? { pass: true }
    : { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to be pending; got ${pending.length} pending: ${pending.map((p) => `${p.jurisdiction}/${p.authority}`).join(" | ")}` };
};

const expectNotSuppressed = (jurisdiction, authoritySubstring) => (deadlines, suppressed = []) => {
  const found = suppressed.find(
    (s) => s.jurisdiction === jurisdiction && s.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  return found
    ? { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" NOT to be suppressed; but it was (${found.suppression_citation})` }
    : { pass: true };
};

const expectSuppressedCount = (n) => (deadlines, suppressed = []) =>
  suppressed.length === n
    ? { pass: true }
    : { pass: false, message: `Expected ${n} suppressed obligations; got ${suppressed.length}` };



// --- Test cases --------------------------------------------------------------

const TEST_CASES = [
  // === EU GDPR — risk-assessment gating ===
  // The Art. 33 SA notification gates on riskRequired ("risk" or "high"); the
  // Art. 34 individual notification gates on highRiskRequired ("high" only).
  // With no risk assessment provided, both sit pending (not fired, not
  // suppressed) — the engine is waiting on the controller's assessment.
  {
    name: "EU GDPR: no risk assessment → SA and Data Subjects both pending, no deadlines",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true } },
    expect: expectAll(
      expectCount(0),
      expectPending("EU GDPR", "Supervisory Authority"),
      expectPending("EU GDPR", "Data Subjects")
    ),
  },
  {
    name: "EU GDPR: risk 'unlikely' → SA suppressed (Art. 33(5)); Data Subjects suppressed (high-risk threshold not met)",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true }, riskLevel: "unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("EU GDPR", "Supervisory Authority", "risk_assessment"),
      expectSuppressed("EU GDPR", "Data Subjects", "risk_assessment")
    ),
  },
  {
    name: "EU GDPR: risk 'risk' → SA fires at 72h; Data Subjects suppressed (not high risk)",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true }, riskLevel: "risk" },
    expect: expectAll(
      expectCount(1),
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDeadlineHoursFromAwareness("EU GDPR", "Supervisory Authority", 72),
      expectSuppressed("EU GDPR", "Data Subjects", "risk_assessment")
    ),
  },
  {
    name: "EU GDPR: risk 'high' → SA fires at 72h; Data Subjects fires (no fixed deadline)",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true }, riskLevel: "high" },
    expect: expectAll(
      expectCount(2),
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDeadlineHoursFromAwareness("EU GDPR", "Supervisory Authority", 72),
      expectFires("EU GDPR", "Data Subjects")
    ),
  },
  {
    name: "EU GDPR: risk 'high' + encryption → SA fires; Data Subjects suppressed by unintelligibility (Art. 34(3)(a))",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true }, riskLevel: "high", encryptionApplied: true },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDoesNotFire("EU GDPR", "Data Subjects"),
      expectSuppressed("EU GDPR", "Data Subjects", "unintelligibility_exemption")
    ),
  },
  {
    name: "EU GDPR: risk 'risk' + encryption → SA fires; Data Subjects risk-suppressed (risk gating precedes encryption)",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true }, riskLevel: "risk", encryptionApplied: true },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectSuppressed("EU GDPR", "Data Subjects", "risk_assessment")
    ),
  },

  // === UK GDPR — risk-assessment gating (mirrors EU) ===
  {
    name: "UK GDPR: no risk assessment → ICO and Data Subjects both pending, no deadlines",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true } },
    expect: expectAll(
      expectCount(0),
      expectPending("UK GDPR", "ICO"),
      expectPending("UK GDPR", "Data Subjects")
    ),
  },
  {
    name: "UK GDPR: risk 'unlikely' → ICO suppressed (Art. 33(5) UK GDPR); Data Subjects suppressed (not high risk)",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true }, riskLevel: "unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("UK GDPR", "ICO", "risk_assessment"),
      expectSuppressed("UK GDPR", "Data Subjects", "risk_assessment")
    ),
  },
  {
    name: "UK GDPR: risk 'risk' → ICO fires at 72h; Data Subjects suppressed (not high risk)",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true }, riskLevel: "risk" },
    expect: expectAll(
      expectCount(1),
      expectFires("UK GDPR", "ICO"),
      expectDeadlineHoursFromAwareness("UK GDPR", "ICO", 72),
      expectSuppressed("UK GDPR", "Data Subjects", "risk_assessment")
    ),
  },
  {
    name: "UK GDPR: risk 'high' → ICO fires at 72h; Data Subjects fires (no fixed deadline)",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true }, riskLevel: "high" },
    expect: expectAll(
      expectCount(2),
      expectFires("UK GDPR", "ICO"),
      expectDeadlineHoursFromAwareness("UK GDPR", "ICO", 72),
      expectFires("UK GDPR", "Data Subjects")
    ),
  },
  {
    name: "UK GDPR: risk 'high' + encryption → ICO fires; Data Subjects suppressed by unintelligibility (Art. 34(3)(a) UK GDPR)",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true }, riskLevel: "high", encryptionApplied: true },
    expect: expectAll(
      expectFires("UK GDPR", "ICO"),
      expectDoesNotFire("UK GDPR", "Data Subjects"),
      expectSuppressed("UK GDPR", "Data Subjects", "unintelligibility_exemption")
    ),
  },
  {
    name: "UK GDPR: risk 'risk' + encryption → ICO fires; Data Subjects risk-suppressed (risk gating precedes encryption)",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true }, riskLevel: "risk", encryptionApplied: true },
    expect: expectAll(
      expectFires("UK GDPR", "ICO"),
      expectSuppressed("UK GDPR", "Data Subjects", "risk_assessment")
    ),
  },
  {
    name: "EU and UK can fire independently and simultaneously",
    category: "Multi-jurisdiction",
    facts: { jurisdictions: { eu: true, uk: true }, riskLevel: "high" },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectFires("EU GDPR", "Data Subjects"),
      expectFires("UK GDPR", "ICO"),
      expectFires("UK GDPR", "Data Subjects"),
      expectCount(4)
    ),
  },
  {
    name: "Mixed state: CA fires while EU sits pending (no risk assessment yet)",
    category: "Risk-assessment gating",
    facts: { jurisdictions: { ca: true, eu: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("California", "California Residents"),
      expectPending("EU GDPR", "Supervisory Authority"),
      expectPending("EU GDPR", "Data Subjects"),
      expectCount(1)
    ),
  },

  // === California (post-SB-446, eff. Jan. 1, 2026) ===
  // Note: SB-446 added a 30-day individual notification deadline and a 15-day
  // AG notification deadline (cascading from resident notification) for breaches
  // affecting more than 500 residents. The threshold uses "more than 500" (gt),
  // not "500 or more".
  {
    name: "California: 500 residents does NOT trigger AG notification (statute says 'more than 500')",
    category: "California — boundaries",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 500 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("California", "California Residents"),
      expectDoesNotFire("California", "Attorney General")
    ),
  },
  {
    name: "California: 501 residents triggers AG (gt comparator)",
    category: "California — boundaries",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 501 }, sensitivity: ["identifiers"] },
    expect: expectFires("California", "Attorney General"),
  },
  {
    name: "California: missing resident count does not fire AG",
    category: "California — boundaries",
    facts: { jurisdictions: { ca: true }, sensitivity: ["identifiers"] },
    expect: expectDoesNotFire("California", "Attorney General"),
  },
  {
    name: "California individual notification deadline is 30 days from awareness (SB-446)",
    category: "California",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 100 }, sensitivity: ["identifiers"] },
    expect: expectDeadlineHoursFromAwareness("California", "California Residents", 30 * 24),
  },
  {
    name: "California AG deadline is 45 days from awareness (= 30 day individual + 15 day cascade)",
    category: "California",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 1000 }, sensitivity: ["identifiers"] },
    expect: expectDeadlineHoursFromAwareness("California", "Attorney General", 45 * 24),
  },

  // === Texas — threshold edges ===
  {
    name: "Texas: 249 residents does NOT trigger AG",
    category: "Texas — boundaries",
    facts: { jurisdictions: { tx: true }, residentCounts: { tx: 249 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Texas", "Texas Residents"),
      expectDoesNotFire("Texas", "Attorney General")
    ),
  },
  {
    name: "Texas: exactly 250 residents triggers AG (gte)",
    category: "Texas — boundaries",
    facts: { jurisdictions: { tx: true }, residentCounts: { tx: 250 }, sensitivity: ["identifiers"] },
    expect: expectFires("Texas", "Attorney General"),
  },
  {
    name: "Texas individual notification deadline is 60 days (1440 hours) — § 521.053(b)",
    category: "Texas",
    facts: { jurisdictions: { tx: true }, residentCounts: { tx: 100 }, sensitivity: ["identifiers"] },
    expect: expectDeadlineHoursFromAwareness("Texas", "Texas Residents", 60 * 24),
  },
  {
    name: "Texas AG notification deadline is 30 days (720 hours) — § 521.053(i)",
    category: "Texas",
    facts: { jurisdictions: { tx: true }, residentCounts: { tx: 500 }, sensitivity: ["identifiers"] },
    expect: expectDeadlineHoursFromAwareness("Texas", "Attorney General", 30 * 24),
  },
  {
    name: "Texas: 10,000 residents does NOT trigger CRA notification (statute says 'more than 10,000')",
    category: "Texas — CRA boundary",
    facts: { jurisdictions: { tx: true }, residentCounts: { tx: 10000 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Texas", "Texas Residents"),
      expectFires("Texas", "Attorney General"),
      expectDoesNotFire("Texas", "Consumer Reporting")
    ),
  },
  {
    name: "Texas: 10,001 residents triggers CRA notification",
    category: "Texas — CRA boundary",
    facts: { jurisdictions: { tx: true }, residentCounts: { tx: 10001 }, sensitivity: ["identifiers"] },
    expect: expectFires("Texas", "Consumer Reporting"),
  },

  // === Colorado — comparator-sensitive boundaries ===
  {
    name: "Colorado: exactly 1,000 residents does NOT trigger CRA notification (gt comparator)",
    category: "Colorado — comparator",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 1000 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Colorado", "Colorado Residents"),
      expectFires("Colorado", "Attorney General"),
      expectDoesNotFire("Colorado", "Consumer Reporting")
    ),
  },
  {
    name: "Colorado: 1,001 residents triggers CRA notification",
    category: "Colorado — comparator",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 1001 }, sensitivity: ["identifiers"] },
    expect: expectFires("Colorado", "Consumer Reporting"),
  },
  {
    name: "Colorado: 499 residents does NOT trigger AG (gte 500)",
    category: "Colorado — comparator",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 499 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Colorado", "Colorado Residents"),
      expectDoesNotFire("Colorado", "Attorney General")
    ),
  },
  {
    name: "Colorado: 500 residents triggers AG (gte)",
    category: "Colorado — comparator",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 500 }, sensitivity: ["identifiers"] },
    expect: expectFires("Colorado", "Attorney General"),
  },
  {
    name: "Colorado individual notification deadline is 30 days",
    category: "Colorado",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 100 }, sensitivity: ["identifiers"] },
    expect: expectDeadlineHoursFromAwareness("Colorado", "Colorado Residents", 30 * 24),
  },

  // === New York ===
  {
    name: "New York: any resident triggers individual + AG + DOS + State Police (no AG threshold)",
    category: "New York",
    facts: { jurisdictions: { ny: true }, residentCounts: { ny: 1 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("New York", "New York Residents"),
      expectFires("New York", "Attorney General"),
      expectFires("New York", "Department of State"),
      expectFires("New York", "State Police"),
      expectDoesNotFire("New York", "Consumer Reporting"),
      expectCount(4)
    ),
  },
  {
    name: "New York individual deadline is 30 days from discovery (S2659B/A8872A)",
    category: "New York",
    facts: { jurisdictions: { ny: true }, residentCounts: { ny: 100 }, sensitivity: ["identifiers"] },
    expect: expectDeadlineHoursFromAwareness("New York", "New York Residents", 30 * 24),
  },
  {
    name: "New York AG, DOS, State Police have no fixed clock — fire on residents-notified",
    category: "New York",
    facts: { jurisdictions: { ny: true }, residentCounts: { ny: 100 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      (deadlines) => {
        const ag = findDeadline(deadlines, "New York", "Attorney General");
        return ag && ag.deadline === null
          ? { pass: true }
          : { pass: false, message: `expected AG deadline null; got ${ag?.deadline}` };
      },
      (deadlines) => {
        const dos = findDeadline(deadlines, "New York", "Department of State");
        return dos && dos.deadline === null
          ? { pass: true }
          : { pass: false, message: `expected DOS deadline null; got ${dos?.deadline}` };
      },
      (deadlines) => {
        const sp = findDeadline(deadlines, "New York", "State Police");
        return sp && sp.deadline === null
          ? { pass: true }
          : { pass: false, message: `expected State Police deadline null; got ${sp?.deadline}` };
      }
    ),
  },
  {
    name: "New York: 5,000 residents does NOT trigger CRA notification (statute says 'more than 5,000')",
    category: "New York — CRA boundary",
    facts: { jurisdictions: { ny: true }, residentCounts: { ny: 5000 }, sensitivity: ["identifiers"] },
    expect: expectDoesNotFire("New York", "Consumer Reporting"),
  },
  {
    name: "New York: 5,001 residents triggers CRA notification (gt comparator)",
    category: "New York — CRA boundary",
    facts: { jurisdictions: { ny: true }, residentCounts: { ny: 5001 }, sensitivity: ["identifiers"] },
    expect: expectFires("New York", "Consumer Reporting"),
  },
  {
    name: "New York + encryption: all five obligations suppressed (definitional)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ny: true },
      residentCounts: { ny: 10000 },
      sensitivity: ["financial"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("New York", "New York Residents"),
      expectSuppressed("New York", "Attorney General"),
      expectSuppressed("New York", "Department of State"),
      expectSuppressed("New York", "State Police"),
      expectSuppressed("New York", "Consumer Reporting"),
      expectSuppressedCount(5)
    ),
  },

  // === Virginia ===
  {
    name: "Virginia: any resident triggers individual + AG (no AG threshold)",
    category: "Virginia",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 1 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectDoesNotFire("Virginia", "Consumer Reporting"),
      expectCount(2)
    ),
  },
  {
    name: "Virginia individual notification has no fixed hour deadline",
    category: "Virginia",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 100 }, sensitivity: ["identifiers"] },
    expect: (deadlines) => {
      const d = findDeadline(deadlines, "Virginia", "Virginia Residents");
      if (!d) return { pass: false, message: "individual notification not found" };
      return d.deadline === null
        ? { pass: true }
        : { pass: false, message: `expected null deadline; got ${d.deadline}` };
    },
  },
  {
    name: "Virginia AG notification has no fixed hour deadline",
    category: "Virginia",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 100 }, sensitivity: ["identifiers"] },
    expect: (deadlines) => {
      const d = findDeadline(deadlines, "Virginia", "Attorney General");
      if (!d) return { pass: false, message: "AG notification not found" };
      return d.deadline === null
        ? { pass: true }
        : { pass: false, message: `expected null deadline; got ${d.deadline}` };
    },
  },
  {
    name: "Virginia: 1,000 residents does NOT trigger CRA notification (statute says 'more than 1,000')",
    category: "Virginia — CRA boundary",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 1000 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectDoesNotFire("Virginia", "Consumer Reporting")
    ),
  },
  {
    name: "Virginia: 1,001 residents triggers CRA notification (gt comparator)",
    category: "Virginia — CRA boundary",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 1001 }, sensitivity: ["identifiers"] },
    expect: expectFires("Virginia", "Consumer Reporting"),
  },
  {
    name: "Virginia: 5,000 residents triggers all three obligations (individual + AG + CRA)",
    category: "Virginia",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 5000 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectFires("Virginia", "Consumer Reporting"),
      expectCount(3)
    ),
  },
  {
    name: "Virginia + encryption: all three obligations suppressed (definitional)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { va: true },
      residentCounts: { va: 5000 },
      sensitivity: ["financial"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Virginia", "Virginia Residents"),
      expectSuppressed("Virginia", "Attorney General"),
      expectSuppressed("Virginia", "Consumer Reporting"),
      expectSuppressedCount(3)
    ),
  },
  {
    name: "Virginia: missing resident count fires individual + AG but not CRA",
    category: "Virginia",
    facts: { jurisdictions: { va: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectDoesNotFire("Virginia", "Consumer Reporting")
    ),
  },

  // === Multi-jurisdiction stacking ===
  {
    name: "All eight jurisdictions, high-risk, large incident: stacks correctly",
    category: "Multi-jurisdiction",
    facts: {
      jurisdictions: { eu: true, uk: true, ca: true, tx: true, co: true, ma: true, ny: true, va: true },
      residentCounts: { ca: 5000, tx: 5000, co: 5000, ny: 5000, va: 5000 },
      sensitivity: ["health", "financial", "gov_id"],
      riskLevel: "high",
    },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectFires("EU GDPR", "Data Subjects"),
      expectFires("UK GDPR", "ICO"),
      expectFires("UK GDPR", "Data Subjects"),
      expectFires("California", "California Residents"),
      expectFires("California", "Attorney General"),
      expectFires("Texas", "Texas Residents"),
      expectFires("Texas", "Attorney General"),
      expectDoesNotFire("Texas", "Consumer Reporting"), // 5,000 < 10,000+ threshold
      expectFires("Colorado", "Colorado Residents"),
      expectFires("Colorado", "Attorney General"),
      expectFires("Colorado", "Consumer Reporting"),
      expectFires("Massachusetts", "Massachusetts Residents"),
      expectFires("Massachusetts", "Attorney General"),
      expectFires("Massachusetts", "OCABR"),
      expectFires("New York", "New York Residents"),
      expectFires("New York", "Attorney General"),
      expectFires("New York", "Department of State"),
      expectFires("New York", "State Police"),
      expectDoesNotFire("New York", "Consumer Reporting"), // 5,000 not > 5,000
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectFires("Virginia", "Consumer Reporting") // 5,000 > 1,000
    ),
  },

  // === Empty / degenerate cases ===
  {
    name: "No jurisdictions selected → no deadlines",
    category: "Edge cases",
    facts: { jurisdictions: {}, sensitivity: ["health"] },
    expect: expectCount(0),
  },
  {
    name: "Selected jurisdictions but no awareness date → no deadlines",
    category: "Edge cases",
    facts: { jurisdictions: { eu: true }, sensitivity: ["health"], _skipAwareness: true },
    expect: expectCount(0),
  },

  // === Massachusetts (count-independent + encryption suppression) ===
  {
    name: "MA fires three obligations regardless of resident count (no threshold)",
    category: "Massachusetts",
    facts: { jurisdictions: { ma: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Massachusetts", "Massachusetts Residents"),
      expectFires("Massachusetts", "Attorney General"),
      expectFires("Massachusetts", "OCABR"),
      expectCount(3)
    ),
  },
  {
    name: "MA all three obligations have no fixed deadline",
    category: "Massachusetts",
    facts: { jurisdictions: { ma: true }, sensitivity: ["identifiers"] },
    expect: (deadlines) => {
      const allNull = deadlines.every((d) => d.deadline === null);
      return allNull
        ? { pass: true }
        : { pass: false, message: `Expected all MA deadlines to be null; got ${deadlines.filter((d) => d.deadline !== null).length} fixed deadlines` };
    },
  },

  // === Encryption suppression — Massachusetts (breach-definition exclusion) ===
  {
    name: "MA + encryption applied → all three obligations suppressed, zero deadlines",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ma: true },
      sensitivity: ["financial"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(3),
      expectSuppressed("Massachusetts", "Massachusetts Residents"),
      expectSuppressed("Massachusetts", "Attorney General"),
      expectSuppressed("Massachusetts", "OCABR")
    ),
  },
  {
    name: "MA without encryption → all three obligations fire (no suppression)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ma: true },
      sensitivity: ["financial"],
      encryptionApplied: false,
    },
    expect: expectAll(
      expectCount(3),
      expectSuppressedCount(0)
    ),
  },

  // === Encryption suppression — EU GDPR (Art. 34(3)(a) exemption, individual notification only) ===
  {
    name: "EU GDPR + encryption + high-risk: Art. 33 SA notification still fires; Art. 34 individual notice is suppressed",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { eu: true },
      sensitivity: ["health"],
      riskLevel: "high",
      encryptionApplied: true,
    },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDoesNotFire("EU GDPR", "Data Subjects"),
      expectSuppressed("EU GDPR", "Data Subjects"),
      expectNotSuppressed("EU GDPR", "Supervisory Authority")
    ),
  },
  {
    name: "UK GDPR + encryption + high-risk: ICO still required; individual notice suppressed",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { uk: true },
      sensitivity: ["health"],
      riskLevel: "high",
      encryptionApplied: true,
    },
    expect: expectAll(
      expectFires("UK GDPR", "ICO"),
      expectDoesNotFire("UK GDPR", "Data Subjects"),
      expectSuppressed("UK GDPR", "Data Subjects")
    ),
  },

  // === Encryption suppression — California, Texas, Colorado (breach-definition exclusion) ===
  {
    name: "California + encryption → both obligations suppressed (definitional)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ca: true },
      residentCounts: { ca: 1000 },
      sensitivity: ["financial"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("California", "California Residents"),
      expectSuppressed("California", "Attorney General"),
      expectSuppressedCount(2)
    ),
  },
  {
    name: "Texas + encryption → all three obligations suppressed (definitional)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { tx: true },
      residentCounts: { tx: 50000 },
      sensitivity: ["financial"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Texas", "Texas Residents"),
      expectSuppressed("Texas", "Attorney General"),
      expectSuppressed("Texas", "Consumer Reporting"),
      expectSuppressedCount(3)
    ),
  },
  {
    name: "Colorado + encryption → all obligations suppressed (definitional)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { co: true },
      residentCounts: { co: 5000 },
      sensitivity: ["financial"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Colorado", "Colorado Residents"),
      expectSuppressed("Colorado", "Attorney General"),
      expectSuppressed("Colorado", "Consumer Reporting"),
      expectSuppressedCount(3)
    ),
  },

  // === Dependent deadlines (deadline_relative_to) ===
  {
    name: "CA dependent deadline: AG clock = resident clock + 15 days = 45 days from awareness",
    category: "Dependent deadlines",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 1000 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectDeadlineHoursFromAwareness("California", "California Residents", 30 * 24),
      expectDeadlineHoursFromAwareness("California", "Attorney General", 45 * 24)
    ),
  },
  {
    name: "CA dependent: when AG threshold not met, only the parent resident notification fires",
    category: "Dependent deadlines",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 100 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("California", "California Residents"),
      expectDoesNotFire("California", "Attorney General"),
      expectCount(1)
    ),
  },
  {
    name: "CA dependent: when encryption suppresses parent, dependent is also suppressed",
    category: "Dependent deadlines",
    facts: {
      jurisdictions: { ca: true },
      residentCounts: { ca: 1000 },
      sensitivity: ["identifiers"],
      encryptionApplied: true,
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("California", "California Residents"),
      expectSuppressed("California", "Attorney General")
    ),
  },

  // === Multi-jurisdiction encryption interaction ===
  {
    name: "MA + EU + encryption: MA fully suppressed; EU Art. 33 fires, EU Art. 34 suppressed",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ma: true, eu: true },
      sensitivity: ["financial"],
      riskLevel: "high",
      encryptionApplied: true,
    },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDoesNotFire("EU GDPR", "Data Subjects"),
      expectDoesNotFire("Massachusetts", "Massachusetts Residents"),
      expectSuppressed("Massachusetts", "Massachusetts Residents"),
      expectSuppressed("Massachusetts", "Attorney General"),
      expectSuppressed("Massachusetts", "OCABR"),
      expectSuppressed("EU GDPR", "Data Subjects"),
      expectSuppressedCount(4),
      expectCount(1)
    ),
  },
];

/**
 * Run the full test suite and return structured results.
 * Each result: { name, category, pass, message?, error? }
 */
function runTests() {
  return TEST_CASES.map((t) => {
    try {
      const facts = {
        ...t.facts,
        awarenessDate: t.facts._skipAwareness ? undefined : TEST_AWARENESS,
      };
      const { deadlines, suppressed, pending } = computeDeadlines(facts);
      const result = t.expect(deadlines, suppressed, pending);
      return {
        name: t.name,
        category: t.category,
        pass: result.pass,
        message: result.message,
      };
    } catch (e) {
      return {
        name: t.name,
        category: t.category,
        pass: false,
        error: e.message || String(e),
      };
    }
  });
}

export { isHighRisk, computeDeadlines, runTests, TEST_CASES, TEST_AWARENESS };
