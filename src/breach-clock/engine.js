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

import { JURISDICTIONS, RULESET_VERSION } from "./data.js";

// Structured refusal (serverless bundle, JDC 2026-08-22). Given incomplete
// facts — no usable awareness instant, or no selected modeled jurisdiction —
// the engine returns { error: "incomplete_facts", missing: [...] } and NEVER
// an empty obligation set. An empty result must only ever mean "evaluated,
// nothing applies"; it must never be reachable from a malformed facts
// object. The form's completeness gate keeps this path out of the UI; the
// results page and memo handle the shape defensively regardless.
const INCOMPLETE_FACTS = "incomplete_facts";

function incompleteFacts(facts) {
  const missing = [];
  const aw = facts && facts.awarenessDate;
  if (!(aw instanceof Date) || isNaN(aw.getTime())) missing.push("awarenessDate");
  const selected = facts && facts.jurisdictions && typeof facts.jurisdictions === "object" ? facts.jurisdictions : null;
  if (!selected || !JURISDICTIONS.some((jur) => !!selected[jur.id])) missing.push("jurisdictions");
  return missing;
}

const HIGH_RISK_CATEGORIES = ["ssn", "gov_id", "financial", "health", "biometric", "children", "special", "credentials"];

// The only valid riskLevel inputs. The UI emits exactly one of these three or
// "" (unset). Anything else reaching the engine — undefined/null/"" or an
// invalid value from a serialization round-trip (0, false, "High", " risk ") —
// is NOT a valid assessment and must fail SAFE to pending, never to
// suppression. See the risk-gating block in computeDeadlines.
const VALID_RISK_LEVELS = ["unlikely", "risk", "high"];

function isHighRisk(sensitivity) {
  if (!Array.isArray(sensitivity)) return false;
  return sensitivity.some((s) => HIGH_RISK_CATEGORIES.includes(s));
}

// =============================================================================
// GENERIC PER-OBLIGATION CONDITIONAL-GATE SEAM
//
// Each obligation routes through an ordered list of conditional gates. A gate is
// plain data (see docs/todo.md, ADDENDUM section B) with two roles:
//
//   fireCondition — a precondition the obligation needs to fire at all. Its input
//     must be affirmatively established to a qualifying value. If the input is
//     unset/invalid the outcome is `pending` (we are waiting on the user); if it
//     is established but does not qualify the outcome is `suppressed`.
//   safeHarbor    — an affirmative excuse. Satisfied only when its qualifying
//     value is affirmatively established, AND any required encryption strength is
//     met, AND every `defeatedBy` input is affirmatively "no" (`defeatedBy` may
//     be a single input name or an array of them — with an array, ALL listed
//     inputs must be "no"; any one unset or "yes" defeats the harbor). A
//     satisfied harbor routes the obligation to `suppress` or `review` per its
//     `onSatisfied`.
//
// Resolution (ADDENDUM section C): all fireConditions first — any indeterminate
// input → pending; any established-but-not-met condition → suppressed. Then the
// safeHarbors — `review` outranks `suppress` (never silently suppress when a path
// demands a substantive judgment). Nothing blocking → the obligation fires.
//
// The seam is maximally conservative: any unset/partial value along a harbor
// chain leaves the harbor unsatisfied, so the obligation fires rather than being
// silently excused.
//
// Consumers (as of Stage 5): the EU/UK risk fireCondition (derived from the
// legacy gating.* fields by `deriveGates`) and the per-obligation encryption /
// redaction / unintelligibility safeHarbors declared as `ob.conditionalGates` in
// data.js. The former global `encryptionApplied` switch is GONE — every harbor is
// a safeHarbor gate. US states' gates read the cluster inputs (encrypted /
// keyAcquired / redacted / reidentificationAcquired); the GDPR Art. 34
// unintelligibility gate reads its own `gdprUnintelligibility` input. The
// resident-threshold block in computeDeadlines stays legacy (US-only).
// fireConditions are evaluated before that threshold; safeHarbors after it.
// =============================================================================

function fireConditionMet(gate, value) {
  if (Array.isArray(gate.anyOf)) return gate.anyOf.includes(value);
  if (gate.equals !== undefined) return value === gate.equals;
  return true;
}

function safeHarborSatisfied(gate, inputs) {
  const value = inputs[gate.input];
  const qualifies = Array.isArray(gate.anyOf)
    ? gate.anyOf.includes(value)
    : gate.equals !== undefined
      ? value === gate.equals
      : value === "yes";
  if (!qualifies) return false;
  if (gate.requiresStrength && inputs.encryptionStrength !== gate.requiresStrength) return false;
  if (Array.isArray(gate.defeatedBy)) {
    if (!gate.defeatedBy.every((d) => inputs[d] === "no")) return false;
  } else if (gate.defeatedBy && inputs[gate.defeatedBy] !== "no") {
    return false;
  }
  return true;
}

// Normalize a gate's suppression metadata into { type, citation, description }.
// fireCondition gates (the risk gate) carry a nested `suppression`; safeHarbor
// gates carry a top-level `suppressionType` + `citation` + `description`.
function gateSuppression(gate) {
  if (gate.suppression) return gate.suppression;
  return { type: gate.suppressionType, citation: gate.citation, description: gate.description };
}

// fireConditions — preconditions an obligation needs to fire at all. Evaluated
// BEFORE the resident-threshold check, preserving the historical
// risk → threshold → encryption ordering. Returns a pending/suppressed verdict,
// or null when no fireCondition blocks.
function evaluateFireConditions(gates, inputs) {
  for (const gate of gates) {
    if (gate.role !== "fireCondition") continue;
    const value = inputs[gate.input];
    const established = !gate.validValues || gate.validValues.includes(value);
    if (!established) return { outcome: "pending", gate };
    if (!fireConditionMet(gate, value)) return { outcome: "suppressed", gate };
  }
  return null;
}

// safeHarbors — affirmative excuses. Evaluated AFTER the resident-threshold check,
// so a below-threshold US obligation is silently absent (returned at the
// threshold) rather than suppressed. `review` outranks `suppress`, so a suppress
// match is held and only returned if no review match is found anywhere in the
// list. Returns a review/suppressed verdict, or null when no harbor applies.
function evaluateSafeHarbors(gates, inputs) {
  let suppressGate = null;
  for (const gate of gates) {
    if (gate.role !== "safeHarbor") continue;
    if (!safeHarborSatisfied(gate, inputs)) continue;
    if (gate.onSatisfied === "review") return { outcome: "review", gate };
    if (gate.onSatisfied === "suppress" && !suppressGate) suppressGate = gate;
  }
  if (suppressGate) return { outcome: "suppressed", gate: suppressGate };
  return null;
}

// Category gate (category-conditioned pass, JDC review 2026-07-25). An
// obligation may declare `gating.categories: { anyOf: [...] }` — it computes
// only if facts.sensitivity contains at least one member of anyOf. The object
// form reserves allOf/noneOf for future use; only anyOf ships. AND-composed
// with resident thresholds. Returns true when no category gate is declared.
function categoryGateMet(ob, sensitivity) {
  const anyOf = ob.gating?.categories?.anyOf;
  if (!Array.isArray(anyOf)) return true;
  if (!Array.isArray(sensitivity)) return false;
  return anyOf.some((c) => sensitivity.includes(c));
}

// Harm-assessment gate (harm-gate pass commit 1, 2026-08-02). Deliberately
// SEPARATE from the conditional-gate seam: `harmGate` is per-obligation data
// in data.js ({ standard, citation, character }) and the input is the
// attestation `facts.harmAssessment` — the user attests that a documented
// determination under the applicable statutory standards exists; the engine
// never draws a harm conclusion. ONLY the exact sentinel
// "determined_unlikely" suppresses; "" and "harm_likely" (and any invalid
// value — case variants, padding, serialization artifacts) change NOTHING in
// computation. Note the fail-safe direction is the OPPOSITE of riskLevel's:
// an unrecognized riskLevel routes to pending because GDPR suppression must
// rest on a real assessment, while an unrecognized harmAssessment computes
// everything because computing (notifying) is the conservative outcome here.
// Obligations without a harmGate are structurally inert to the answer
// (CA/TX/NY/MA/EU/UK) — enforced by field absence, no special-casing.
function harmMechanism(ob, harmAssessment) {
  if (harmAssessment !== "determined_unlikely" || !ob.harmGate) return null;
  const { standard, citation, character } = ob.harmGate;
  return { type: "harm", standard, citation, character };
}

// Build the full gate list for an obligation: the risk fireCondition derived from
// the legacy gating.* fields (the behavior-preserved adapter from Stage 1) MERGED
// with any declared `conditionalGates` (the encryption / redaction safeHarbors
// added in Stage 3a). An obligation can carry both — EU/UK Art. 34 has a risk
// fireCondition AND an unintelligibility safeHarbor. Behavior-identical risk
// semantics: riskRequired → fires on "risk"|"high"; highRiskRequired → fires on
// "high"; any value outside VALID_RISK_LEVELS → pending.
function deriveGates(ob) {
  const gates = [];
  if (ob.gating?.riskRequired || ob.gating?.highRiskRequired) {
    gates.push({
      role: "fireCondition",
      input: "riskLevel",
      validValues: VALID_RISK_LEVELS,
      anyOf: ob.gating.highRiskRequired ? ["high"] : ["risk", "high"],
      whenUnset: "pending",
      suppression: {
        type: "risk_assessment",
        citation: ob.riskSuppression?.citation,
        description: ob.riskSuppression?.description,
      },
    });
  }
  if (Array.isArray(ob.conditionalGates)) gates.push(...ob.conditionalGates);
  return gates;
}

/**
 * Pure deadline-builder. Produces the same arrays the UI renders, given a
 * facts object. No dependence on React state.
 *
 * @param {Object} facts
 * @param {Date}   facts.awarenessDate       - Required.
 * @param {Object} facts.jurisdictions       - { [id]: boolean } map of selected jurisdictions.
 * @param {Object} [facts.residentCounts]    - { [id]: number|string } resident counts per jurisdiction.
 * @param {Object} [facts.residentCountUnknown] - { [id]: true } jurisdictions whose resident count is
 *                                             not yet established. A numeric count always wins over
 *                                             the flag (defensive; the UI prevents the combination).
 * @param {string[]} [facts.sensitivity]     - Array of sensitivity category ids.
 * @param {string} [facts.encrypted] - US encryption-cluster inputs ("yes"|"no"|unset): encrypted, plus encryptionStrength ("ge_128"|"below_128"|"unknown"), redacted, keyAcquired, reidentificationAcquired, acquiredUnencrypted.
 * @param {string} [facts.gdprUnintelligibility] - GDPR Art. 34(3)(a) input ("yes"|"no"|unset): measures rendering the data unintelligible.
 * @param {string} [facts.harmAssessment] - Harm-determination attestation ("" | "determined_unlikely" | "harm_likely"). Only the exact value "determined_unlikely" suppresses harm-gated obligations; every other value is inert.
 * @returns {{deadlines: Array, suppressed: Array, pending: Array, review: Array, contingent: Array, services: Array, advisories: Array, ruleset_version: string}}
 *   A structured refusal — { error: "incomplete_facts", missing: string[],
 *   ruleset_version } — is returned instead when awarenessDate is not a
 *   valid Date or no modeled jurisdiction is selected (JDC 2026-08-22).
 *   ruleset_version — the data.js RULESET_VERSION the result was computed under.
 *   deadlines  — obligations that fire under the facts.
 *   suppressed — obligations that would have fired but were affirmatively
 *                excused (encryption/redaction/unintelligibility harbors, the
 *                risk assessment, or the harm determination). Each suppressed
 *                entry includes the citation for the suppression mechanism so
 *                the UI can render an explanatory card, plus the additive
 *                `suppression_reasons` array of mechanism objects — an
 *                obligation suppressed by both encryption and harm stays ONE
 *                entry carrying both reasons (flat fields mirror the first);
 *                harm reasons are { type: "harm", standard, citation,
 *                character }.
 *   pending    — obligations awaiting a required user input (the EU/UK risk
 *                assessment).
 *   review     — obligations whose outcome turns on a substantive legal
 *                judgment the engine does not make.
 *   contingent — threshold-gated obligations that are live but for a resident
 *                count the user has flagged as not yet established
 *                (`residentCountUnknown`). Each entry carries the threshold,
 *                its comparator, the counsel-register `condition` sentence,
 *                and `conditional_deadline` — the obligation's normal clock
 *                math run AS IF the threshold were met (dependent deadlines
 *                included; null where the obligation has no fixed clock).
 *                Suppression and counsel review OUTRANK contingency: an
 *                obligation excused by a harbor or a harm determination lands
 *                in `suppressed` (or `review`), never here. A KNOWN
 *                below-threshold count is unchanged — silently absent.
 *   services   — additive: computed category-gated service obligations
 *                (statutory duration, no deadline date).
 *   advisories — additive: declared advisories whose category gate is met,
 *                plus auto-generated "ssn_unconfirmed" conditional advisories
 *                (category-gated obligation not computed while gov_id is
 *                selected without ssn).
 *
 * Obligations may declare `deadline_relative_to: { parent_authority: "..." }` to specify
 * that their deadline runs from another obligation's deadline, not from awareness.
 * Used for cascading clocks (e.g., California's 15-day AG notification clock that
 * runs from the date of resident notification). If the parent doesn't fire, the
 * dependent obligation does not fire either.
 */
function computeDeadlines(facts) {
  const missing = incompleteFacts(facts);
  if (missing.length) return { error: INCOMPLETE_FACTS, missing, ruleset_version: RULESET_VERSION };
  const {
    awarenessDate,
    jurisdictions = {},
    residentCounts = {},
    residentCountUnknown = {},
    sensitivity = [],
    riskLevel,
    encrypted,
    encryptionStrength,
    redacted,
    keyAcquired,
    reidentificationAcquired,
    acquiredUnencrypted,
    gdprUnintelligibility,
    harmAssessment,
  } = facts;
  // Conditional-gate inputs — incident-global facts the gates read. Anything
  // unset stays undefined and (per the safeHarbor rule) leaves a harbor
  // unsatisfied, so the obligation fires. The US states read the encryption
  // cluster (encrypted/strength/key, redacted/reidentification); GDPR Art. 34
  // reads gdprUnintelligibility (Art. 34(3)(a)). The former global
  // encryptionApplied boolean is fully retired as of Stage 5.
  const gateInputs = { riskLevel, encrypted, encryptionStrength, redacted, keyAcquired, reidentificationAcquired, acquiredUnencrypted, gdprUnintelligibility };
  const deadlines = [];
  const suppressed = [];
  const pending = [];
  // Fourth bucket (Stage 2): obligations whose outcome turns on a substantive
  // legal judgment the engine does not make — a satisfied safeHarbor gate with
  // onSatisfied:"review". Quad-state invariant: every considered obligation lands
  // in exactly one of the four arrays. EMPTY until Stage 4 wires the MA gate — no
  // gate emits "review" yet.
  const review = [];
  // Fifth bucket (intake phase 2): threshold-gated obligations whose
  // jurisdiction carries `residentCountUnknown` and no numeric count — live
  // but for a count that has not been established. QUINT-state invariant:
  // every considered obligation lands in exactly ONE of deadlines /
  // suppressed / pending / review / contingent. A known below-threshold count
  // is still excluded from all five (silently absent) — unchanged.
  const contingent = [];
  // Additive output arrays (category-conditioned pass). The existing
  // deadline-output shape is unchanged; a UI that ignores these keys keeps
  // working.
  //   services   — computed kind:"service" obligations (category-gated,
  //                duration instead of deadline; e.g. CT identity-theft
  //                prevention, DE/MA credit monitoring). A service whose
  //                encryption harbor is satisfied (suppress OR review) does
  //                not compute — the parallel notification obligations' cards
  //                carry that story.
  //   advisories — (a) declared kind:"advisory" entries whose category gate
  //                is met, and (b) auto-generated conditional advisories for
  //                category-gated obligations whose gate is NOT met while
  //                gov_id IS present in facts.sensitivity (the data may
  //                include SSNs the user recorded under Government IDs) —
  //                reason "ssn_unconfirmed". No advisory when neither ssn nor
  //                gov_id is present.
  const services = [];
  const advisories = [];
  // Pass-2 association for dependent clocks — kept OUTSIDE the entries (a
  // non-mutating side table keyed by entry identity) so no internal field
  // ever rides an output object. Formerly `_jurId` / `_deadlineRelativeTo` /
  // `_deadlineHours` were written onto the entries and stripped afterwards;
  // pending entries leaked `_jurId` uncleaned.
  const internals = new Map();
  const link = (entry, jur, ob) => {
    internals.set(entry, { jurId: jur.id, relativeTo: ob.deadline_relative_to || null, hours: ob.deadline_hours });
    return entry;
  };

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
    // "Count not yet known" (intake phase 2). A numeric count ALWAYS takes
    // precedence over the flag — the UI clears one when the other is set, but
    // a stale flag riding a saved payload must never override a real count.
    const countUnknown = isNaN(residentCount) && !!residentCountUnknown[jur.id];

    jur.obligations.forEach((ob) => {
      // Declared advisories — advisory-only content, never a deadline. A met
      // category gate surfaces the advisory; nothing else about the incident
      // is evaluated for it.
      if (ob.kind === "advisory") {
        if (categoryGateMet(ob, sensitivity)) {
          advisories.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            condition: ob.condition,
            citation: ob.citation,
            source_url: ob.source_url,
            statute: jur.statute,
          });
        }
        return;
      }

      // Conditional-gate seam, Pass 1 — fireConditions, evaluated BEFORE the
      // resident-threshold check (preserving the risk → threshold → encryption
      // order). The EU/UK risk gate is the only fireCondition; US obligations have
      // none and fall through. An unset/invalid riskLevel routes to pending (never
      // suppression — telling the user no notification is required must not rest on
      // an unrecognized value); a valid-but-unmet level suppresses. This is what
      // permits mixed states — a US state can fire while EU/UK sit pending.
      const gates = deriveGates(ob);
      const fireVerdict = evaluateFireConditions(gates, gateInputs);
      if (fireVerdict?.outcome === "pending") {
        pending.push({
          jurisdiction: jur.short,
          authority: ob.authority,
          citation: ob.citation,
          source_url: ob.source_url,
          statute: jur.statute,
        });
        return;
      }
      if (fireVerdict?.outcome === "suppressed") {
        const sup = gateSuppression(fireVerdict.gate);
        suppressed.push({
          jurisdiction: jur.short,
          authority: ob.authority,
          original_citation: ob.citation,
          suppression_type: sup.type,
          suppression_citation: sup.citation,
          suppression_description: sup.description,
          // Additive (harm-gate pass): every suppressed entry carries its
          // mechanism list; the flat fields above mirror reasons[0].
          suppression_reasons: [{ type: sup.type, citation: sup.citation, description: sup.description }],
          source_url: ob.source_url,
          statute: jur.statute,
        });
        return;
      }
      // Category gate — AND-composed with the resident threshold below. An
      // unmet gate leaves the obligation silently absent, EXCEPT when gov_id
      // is among the selected categories: the incident may involve SSNs the
      // user recorded under Government IDs (the categories were split in the
      // 2026-07-25 data-model amendment), so an ssn-gated obligation that did
      // not compute surfaces as a conditional advisory instead.
      if (!categoryGateMet(ob, sensitivity)) {
        if (Array.isArray(sensitivity) && sensitivity.includes("gov_id")) {
          advisories.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            citation: ob.citation,
            source_url: ob.source_url,
            statute: jur.statute,
            reason: "ssn_unconfirmed",
          });
        }
        return;
      }

      // Resident-threshold gate. A numeric count evaluates the threshold
      // exactly as before (below threshold → silently absent). With no numeric
      // count, the obligation is dropped as before UNLESS the jurisdiction is
      // flagged "count not yet known", in which case it is held as CONTINGENT
      // and emitted below — after every suppression / review path has had its
      // say, because an obligation affirmatively excused is not merely
      // uncertain.
      let contingentGate = null;
      if (ob.gating?.residentThreshold !== undefined) {
        const threshold = ob.gating.residentThreshold;
        const comparator = ob.gating.comparator || "gte";
        if (isNaN(residentCount)) {
          if (!countUnknown) return;
          contingentGate = { threshold, comparator };
        } else {
          const met = comparator === "gt" ? residentCount > threshold : residentCount >= threshold;
          if (!met) return;
        }
      }

      // Conditional-gate seam, Pass 2 — safeHarbors (affirmative excuses),
      // evaluated AFTER the threshold check. Each obligation's encryption (and, for
      // VA, redaction) harbor is a per-obligation safeHarbor gate declared in
      // data.js — the former global `encryptionApplied` switch is gone. Two legal
      // mechanisms, distinguished by the gate's suppressionType for the card / memo
      // text: US "breach_definition" (statutory breach excludes encrypted/redacted
      // data) and GDPR "unintelligibility_exemption" (Art. 34(3)(a), reading the
      // gdprUnintelligibility input). A harbor that turns on counsel
      // judgment routes to `review` instead (Stage 4: MA second trigger);
      // `review` outranks `suppress`.
      const harborVerdict = evaluateSafeHarbors(gates, gateInputs);
      // Harm-assessment gate (2026-08-02) — evaluated alongside the
      // safeHarbors, after the category/threshold gates (harm never
      // resurrects a below-threshold obligation). Non-null only when the
      // attestation is exactly "determined_unlikely" AND the obligation
      // declares a harmGate.
      const harmMech = harmMechanism(ob, harmAssessment);

      // Service obligations (kind:"service") — computed, category-gated,
      // duration instead of deadline. When the encryption harbor is
      // satisfied (suppress OR review), the service simply does not compute
      // — the jurisdiction's notification obligations land in
      // suppressed/review with the full explanation, and the service is
      // contingent on notice being required. A HARM-excused service, by
      // contrast, lands in `suppressed` with its own mechanism (CT cascades
      // via the resident (b)(1) gate; DE's § 12B-102(e) states the
      // carve-out expressly for the service) — the statutory excuse is
      // itself worth showing.
      if (ob.kind === "service") {
        if (harborVerdict) return;
        if (harmMech) {
          suppressed.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            original_citation: ob.citation,
            suppression_type: "harm",
            suppression_citation: harmMech.citation,
            suppression_description: harmMech.standard,
            suppression_reasons: [harmMech],
            source_url: ob.source_url,
            statute: jur.statute,
          });
          return;
        }
        // A threshold-gated service on an unestablished count is contingent,
        // not computed: it falls through to the contingent emission below
        // rather than asserting a service duty. No modeled service carries a
        // residentThreshold today, so this guard is structural.
        if (!contingentGate) {
          services.push({
            jurisdiction: jur.short,
            authority: ob.authority,
            service_duration_display: ob.service_duration_display,
            trigger_note: ob.trigger_note,
            condition: ob.condition,
            citation: ob.citation,
            source_url: ob.source_url,
            statute: jur.statute,
          });
          return;
        }
      }

      // Review outranks harm as it outranks suppress-harbors: never silently
      // suppress when a path demands a substantive judgment. (No current
      // obligation carries both a review harbor and a harmGate — MA has no
      // harmGate — but the ordering is the safety property.)
      if (harborVerdict?.outcome === "review") {
        review.push({
          jurisdiction: jur.short,
          authority: ob.authority,
          original_citation: ob.citation,
          review_citation: harborVerdict.gate.citation,
          review_reason: harborVerdict.gate.description,
          source_url: ob.source_url,
          statute: jur.statute,
        });
        return;
      }
      if (harborVerdict?.outcome === "suppressed") {
        const sup = gateSuppression(harborVerdict.gate);
        const reasons = [{ type: sup.type, citation: sup.citation, description: sup.description }];
        // Encryption-and-harm double suppression stays ONE entry carrying
        // both reasons — never duplicate an obligation in output. The flat
        // fields mirror the first (encryption) reason.
        if (harmMech) reasons.push(harmMech);
        suppressed.push({
          jurisdiction: jur.short,
          authority: ob.authority,
          original_citation: ob.citation,
          suppression_type: sup.type,
          suppression_citation: sup.citation,
          suppression_description: sup.description,
          suppression_reasons: reasons,
          source_url: ob.source_url,
          statute: jur.statute,
        });
        return;
      }
      if (harmMech) {
        suppressed.push({
          jurisdiction: jur.short,
          authority: ob.authority,
          original_citation: ob.citation,
          suppression_type: "harm",
          suppression_citation: harmMech.citation,
          suppression_description: harmMech.standard,
          suppression_reasons: [harmMech],
          source_url: ob.source_url,
          statute: jur.statute,
        });
        return;
      }

      // Contingent (unknown resident count) — reached only after every
      // suppression / review path above has declined, so suppression and
      // review outrank contingency by construction. `conditional_deadline` is
      // the obligation's normal clock math run as if the threshold were met;
      // dependent clocks get null here and resolve in pass 2, exactly like
      // firing deadlines.
      if (contingentGate) {
        const { threshold, comparator } = contingentGate;
        const thresholdPhrase = comparator === "gt"
          ? `more than ${threshold.toLocaleString("en-US")}`
          : `${threshold.toLocaleString("en-US")} or more`;
        let conditionalDeadline = null;
        if (!ob.deadline_relative_to && ob.deadline_hours !== null && ob.deadline_hours !== undefined) {
          conditionalDeadline = new Date(awarenessDate.getTime() + ob.deadline_hours * 3600 * 1000);
        }
        contingent.push(link({
          jurisdiction: jur.short,
          authority: ob.authority,
          threshold,
          comparator,
          conditional_deadline: conditionalDeadline,
          condition: `Notice is required if ${thresholdPhrase} ${jur.short} residents are affected.`,
          citation: ob.citation,
          source_url: ob.source_url,
          statute: jur.statute,
        }, jur, ob));
        return;
      }

      // Compute deadline. Dependent obligations get null in pass 1 and are
      // resolved in pass 2.
      let deadline = null;
      if (!ob.deadline_relative_to) {
        if (ob.deadline_hours !== null && ob.deadline_hours !== undefined) {
          deadline = new Date(awarenessDate.getTime() + ob.deadline_hours * 3600 * 1000);
        }
      }

      // Build basis text — statutory-phrase repair (JDC review 2026-07-25):
      // the deadline language is per-obligation data (`deadline_phrase` in
      // data.js), never composed or hardcoded here. Composition is
      // "{citation} — {deadline_phrase}"; an obligation missing its phrase
      // falls back to the bare citation rather than any generic wording.
      const basis = ob.deadline_phrase ? `${ob.citation} — ${ob.deadline_phrase}` : ob.citation;

      let conditional = ob.condition || "";
      if (ob.gating?.residentThreshold !== undefined && !isNaN(residentCount)) {
        const threshold = ob.gating.residentThreshold;
        const comparator = ob.gating.comparator || "gte";
        const thresholdPhrase = comparator === "gt"
          ? `more than ${threshold.toLocaleString("en-US")}`
          : `${threshold.toLocaleString("en-US")} or more`;
        conditional = `${conditional} Triggered: ${residentCount.toLocaleString("en-US")} ${jur.short} residents affected (threshold: ${thresholdPhrase}).`;
      }

      deadlines.push(link({
        jurisdiction: jur.short,
        authority: ob.authority,
        deadline,
        basis,
        conditional: conditional.trim(),
        source_url: ob.source_url,
        statute: jur.statute,
      }, jur, ob));
    });
  });

  // Pass 2 — resolve dependent deadlines. Iterate in place; if a dependent's
  // parent didn't fire (or has no fixed deadline), drop the dependent.
  const resolved = [];
  deadlines.forEach((d) => {
    const meta = internals.get(d);
    if (!meta.relativeTo) {
      resolved.push(d);
      return;
    }
    const parent = deadlines.find(
      (p) => internals.get(p).jurId === meta.jurId && p.authority === meta.relativeTo.parent_authority
    );
    if (!parent || !parent.deadline) {
      // Parent didn't fire or has no fixed deadline — dependent has no anchor.
      // Drop silently (this is correct: if the resident notification doesn't
      // happen, the AG follow-up clock never starts).
      return;
    }
    if (meta.hours !== null && meta.hours !== undefined) {
      d.deadline = new Date(parent.deadline.getTime() + meta.hours * 3600 * 1000);
    }
    resolved.push(d);
  });

  // Pass 2b — resolve dependent CONDITIONAL deadlines the same way. The anchor
  // is looked up first among the resolved firing deadlines (CA's AG clock runs
  // from the resident notification, which is not threshold-gated and fires
  // normally) and then among the contingent entries themselves, so a dependent
  // whose parent is ALSO contingent still gets a conditional date. A parent
  // that is not in play at all drops the dependent, mirroring pass 2; a parent
  // with no fixed clock leaves the conditional date null rather than hiding a
  // potentially applicable obligation.
  const resolvedContingent = [];
  contingent.forEach((c) => {
    const meta = internals.get(c);
    if (!meta.relativeTo) {
      resolvedContingent.push(c);
      return;
    }
    const sameJur = (p) => internals.get(p).jurId === meta.jurId && p.authority === meta.relativeTo.parent_authority;
    const firmParent = resolved.find(sameJur);
    const contingentParent = firmParent ? null : contingent.find((p) => p !== c && sameJur(p));
    if (!firmParent && !contingentParent) return;
    const anchor = firmParent ? firmParent.deadline : contingentParent.conditional_deadline;
    if (anchor && meta.hours !== null && meta.hours !== undefined) {
      c.conditional_deadline = new Date(anchor.getTime() + meta.hours * 3600 * 1000);
    }
    resolvedContingent.push(c);
  });

  return { deadlines: resolved, suppressed, pending, review, contingent: resolvedContingent, services, advisories, ruleset_version: RULESET_VERSION };
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

const expectAll = (...checks) => (deadlines, suppressed, pending, review, services, advisories, contingent) => {
  const failures = checks
    .map((c) => c(deadlines, suppressed, pending, review, services, advisories, contingent))
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

// Review-bucket expectations (Stage 2 plumbing; first exercised by Stage 4's MA
// second-trigger cases). The bucket is empty until Stage 4, so no current case
// uses these.
const expectReview = (jurisdiction, authoritySubstring) => (deadlines, suppressed = [], pending = [], review = []) => {
  const found = review.find(
    (r) => r.jurisdiction === jurisdiction && r.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  return found
    ? { pass: true }
    : { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to require counsel review; got ${review.length} review: ${review.map((r) => `${r.jurisdiction}/${r.authority}`).join(" | ")}` };
};

const expectReviewCount = (n) => (deadlines, suppressed = [], pending = [], review = []) =>
  review.length === n
    ? { pass: true }
    : { pass: false, message: `Expected ${n} review obligations; got ${review.length}` };

// Basis assertions (statutory-phrase repair). The basis must be exactly
// "{citation} — {deadline_phrase}" as declared in data.js — these cases pin
// the four phrase repairs and prove the phrase flows from data, not code.
const expectBasis = (jurisdiction, authoritySubstring, expectedBasis) => (deadlines) => {
  const found = findDeadline(deadlines, jurisdiction, authoritySubstring);
  if (!found) return { pass: false, message: `${jurisdiction} / ${authoritySubstring} not found` };
  return found.basis === expectedBasis
    ? { pass: true }
    : { pass: false, message: `Expected basis "${expectedBasis}"; got "${found.basis}"` };
};

// Service / advisory expectations (category-conditioned pass).
const expectService = (jurisdiction, authoritySubstring, duration) => (deadlines, suppressed = [], pending = [], review = [], services = []) => {
  const found = services.find(
    (s) => s.jurisdiction === jurisdiction && s.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  if (!found) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" service to compute; got ${services.length} services: ${services.map((s) => `${s.jurisdiction}/${s.authority}`).join(" | ")}` };
  }
  if (duration !== undefined && found.service_duration_display !== duration) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" duration "${duration}"; got "${found.service_duration_display}"` };
  }
  return { pass: true };
};

const expectServiceCount = (n) => (deadlines, suppressed = [], pending = [], review = [], services = []) =>
  services.length === n
    ? { pass: true }
    : { pass: false, message: `Expected ${n} services; got ${services.length}: ${services.map((s) => `${s.jurisdiction}/${s.authority}`).join(" | ")}` };

const expectAdvisory = (jurisdiction, authoritySubstring, reason) => (deadlines, suppressed = [], pending = [], review = [], services = [], advisories = []) => {
  const found = advisories.find(
    (a) => a.jurisdiction === jurisdiction && a.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  if (!found) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" advisory; got ${advisories.length} advisories: ${advisories.map((a) => `${a.jurisdiction}/${a.authority}`).join(" | ")}` };
  }
  if (reason !== undefined && found.reason !== reason) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" advisory reason "${reason}"; got "${found.reason}"` };
  }
  return { pass: true };
};

const expectAdvisoryCount = (n) => (deadlines, suppressed = [], pending = [], review = [], services = [], advisories = []) =>
  advisories.length === n
    ? { pass: true }
    : { pass: false, message: `Expected ${n} advisories; got ${advisories.length}: ${advisories.map((a) => `${a.jurisdiction}/${a.authority}`).join(" | ")}` };

// Harm-gate expectations (harm-gate pass, 2026-08-02). The harm mechanism
// rides in the additive `suppression_reasons` array as
// { type: "harm", standard, citation, character }; `expected` may pin any of
// those three fields.
const expectHarmSuppressed = (jurisdiction, authoritySubstring, expected = {}) => (deadlines, suppressed = []) => {
  const found = suppressed.find(
    (s) => s.jurisdiction === jurisdiction && s.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );
  if (!found) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to be harm-suppressed; got ${suppressed.length} suppressions: ${suppressed.map((s) => `${s.jurisdiction}/${s.authority}`).join(" | ")}` };
  }
  const harm = (found.suppression_reasons || []).find((r) => r.type === "harm");
  if (!harm) {
    return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to carry a harm suppression reason; got [${(found.suppression_reasons || []).map((r) => r.type).join(", ")}]` };
  }
  for (const key of ["standard", "citation", "character"]) {
    if (expected[key] !== undefined && harm[key] !== expected[key]) {
      return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" harm ${key} "${expected[key]}"; got "${harm[key]}"` };
    }
  }
  return { pass: true };
};

// Contingent expectations (intake phase 2, unknown resident counts). Entries
// ride the seventh positional argument, so every pre-existing expectation is
// untouched. `expected` may pin the composed condition sentence, the threshold
// and comparator, and the conditional deadline as an hour offset off the
// awareness instant (`conditionalHours`, or explicitly null for a
// no-fixed-clock obligation).
const findContingent = (contingent, jurisdiction, authoritySubstring) =>
  (contingent || []).find(
    (c) => c.jurisdiction === jurisdiction && c.authority.toLowerCase().includes(authoritySubstring.toLowerCase())
  );

const expectContingent = (jurisdiction, authoritySubstring, expected = {}) =>
  (deadlines, suppressed = [], pending = [], review = [], services = [], advisories = [], contingent = []) => {
    const found = findContingent(contingent, jurisdiction, authoritySubstring);
    if (!found) {
      return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to be contingent; got ${contingent.length} contingent: ${contingent.map((c) => `${c.jurisdiction}/${c.authority}`).join(" | ")}` };
    }
    for (const key of ["condition", "threshold", "comparator", "citation"]) {
      if (expected[key] !== undefined && found[key] !== expected[key]) {
        return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" ${key} ${JSON.stringify(expected[key])}; got ${JSON.stringify(found[key])}` };
      }
    }
    if (expected.conditionalHours !== undefined) {
      if (expected.conditionalHours === null) {
        return found.conditional_deadline === null
          ? { pass: true }
          : { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" to have no conditional deadline; got ${found.conditional_deadline}` };
      }
      if (!found.conditional_deadline) {
        return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" conditional deadline at +${expected.conditionalHours}h; got null` };
      }
      const actualHours = (found.conditional_deadline.getTime() - TEST_AWARENESS.getTime()) / (3600 * 1000);
      if (Math.abs(actualHours - expected.conditionalHours) >= 0.01) {
        return { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" conditional deadline at +${expected.conditionalHours}h; got +${actualHours.toFixed(2)}h` };
      }
    }
    return { pass: true };
  };

const expectContingentCount = (n) =>
  (deadlines, suppressed = [], pending = [], review = [], services = [], advisories = [], contingent = []) =>
    contingent.length === n
      ? { pass: true }
      : { pass: false, message: `Expected ${n} contingent obligations; got ${contingent.length}: ${contingent.map((c) => `${c.jurisdiction}/${c.authority}`).join(" | ")}` };

const expectNotContingent = (jurisdiction, authoritySubstring) =>
  (deadlines, suppressed = [], pending = [], review = [], services = [], advisories = [], contingent = []) => {
    const found = findContingent(contingent, jurisdiction, authoritySubstring);
    return found
      ? { pass: false, message: `Expected ${jurisdiction} / "${authoritySubstring}" NOT to be contingent; but it was (${found.condition})` }
      : { pass: true };
  };


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
    facts: { jurisdictions: { eu: true }, riskLevel: "high", gdprUnintelligibility: "yes" },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDoesNotFire("EU GDPR", "Data Subjects"),
      expectSuppressed("EU GDPR", "Data Subjects", "unintelligibility_exemption")
    ),
  },
  {
    name: "EU GDPR: risk 'risk' + encryption → SA fires; Data Subjects risk-suppressed (risk gating precedes encryption)",
    category: "EU GDPR",
    facts: { jurisdictions: { eu: true }, riskLevel: "risk", gdprUnintelligibility: "yes" },
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
    facts: { jurisdictions: { uk: true }, riskLevel: "high", gdprUnintelligibility: "yes" },
    expect: expectAll(
      expectFires("UK GDPR", "ICO"),
      expectDoesNotFire("UK GDPR", "Data Subjects"),
      expectSuppressed("UK GDPR", "Data Subjects", "unintelligibility_exemption")
    ),
  },
  {
    name: "UK GDPR: risk 'risk' + encryption → ICO fires; Data Subjects risk-suppressed (risk gating precedes encryption)",
    category: "UK GDPR",
    facts: { jurisdictions: { uk: true }, riskLevel: "risk", gdprUnintelligibility: "yes" },
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
      encrypted: "yes",
      keyAcquired: "no",
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
    // Virginia pass (2026-08-29, F1=A): the VA encryption harbor carries an
    // array defeatedBy — BOTH keyAcquired and acquiredUnencrypted must be
    // affirmatively "no" for the harbor to hold (§ 18.2-186.6(C), both
    // branches).
    name: "Virginia + encryption (key not acquired, no unencrypted form acquired): all three obligations suppressed (definitional)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { va: true },
      residentCounts: { va: 5000 },
      sensitivity: ["financial"],
      encrypted: "yes",
      keyAcquired: "no",
      acquiredUnencrypted: "no",
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
    name: "Virginia + encryption, data acquired in unencrypted form: obligations fire (§ 18.2-186.6(C) first branch defeats the harbor)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { va: true },
      residentCounts: { va: 5000 },
      sensitivity: ["financial"],
      encrypted: "yes",
      keyAcquired: "no",
      acquiredUnencrypted: "yes",
    },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectFires("Virginia", "Consumer Reporting"),
      expectSuppressedCount(0)
    ),
  },
  {
    // whenUnset conservatism: an unset acquiredUnencrypted leaves the array
    // harbor unsatisfied — the obligations compute rather than being silently
    // excused. Old payloads (no acquiredUnencrypted key) land here.
    name: "Virginia + encryption, acquiredUnencrypted unset: obligations fire (array harbor needs every defeater affirmatively 'no')",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { va: true },
      residentCounts: { va: 5000 },
      sensitivity: ["financial"],
      encrypted: "yes",
      keyAcquired: "no",
    },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectFires("Virginia", "Consumer Reporting"),
      expectSuppressedCount(0)
    ),
  },
  {
    // String-path regression: a jurisdiction with a string defeatedBy
    // (Colorado) ignores acquiredUnencrypted entirely — its harbor is still
    // satisfied by keyAcquired "no" even when an unencrypted form was
    // acquired.
    name: "Colorado string-defeatedBy harbor unaffected by acquiredUnencrypted (regression on the string path)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { co: true },
      residentCounts: { co: 5000 },
      sensitivity: ["financial"],
      encrypted: "yes",
      keyAcquired: "no",
      acquiredUnencrypted: "yes",
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Colorado", "Colorado Residents"),
      expectSuppressed("Colorado", "Attorney General"),
      expectSuppressed("Colorado", "Consumer Reporting"),
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
  // Structured refusal (JDC 2026-08-22): incomplete facts return
  // { error: "incomplete_facts", missing } — never an empty obligation set.
  {
    name: "No jurisdictions selected → structured refusal (missing: jurisdictions)",
    category: "Edge cases",
    facts: { jurisdictions: {}, sensitivity: ["health"] },
    expectRefusal: ["jurisdictions"],
  },
  {
    name: "Selected jurisdictions but no awareness date → structured refusal (missing: awarenessDate)",
    category: "Edge cases",
    facts: { jurisdictions: { eu: true }, sensitivity: ["health"], _skipAwareness: true },
    expectRefusal: ["awarenessDate"],
  },
  {
    name: "Neither awareness nor jurisdictions → refusal lists both",
    category: "Edge cases",
    facts: { jurisdictions: {}, sensitivity: ["health"], _skipAwareness: true },
    expectRefusal: ["awarenessDate", "jurisdictions"],
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
    // S4 re-point: was "all three suppressed" (suppressedCount 3); MA's gate
    // flipped suppress→review and gained requiresStrength ge_128, so with the
    // harbor met (128-bit, key not acquired) all three route to REVIEW, not
    // suppression. Intended behavior change, not a silent rewrite.
    name: "MA + encryption (128-bit, key not acquired) → all three obligations require counsel review (§ 3(b) second trigger)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ma: true },
      sensitivity: ["financial"],
      encrypted: "yes",
      encryptionStrength: "ge_128",
      keyAcquired: "no",
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(0),
      expectReviewCount(3),
      expectReview("Massachusetts", "Massachusetts Residents"),
      expectReview("Massachusetts", "Attorney General"),
      expectReview("Massachusetts", "OCABR")
    ),
  },
  {
    name: "MA without encryption → all three obligations fire (no suppression)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ma: true },
      sensitivity: ["financial"],
      encrypted: "no",
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
      gdprUnintelligibility: "yes",
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
      gdprUnintelligibility: "yes",
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
      encrypted: "yes",
      keyAcquired: "no",
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
      encrypted: "yes",
      keyAcquired: "no",
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
      encrypted: "yes",
      keyAcquired: "no",
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Colorado", "Colorado Residents"),
      expectSuppressed("Colorado", "Attorney General"),
      expectSuppressed("Colorado", "Consumer Reporting"),
      expectSuppressedCount(3)
    ),
  },

  // === Encryption cluster — per-state safeHarbor gates (S3a) ===
  // New edges proving the per-obligation gates, beyond the re-pointed parity cases
  // above. The harbor applies ONLY when every condition is affirmatively
  // established; any unset/partial value → obligation fires.
  {
    name: "CA: encrypted but security credential / key also acquired → fires (not suppressed)",
    category: "Encryption cluster",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 1000 }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "yes" },
    expect: expectAll(
      expectFires("California", "California Residents"),
      expectFires("California", "Attorney General"),
      expectNotSuppressed("California", "California Residents")
    ),
  },
  {
    name: "CO: encrypted but key also acquired → fires (§ 6-1-716(2)(a.4) re-trigger)",
    category: "Encryption cluster",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 5000 }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "yes" },
    expect: expectAll(
      expectFires("Colorado", "Colorado Residents"),
      expectFires("Colorado", "Attorney General"),
      expectFires("Colorado", "Consumer Reporting")
    ),
  },
  {
    name: "VA: redacted, re-identification info NOT acquired → suppressed (redaction harbor)",
    category: "Encryption cluster",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 5000 }, sensitivity: ["financial"], redacted: "yes", reidentificationAcquired: "no" },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Virginia", "Virginia Residents", "breach_definition"),
      expectSuppressed("Virginia", "Attorney General", "breach_definition"),
      expectSuppressed("Virginia", "Consumer Reporting", "breach_definition")
    ),
  },
  {
    name: "VA: redacted but re-identification info also acquired → fires",
    category: "Encryption cluster",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 5000 }, sensitivity: ["financial"], redacted: "yes", reidentificationAcquired: "yes" },
    expect: expectAll(
      expectFires("Virginia", "Virginia Residents"),
      expectFires("Virginia", "Attorney General"),
      expectFires("Virginia", "Consumer Reporting")
    ),
  },
  {
    name: "Conservative unset: encrypted=yes but keyAcquired unset → fires (harbor needs key affirmatively not acquired)",
    category: "Encryption cluster",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 1000 }, sensitivity: ["financial"], encrypted: "yes" },
    expect: expectAll(
      expectFires("California", "California Residents"),
      expectNotSuppressed("California", "California Residents")
    ),
  },
  {
    name: "CA: encryption strength is irrelevant for non-MA states — encrypted + key not acquired + below_128 → still suppressed",
    category: "Encryption cluster",
    facts: { jurisdictions: { ca: true }, residentCounts: { ca: 1000 }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "no", encryptionStrength: "below_128" },
    expect: expectSuppressed("California", "California Residents", "breach_definition"),
  },

  // === MA second-trigger review gate (S4) ===
  // MA's harbor is met only when encrypted AND 128-bit-or-higher AND key not
  // acquired — and even then it routes to REVIEW (the § 3(b) second trigger has no
  // encryption qualifier), never silent suppression. Any weaker fact → MA fires.
  {
    name: "MA: encrypted + 128-bit + key ACQUIRED → fires (harbor defeated by key)",
    category: "MA review gate",
    facts: { jurisdictions: { ma: true }, sensitivity: ["financial"], encrypted: "yes", encryptionStrength: "ge_128", keyAcquired: "yes" },
    expect: expectAll(expectCount(3), expectReviewCount(0), expectSuppressedCount(0)),
  },
  {
    name: "MA: encrypted but below 128-bit → fires (MA harbor requires 128-bit-or-higher)",
    category: "MA review gate",
    facts: { jurisdictions: { ma: true }, sensitivity: ["financial"], encrypted: "yes", encryptionStrength: "below_128", keyAcquired: "no" },
    expect: expectAll(expectCount(3), expectReviewCount(0), expectSuppressedCount(0)),
  },
  {
    name: "MA: encrypted, strength Unknown → fires (conservative — 128-bit not affirmatively met)",
    category: "MA review gate",
    facts: { jurisdictions: { ma: true }, sensitivity: ["financial"], encrypted: "yes", encryptionStrength: "unknown", keyAcquired: "no" },
    expect: expectAll(expectCount(3), expectReviewCount(0), expectSuppressedCount(0)),
  },
  {
    name: "MA: encrypted, strength UNSET → fires (conservative — harbor needs strength affirmatively ge_128)",
    category: "MA review gate",
    facts: { jurisdictions: { ma: true }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "no" },
    expect: expectAll(expectCount(3), expectReviewCount(0), expectSuppressedCount(0)),
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
      encrypted: "yes",
      keyAcquired: "no",
    },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("California", "California Residents"),
      expectSuppressed("California", "Attorney General")
    ),
  },

  // === Multi-jurisdiction encryption interaction ===
  {
    // S4 re-point: was MA fully suppressed (suppressedCount 4). With MA's gate now
    // review + ge_128, MA routes to REVIEW while EU SA fires and EU DS is
    // suppressed — firing + suppressed + review co-occurring in one result.
    name: "MA + EU + encryption (128-bit): MA routes to review; EU Art. 33 fires, EU Art. 34 suppressed (firing + suppressed + review together)",
    category: "Encryption suppression",
    facts: {
      jurisdictions: { ma: true, eu: true },
      sensitivity: ["financial"],
      riskLevel: "high",
      gdprUnintelligibility: "yes",
      encrypted: "yes",
      encryptionStrength: "ge_128",
      keyAcquired: "no",
    },
    expect: expectAll(
      expectFires("EU GDPR", "Supervisory Authority"),
      expectDoesNotFire("EU GDPR", "Data Subjects"),
      expectReview("Massachusetts", "Massachusetts Residents"),
      expectReview("Massachusetts", "Attorney General"),
      expectReview("Massachusetts", "OCABR"),
      expectSuppressed("EU GDPR", "Data Subjects"),
      expectSuppressedCount(1),
      expectReviewCount(3),
      expectCount(1)
    ),
  },

  // === Delaware — § 12B-102 boundaries, cascade, encryption (intake § 9.10) ===
  {
    name: "Delaware: 1 resident → individual fires (60d from determination-as-awareness); AG does NOT (1 not >500)",
    category: "Delaware — boundaries",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 1 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Delaware", "Delaware Residents"),
      expectDeadlineHoursFromAwareness("Delaware", "Delaware Residents", 60 * 24),
      expectDoesNotFire("Delaware", "Attorney General")
    ),
  },
  {
    name: "Delaware: 500 residents does NOT trigger AG (statute says 'exceeds 500' — gt boundary)",
    category: "Delaware — boundaries",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 500 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Delaware", "Delaware Residents"),
      expectDoesNotFire("Delaware", "Attorney General")
    ),
  },
  {
    name: "Delaware: 501 residents → both fire; AG deadline equals the resident deadline (0-hour cascade)",
    category: "Delaware — boundaries",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 501 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Delaware", "Delaware Residents"),
      expectFires("Delaware", "Attorney General"),
      expectDeadlineHoursFromAwareness("Delaware", "Delaware Residents", 60 * 24),
      expectDeadlineHoursFromAwareness("Delaware", "Attorney General", 60 * 24)
    ),
  },
  {
    name: "Delaware + encryption (key not acquired) → both obligations suppressed (definitional)",
    category: "Delaware — encryption",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 501 }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "no" },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Delaware", "Delaware Residents", "breach_definition"),
      expectSuppressed("Delaware", "Attorney General", "breach_definition")
    ),
  },
  {
    name: "Delaware: encrypted but key also acquired → both fire (harbor defeated)",
    category: "Delaware — encryption",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 501 }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "yes" },
    expect: expectAll(
      expectFires("Delaware", "Delaware Residents"),
      expectFires("Delaware", "Attorney General"),
      expectSuppressedCount(0)
    ),
  },
  {
    name: "Delaware: missing resident count fires individual but not AG (threshold-gated, no count)",
    category: "Delaware — boundaries",
    facts: { jurisdictions: { de: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Delaware", "Delaware Residents"),
      expectDoesNotFire("Delaware", "Attorney General")
    ),
  },

  // === Category-gated service obligations & advisories (JDC review 2026-07-25) ===
  {
    name: "Delaware + ssn → 1-year credit-monitoring service computed (§ 12B-102(e))",
    category: "Service obligations",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 100 }, sensitivity: ["identifiers", "ssn"] },
    expect: expectAll(
      expectService("Delaware", "Credit Monitoring", "1 year"),
      expectServiceCount(1),
      expectAdvisoryCount(0)
    ),
  },
  {
    name: "Delaware + gov_id without ssn → service absent; 'ssn_unconfirmed' conditional advisory",
    category: "Service obligations",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 100 }, sensitivity: ["gov_id"] },
    expect: expectAll(
      expectServiceCount(0),
      expectAdvisory("Delaware", "Credit Monitoring", "ssn_unconfirmed"),
      expectAdvisoryCount(1)
    ),
  },
  {
    name: "Delaware + credentials → § 12B-102(f) declared advisory (email-credential notice restriction)",
    category: "Service obligations",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 100 }, sensitivity: ["credentials"] },
    expect: expectAll(
      expectServiceCount(0),
      expectAdvisory("Delaware", "Email-credential"),
      expectAdvisoryCount(1)
    ),
  },
  {
    name: "Colorado + credentials → § 6-1-716(2)(a.3) declared advisory (login-credential misuse direction)",
    category: "Service obligations",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 100 }, sensitivity: ["credentials"] },
    expect: expectAll(
      expectAdvisory("Colorado", "Login-credential"),
      expectAdvisoryCount(1),
      expectServiceCount(0)
    ),
  },
  {
    name: "Colorado without credentials → no § 6-1-716(2)(a.3) advisory",
    category: "Service obligations",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 100 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectAdvisoryCount(0),
      expectServiceCount(0)
    ),
  },
  {
    name: "Delaware + ssn + encryption (key not acquired) → service does not compute; obligations suppressed",
    category: "Service obligations",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 501 }, sensitivity: ["ssn"], encrypted: "yes", keyAcquired: "no" },
    expect: expectAll(
      expectServiceCount(0),
      expectSuppressed("Delaware", "Delaware Residents", "breach_definition"),
      expectSuppressed("Delaware", "Attorney General", "breach_definition")
    ),
  },
  {
    name: "MA + ssn → 18-month credit-monitoring service computed (c. 93H § 3A(a)); three obligations fire",
    category: "Service obligations",
    facts: { jurisdictions: { ma: true }, sensitivity: ["ssn"] },
    expect: expectAll(
      expectCount(3),
      expectService("Massachusetts", "Credit Monitoring", "18 months"),
      expectServiceCount(1)
    ),
  },
  {
    name: "MA + ssn + encryption (128-bit, key not acquired) → service does not compute; obligations route to review (§ 1 mechanism)",
    category: "Service obligations",
    facts: { jurisdictions: { ma: true }, sensitivity: ["ssn"], encrypted: "yes", encryptionStrength: "ge_128", keyAcquired: "no" },
    expect: expectAll(
      expectServiceCount(0),
      expectReviewCount(3),
      expectSuppressedCount(0),
      expectCount(0)
    ),
  },
  {
    name: "MA + gov_id without ssn → 'ssn_unconfirmed' advisory for the § 3A service",
    category: "Service obligations",
    facts: { jurisdictions: { ma: true }, sensitivity: ["gov_id"] },
    expect: expectAll(
      expectServiceCount(0),
      expectAdvisory("Massachusetts", "Credit Monitoring", "ssn_unconfirmed"),
      expectAdvisoryCount(1)
    ),
  },

  // === Connecticut — Conn. Gen. Stat. § 36a-701b (tenth jurisdiction) ===
  {
    name: "Connecticut: individual + AG both compute at 60 days from discovery-as-awareness; no CRA obligation",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Connecticut", "Connecticut Residents"),
      expectFires("Connecticut", "Attorney General"),
      expectDeadlineHoursFromAwareness("Connecticut", "Connecticut Residents", 60 * 24),
      expectDeadlineHoursFromAwareness("Connecticut", "Attorney General", 60 * 24),
      expectDoesNotFire("Connecticut", "Consumer Reporting"),
      expectCount(2)
    ),
  },
  {
    name: "Connecticut: AG computes with a blank resident count (no threshold — count is informational)",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Connecticut", "Connecticut Residents"),
      expectFires("Connecticut", "Attorney General"),
      expectCount(2)
    ),
  },
  {
    name: "Connecticut: AG computes at a count of 1 (required regardless of the number affected)",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 1 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectFires("Connecticut", "Attorney General"),
      expectCount(2)
    ),
  },
  {
    name: "Connecticut + ssn → 2-year identity-theft-prevention service computed (§ 36a-701b(b)(2)(B))",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"] },
    expect: expectAll(
      expectService("Connecticut", "Identity Theft Prevention", "2 years"),
      expectServiceCount(1),
      expectAdvisoryCount(0)
    ),
  },
  {
    name: "Connecticut + gov_id without ssn → service absent; 'ssn_unconfirmed' conditional advisory",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["gov_id"] },
    expect: expectAll(
      expectServiceCount(0),
      expectAdvisory("Connecticut", "Identity Theft Prevention", "ssn_unconfirmed"),
      expectAdvisoryCount(1)
    ),
  },
  {
    name: "Connecticut with neither ssn nor gov_id → no service, no advisory",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectServiceCount(0),
      expectAdvisoryCount(0)
    ),
  },
  {
    name: "Connecticut + credentials → § 36a-701b(f) declared advisory (login-credential notice method)",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["credentials"] },
    expect: expectAll(
      expectAdvisory("Connecticut", "Login-credential"),
      expectAdvisoryCount(1),
      expectServiceCount(0)
    ),
  },
  {
    name: "Connecticut + ssn + encryption (key not acquired) → individual + AG suppressed AND service does not compute",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"], encrypted: "yes", keyAcquired: "no" },
    expect: expectAll(
      expectCount(0),
      expectSuppressed("Connecticut", "Connecticut Residents", "breach_definition"),
      expectSuppressed("Connecticut", "Attorney General", "breach_definition"),
      expectServiceCount(0)
    ),
  },
  {
    name: "Connecticut: encrypted but key also acquired → computes (conservative — no statutory key proviso; see counsel note)",
    category: "Connecticut",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"], encrypted: "yes", keyAcquired: "yes" },
    expect: expectAll(
      expectFires("Connecticut", "Connecticut Residents"),
      expectFires("Connecticut", "Attorney General"),
      expectService("Connecticut", "Identity Theft Prevention", "2 years"),
      expectSuppressedCount(0)
    ),
  },

  // === Statutory deadline phrases — basis is "{citation} — {deadline_phrase}" from data.js ===
  {
    name: "Phrase: VA individual basis renders 'without unreasonable delay' (not the GDPR wording)",
    category: "Statutory phrases",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 100 }, sensitivity: ["identifiers"] },
    expect: expectBasis("Virginia", "Virginia Residents", "Va. Code Ann. § 18.2-186.6(B) — without unreasonable delay"),
  },
  {
    name: "Phrase: EU Art. 34 basis renders 'without undue delay'",
    category: "Statutory phrases",
    facts: { jurisdictions: { eu: true }, riskLevel: "high" },
    expect: expectBasis("EU GDPR", "Data Subjects", "Art. 34 GDPR — without undue delay"),
  },
  {
    name: "Phrase: EU Art. 33 basis renders '72 hours from awareness' (statutory hours, not computed days)",
    category: "Statutory phrases",
    facts: { jurisdictions: { eu: true }, riskLevel: "risk" },
    expect: expectBasis("EU GDPR", "Supervisory Authority", "Art. 33 GDPR — 72 hours from awareness"),
  },
  {
    name: "Phrase: DE AG basis renders 'no later than notice to residents' (no '0 days from notification' artifact)",
    category: "Statutory phrases",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 501 }, sensitivity: ["identifiers"] },
    expect: expectBasis("Delaware", "Attorney General", "6 Del. C. § 12B-102(d) — no later than notice to residents"),
  },

  // === Harm-assessment gate (harm-gate pass commit 1, 2026-08-02) ===
  // "determined_unlikely" is the ONLY suppressing value; every other value —
  // including "" and "harm_likely" — changes nothing in computation. Standards
  // are pinned as literals so a data.js edit fails here.
  {
    name: "CT: harm determined unlikely → residents + AG + (b)(2)(B) service all harm-suppressed; nothing computes",
    category: "Harm gate",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectServiceCount(0),
      expectSuppressedCount(3),
      expectHarmSuppressed("Connecticut", "Connecticut Residents", { citation: "Conn. Gen. Stat. § 36a-701b(b)(1)", character: "exemption", standard: "Such notification shall not be required if, after an appropriate investigation the person reasonably determines that the breach will not likely result in harm to the individuals whose personal information has been acquired or accessed." }),
      expectHarmSuppressed("Connecticut", "Attorney General", { citation: "Conn. Gen. Stat. § 36a-701b(b)(1)" }),
      expectHarmSuppressed("Connecticut", "Identity Theft Prevention", { citation: "Conn. Gen. Stat. § 36a-701b(b)(1)" })
    ),
  },
  {
    name: "CT: harm not assessed ('') → everything computes exactly as without the question",
    category: "Harm gate",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"], harmAssessment: "" },
    expect: expectAll(
      expectCount(2),
      expectService("Connecticut", "Identity Theft Prevention", "2 years"),
      expectSuppressedCount(0)
    ),
  },
  {
    name: "CT: harm_likely → identical computation (differs only in memo recording, commit 2)",
    category: "Harm gate",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"], harmAssessment: "harm_likely" },
    expect: expectAll(
      expectCount(2),
      expectService("Connecticut", "Identity Theft Prevention", "2 years"),
      expectSuppressedCount(0)
    ),
  },
  {
    name: "CT: invalid harmAssessment ('Determined_Unlikely') is inert — only the exact sentinel suppresses",
    category: "Harm gate",
    facts: { jurisdictions: { ct: true }, residentCounts: { ct: 800 }, sensitivity: ["ssn"], harmAssessment: "Determined_Unlikely" },
    expect: expectAll(
      expectCount(2),
      expectService("Connecticut", "Identity Theft Prevention", "2 years"),
      expectSuppressedCount(0)
    ),
  },
  {
    name: "DE: harm determined unlikely → residents + AG + credit-monitoring service harm-suppressed; the service carries its OWN § 12B-102(e) gate",
    category: "Harm gate",
    facts: { jurisdictions: { de: true }, residentCounts: { de: 501 }, sensitivity: ["ssn"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectServiceCount(0),
      expectSuppressedCount(3),
      expectHarmSuppressed("Delaware", "Delaware Residents", { citation: "6 Del. C. § 12B-102(a)", standard: "unlikely to result in harm to the individuals whose personal information has been breached" }),
      expectHarmSuppressed("Delaware", "Attorney General", { citation: "6 Del. C. § 12B-102(a)" }),
      expectHarmSuppressed("Delaware", "Credit Monitoring", { citation: "6 Del. C. § 12B-102(e)", standard: "unlikely to result in harm to the individuals whose personal information has been breached" })
    ),
  },
  {
    name: "CO: harm determined unlikely → residents + AG + CRA harm-suppressed; residents/CRA carry the (2)(a) standard, the AG the deliberately different (2)(f)(I) standard",
    category: "Harm gate",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 5000 }, sensitivity: ["identifiers"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(3),
      expectHarmSuppressed("Colorado", "Colorado Residents", { citation: "Colo. Rev. Stat. § 6-1-716(2)(a)", standard: "the misuse of information about a Colorado resident has not occurred and is not reasonably likely to occur" }),
      expectHarmSuppressed("Colorado", "Attorney General", { citation: "Colo. Rev. Stat. § 6-1-716(2)(f)(I)", standard: "the misuse of information about a Colorado resident has not occurred and is not likely to occur" }),
      expectHarmSuppressed("Colorado", "Consumer Reporting", { citation: "Colo. Rev. Stat. § 6-1-716(2)(a)" }),
      (deadlines, suppressed = []) => {
        const harmOf = (auth) => suppressed
          .find((s) => s.jurisdiction === "Colorado" && s.authority.includes(auth))
          ?.suppression_reasons?.find((r) => r.type === "harm")?.standard;
        const res = harmOf("Colorado Residents");
        const ag = harmOf("Attorney General");
        return res && ag && res !== ag
          ? { pass: true }
          : { pass: false, message: `Expected the CO resident and AG harm standards to be different strings; got "${res}" vs "${ag}"` };
      }
    ),
  },
  {
    name: "VA: harm determined unlikely → all three suppressed as a NEGATED DUTY ELEMENT (character 'duty_element'), never an exemption",
    category: "Harm gate",
    facts: { jurisdictions: { va: true }, residentCounts: { va: 5000 }, sensitivity: ["identifiers"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(3),
      expectHarmSuppressed("Virginia", "Virginia Residents", { citation: "Va. Code Ann. § 18.2-186.6(B)", character: "duty_element", standard: "causes, or the individual or entity reasonably believes has caused or will cause, identity theft or another fraud to any resident of the Commonwealth" }),
      expectHarmSuppressed("Virginia", "Attorney General", { character: "duty_element" }),
      expectHarmSuppressed("Virginia", "Consumer Reporting", { character: "duty_element" })
    ),
  },
  {
    name: "NY: harm determined unlikely → all five obligations still compute (no harmGate — § 899-aa(2)(a) needs inadvertent disclosure by an authorized person)",
    category: "Harm gate",
    facts: { jurisdictions: { ny: true }, residentCounts: { ny: 10000 }, sensitivity: ["identifiers"], harmAssessment: "determined_unlikely" },
    expect: expectAll(expectCount(5), expectSuppressedCount(0)),
  },
  {
    name: "MA: harm determined unlikely → all three obligations + the § 3A service still compute (second trigger has no harm qualifier)",
    category: "Harm gate",
    facts: { jurisdictions: { ma: true }, sensitivity: ["ssn"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(3),
      expectService("Massachusetts", "Credit Monitoring", "18 months"),
      expectServiceCount(1),
      expectSuppressedCount(0),
      expectReviewCount(0)
    ),
  },
  {
    name: "CA + TX: harm determined unlikely is inert (harmGate absent) — everything computes",
    category: "Harm gate",
    facts: { jurisdictions: { ca: true, tx: true }, residentCounts: { ca: 1000, tx: 300 }, sensitivity: ["identifiers"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectFires("California", "California Residents"),
      expectFires("California", "Attorney General"),
      expectFires("Texas", "Texas Residents"),
      expectFires("Texas", "Attorney General"),
      expectCount(4),
      expectSuppressedCount(0)
    ),
  },
  {
    name: "CO + encryption + harm determined unlikely → ONE suppressed entry per obligation carrying BOTH reasons (encryption first)",
    category: "Harm gate",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 5000 }, sensitivity: ["financial"], encrypted: "yes", keyAcquired: "no", harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(3),
      (deadlines, suppressed = []) => {
        const failures = [];
        for (const s of suppressed) {
          const types = (s.suppression_reasons || []).map((r) => r.type);
          if (types.length !== 2 || types[0] !== "breach_definition" || types[1] !== "harm") {
            failures.push(`${s.authority}: reasons [${types.join(", ")}]`);
          }
          if (s.suppression_type !== "breach_definition") {
            failures.push(`${s.authority}: flat type "${s.suppression_type}"`);
          }
        }
        return failures.length === 0
          ? { pass: true }
          : { pass: false, message: `Expected [breach_definition, harm] with breach_definition flat fields on each entry; ${failures.join("; ")}` };
      }
    ),
  },
  {
    name: "EU: harm determined unlikely does not touch risk gating — both GDPR obligations stay pending with riskLevel unset",
    category: "Harm gate",
    facts: { jurisdictions: { eu: true }, harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(0),
      expectPending("EU GDPR", "Supervisory Authority"),
      expectPending("EU GDPR", "Data Subjects")
    ),
  },
  // === Contingent deadlines — unknown resident counts (intake phase 2) ===
  // `residentCountUnknown` holds a threshold-gated obligation as CONTINGENT
  // instead of dropping it: live but for a count that has not been
  // established. Suppression and review outrank contingency; a numeric count
  // always beats the flag; a KNOWN below-threshold count is unchanged.
  {
    name: "CO unknown count: residents fire with a firm 30-day deadline (no threshold); AG and CRA are contingent",
    category: "Contingent deadlines",
    facts: { jurisdictions: { co: true }, residentCountUnknown: { co: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectCount(1),
      expectFires("Colorado", "Colorado Residents"),
      expectDeadlineHoursFromAwareness("Colorado", "Colorado Residents", 30 * 24),
      expectContingentCount(2),
      expectContingent("Colorado", "Attorney General", {
        threshold: 500,
        comparator: "gte",
        conditionalHours: 30 * 24,
        citation: "Colo. Rev. Stat. § 6-1-716(2)(f)(I)",
        condition: "Notice is required if 500 or more Colorado residents are affected.",
      }),
      expectContingent("Colorado", "Consumer Reporting", {
        threshold: 1000,
        comparator: "gt",
        conditionalHours: null,
        condition: "Notice is required if more than 1,000 Colorado residents are affected.",
      }),
      expectSuppressedCount(0)
    ),
  },
  {
    name: "CA unknown count: AG is contingent at the conditional resident deadline + 15 days (dependent clock resolves)",
    category: "Contingent deadlines",
    facts: { jurisdictions: { ca: true }, residentCountUnknown: { ca: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectCount(1),
      expectFires("California", "California Residents"),
      expectDeadlineHoursFromAwareness("California", "California Residents", 30 * 24),
      expectContingentCount(1),
      expectContingent("California", "Attorney General", {
        threshold: 500,
        comparator: "gt",
        conditionalHours: 45 * 24,
        condition: "Notice is required if more than 500 California residents are affected.",
      })
    ),
  },
  {
    name: "CO unknown count + encryption (key not acquired): everything suppressed, ZERO contingent (suppression outranks contingency)",
    category: "Contingent deadlines",
    facts: {
      jurisdictions: { co: true },
      residentCountUnknown: { co: true },
      sensitivity: ["financial"],
      encrypted: "yes",
      keyAcquired: "no",
    },
    expect: expectAll(
      expectCount(0),
      expectContingentCount(0),
      expectSuppressedCount(3),
      expectSuppressed("Colorado", "Colorado Residents", "breach_definition"),
      expectSuppressed("Colorado", "Attorney General", "breach_definition"),
      expectSuppressed("Colorado", "Consumer Reporting", "breach_definition")
    ),
  },
  {
    name: "CO unknown count + harm determined unlikely: harm-suppressed, ZERO contingent",
    category: "Contingent deadlines",
    facts: {
      jurisdictions: { co: true },
      residentCountUnknown: { co: true },
      sensitivity: ["identifiers"],
      harmAssessment: "determined_unlikely",
    },
    expect: expectAll(
      expectCount(0),
      expectContingentCount(0),
      expectSuppressedCount(3),
      expectHarmSuppressed("Colorado", "Attorney General", { citation: "Colo. Rev. Stat. § 6-1-716(2)(f)(I)" })
    ),
  },
  {
    name: "Numeric count beats a stale unknown flag: CO 5,000 computes AG + CRA, nothing contingent",
    category: "Contingent deadlines",
    facts: {
      jurisdictions: { co: true },
      residentCounts: { co: 5000 },
      residentCountUnknown: { co: true },
      sensitivity: ["identifiers"],
    },
    expect: expectAll(
      expectCount(3),
      expectFires("Colorado", "Attorney General"),
      expectFires("Colorado", "Consumer Reporting"),
      expectContingentCount(0)
    ),
  },
  {
    name: "Known below-threshold count is UNCHANGED: CO 100 leaves AG/CRA silently absent, not contingent",
    category: "Contingent deadlines",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 100 }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectCount(1),
      expectFires("Colorado", "Colorado Residents"),
      expectDoesNotFire("Colorado", "Attorney General"),
      expectContingentCount(0),
      expectNotContingent("Colorado", "Attorney General"),
      expectNotContingent("Colorado", "Consumer Reporting")
    ),
  },
  {
    name: "Unknown flag without a threshold-gated obligation changes nothing (MA has no thresholds)",
    category: "Contingent deadlines",
    facts: { jurisdictions: { ma: true }, residentCountUnknown: { ma: true }, sensitivity: ["identifiers"] },
    expect: expectAll(expectCount(3), expectContingentCount(0)),
  },
  {
    name: "DE unknown count: AG is contingent on the 0-hour cascade — conditional deadline equals the resident deadline",
    category: "Contingent deadlines",
    facts: { jurisdictions: { de: true }, residentCountUnknown: { de: true }, sensitivity: ["identifiers"] },
    expect: expectAll(
      expectCount(1),
      expectDeadlineHoursFromAwareness("Delaware", "Delaware Residents", 60 * 24),
      expectContingentCount(1),
      expectContingent("Delaware", "Attorney General", {
        threshold: 500,
        comparator: "gt",
        conditionalHours: 60 * 24,
        condition: "Notice is required if more than 500 Delaware residents are affected.",
      })
    ),
  },
  {
    name: "Unknown counts are per jurisdiction: CO unknown + CA 1,000 known — CO AG/CRA contingent while CA AG computes",
    category: "Contingent deadlines",
    facts: {
      jurisdictions: { co: true, ca: true },
      residentCounts: { ca: 1000 },
      residentCountUnknown: { co: true },
      sensitivity: ["identifiers"],
    },
    expect: expectAll(
      expectFires("California", "Attorney General"),
      expectFires("Colorado", "Colorado Residents"),
      expectDoesNotFire("Colorado", "Attorney General"),
      expectContingentCount(2),
      expectContingent("Colorado", "Attorney General"),
      expectContingent("Colorado", "Consumer Reporting"),
      expectNotContingent("California", "Attorney General")
    ),
  },
  {
    name: "CO: harm suppression respects thresholds — a below-threshold AG/CRA stays silently absent, not suppressed",
    category: "Harm gate",
    facts: { jurisdictions: { co: true }, residentCounts: { co: 100 }, sensitivity: ["identifiers"], harmAssessment: "determined_unlikely" },
    expect: expectAll(
      expectCount(0),
      expectSuppressedCount(1),
      expectHarmSuppressed("Colorado", "Colorado Residents"),
      expectNotSuppressed("Colorado", "Attorney General"),
      expectNotSuppressed("Colorado", "Consumer Reporting")
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
      const r = computeDeadlines(facts);
      if (t.expectRefusal) {
        const got = r && r.error === "incomplete_facts" ? r.missing : null;
        const pass = !!got && JSON.stringify(got) === JSON.stringify(t.expectRefusal) && !("deadlines" in r);
        return {
          name: t.name,
          category: t.category,
          pass,
          message: pass ? "refused as expected" : `expected refusal ${JSON.stringify(t.expectRefusal)}, got ${JSON.stringify(r)}`,
        };
      }
      if (r.error) throw new Error(`unexpected refusal: ${JSON.stringify(r)}`);
      const { deadlines, suppressed, pending, review, services, advisories, contingent } = r;
      const result = t.expect(deadlines, suppressed, pending, review, services, advisories, contingent);
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

export { isHighRisk, computeDeadlines, runTests, TEST_CASES, TEST_AWARENESS, INCOMPLETE_FACTS };
