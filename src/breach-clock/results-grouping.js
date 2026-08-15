// =============================================================================
// results-grouping.js — PRESENTATION logic (NOT engine logic).
//
// Pure, shared regrouping of the engine's flat result buckets (deadlines,
// suppressed, review) plus each selected jurisdiction's counsel notes into
// jurisdiction-first blocks. Consumed by BOTH the on-screen results page
// (BreachClock.jsx) and the PDF memo (memo-pdf-core.js) so the two surfaces
// cannot drift in how output is grouped, ordered, or placed.
//
// This file performs NO legal computation. It only regroups and reorders
// objects the engine already produced; engine.js / data.js are untouched. The
// card and note objects it receives/reads are passed through by reference, not
// rebuilt — content, copy, citations, and within-card ordering are exactly as
// the engine emitted and as data.js declares.
//
// Counsel-note PLACEMENT. Each note in data.js carries a `placement`
// ("caveat" | "parallel" | "sectoral") and, for parallels, an `anchor` ("ag").
// This module relocates notes out of a trailing bucket and into position
// relative to their obligations:
//   - caveatNotes   (placement "caveat")   → one group ABOVE the obligation cards
//   - obligations[].parallelNotes (placement "parallel") → attached to the
//                    obligation whose kind matches the note's anchor ("ag" → the
//                    Attorney General obligation), to render immediately AFTER
//                    that card
//   - sectoralNotes (placement "sectoral") → one group at the block FOOT
// A parallel note whose anchored obligation did not fire (e.g. encryption-
// suppressed AG) has no card to sit under; rather than drop a counsel note it
// falls back to footParallelNotes, rendered at the block foot.
//
// The `pending` bucket is intentionally NOT grouped here. It renders as a single
// consolidated "Risk assessment required" banner above the blocks, so a
// pending-only jurisdiction (EU/UK awaiting a risk assessment) produces no
// block — its state is spoken by that banner.
//
// SERVICES & ADVISORIES (category-conditioned pass, commit 2). The engine's
// additive `services` and `advisories` arrays are grouped here too:
//   - serviceCards  — computed service obligations, passed through by
//     reference; render after the jurisdiction's deadline cards.
//   - advisoryCards — DISPLAY objects built by `advisoryDisplay` below (the
//     one place the auto-advisory title/body copy is composed, so the screen
//     and the memo cannot drift); render after the service cards.
//
// CONTINGENT DEADLINES (intake phase 2). The engine's `contingent` bucket —
// threshold-gated obligations live but for an unestablished resident count —
// groups into `contingentCards`, passed through by reference. Within-block
// position is fixed on both surfaces: active deadline cards → Contingent
// Deadlines → counsel review → suppressed → notes. The group heading and its
// explainer are exported below (CONTINGENT_LABEL / CONTINGENT_EXPLAINER) so
// the screen and the memo print the same words.
// =============================================================================

import { JURISDICTIONS } from "./data.js";

// CROSS_BLOCK_URGENCY_FIRST — block order ACROSS jurisdictions.
//   true  → jurisdictions with at least one active deadline first, ordered by
//           soonest deadline; then jurisdictions with no active deadline;
//           canonical data.js order as the tie-break.
//   false → fixed canonical data.js order, ignoring urgency.
export const CROSS_BLOCK_URGENCY_FIRST = true;

// Canonical short-name → metadata lookup over the data.js jurisdiction list.
// kindByAuthority maps each obligation's display authority to its `kind`, so a
// parallel note's anchor ("ag") can be matched to the firing card whose
// obligation kind is "ag" (the Attorney General).
const BY_SHORT = new Map(
  JURISDICTIONS.map((j, index) => [
    j.short,
    {
      id: j.id,
      name: j.name,
      statute: j.statute,
      index,
      kindByAuthority: new Map((j.obligations || []).map((o) => [o.authority, o.kind])),
    },
  ])
);

const isDate = (v) => v instanceof Date || (v && typeof v.getTime === "function");

// Urgency tier for an active deadline card, expressing the three stated tiers:
//   0 — fixed-hour deadline (a real Date), sub-ordered ascending by that date;
//   1 — "without undue delay" (GDPR Art. 34, no fixed hour);
//   2 — "no fixed clock / without unreasonable delay" (US no-clock obligations).
// Tiers 1 and 2 never co-occur inside a single jurisdiction block (a block is
// one statute family), so their relative rank is moot in practice; the tiers are
// expressed for faithfulness and so the order is easy to reason about and flip.
function activeTier(card) {
  if (isDate(card.deadline)) return 0;
  const meta = BY_SHORT.get(card.jurisdiction);
  if (meta && (meta.id === "eu" || meta.id === "uk")) return 1;
  return 2;
}

function sortActiveCards(cards) {
  return cards
    .map((card, i) => ({
      card,
      i,
      tier: activeTier(card),
      t: isDate(card.deadline) ? card.deadline.getTime() : Infinity,
    }))
    // Stable: tier, then soonest date, then original engine order.
    .sort((a, b) => a.tier - b.tier || a.t - b.t || a.i - b.i)
    .map((x) => x.card);
}

function soonestActive(block) {
  let min = Infinity;
  block.activeCards.forEach((c) => {
    if (isDate(c.deadline)) min = Math.min(min, c.deadline.getTime());
  });
  return min;
}

// Short display name for a service obligation, used in the auto-advisory
// title ("{Service short name} may apply — …"). Strips the "for Affected …
// Residents" suffix, then applies the ratified-mock casing: "Credit
// Monitoring Services" reads as "Credit monitoring"; anything else is the
// stripped authority in sentence case ("Identity theft prevention services").
function serviceShortName(authority) {
  const stripped = String(authority ?? "").replace(/\s+for\s+Affected\s+.*$/i, "").trim();
  if (!stripped) return "This service obligation";
  if (stripped.toLowerCase() === "credit monitoring services") return "Credit monitoring";
  return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}

// Build the display object for one engine advisory entry. Auto-advisories
// (reason "ssn_unconfirmed") get composed title/body copy; declared
// advisories pass their data-entry title/body through. `kind` drives the
// screen-only "Edit data categories" affordance (auto only) — the memo
// prints title / body / citation for both and never the link.
function advisoryDisplay(a) {
  if (a.reason === "ssn_unconfirmed") {
    return {
      kind: "auto",
      jurisdiction: a.jurisdiction,
      title: `${serviceShortName(a.authority)} may apply — confirm whether Social Security numbers were included`,
      body: `Government IDs are reported among the affected data categories, but Social Security numbers and taxpayer identification numbers are not separately confirmed. If they were included, this obligation is computed under ${a.citation}.`,
      citation: a.citation,
    };
  }
  return {
    kind: "declared",
    jurisdiction: a.jurisdiction,
    title: a.authority,
    body: a.condition,
    citation: a.citation,
  };
}

// ── Contingent-deadline group copy (intake phase 2, 2026-08-15) ───────────
// One string set for both surfaces: the screen renders the label in the
// section-mark idiom with the explainer beneath it; the memo prints the same
// label as a group sub-label with the same explainer under it. Counsel
// register — the group states what the obligations turn on, and claims no
// firm status for the dates below it.
export const CONTINGENT_LABEL = "Contingent Deadlines";
export const CONTINGENT_EXPLAINER =
  "These obligations apply only if the affected-resident count meets the statutory threshold. Because the count for this jurisdiction has not yet been determined, the deadlines below are shown for planning purposes and should be treated as potentially applicable until the count is established.";

// ── Harm-assessment display helpers (harm-gate UI commit, 2026-08-02) ──────
// Shared by the form recap, the results view, and the memo so the three
// surfaces cannot drift. All content is sourced from data.js (`harmGate`,
// `harmNonGateExplainer`) — never hardcoded here beyond the answer labels.

// The three harm-assessment answers, as displayed. `""` is the unset default.
export const HARM_ASSESSMENT_LABELS = {
  "": "Not assessed",
  determined_unlikely: "Determination made and documented",
  harm_likely: "Harm likely, or not determined",
};

// EU/UK risk-level display labels — the same strings the form's RISK_OPTIONS
// rows carry (BreachClock builds its options from this map), shared here so
// the memo's Analysis Inputs "Risk assessment" row can mirror the screen
// recap without importing React code.
export const RISK_LEVEL_LABELS = {
  unlikely: "Unlikely to result in a risk",
  risk: "Likely to result in a risk",
  high: "Likely to result in a high risk",
};

// Natural-language list join ("A", "A and B", "A, B, and C").
const joinNatural = (arr) =>
  arr.length <= 1
    ? arr[0] || ""
    : arr.length === 2
    ? `${arr[0]} and ${arr[1]}`
    : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;

// Selected jurisdictions with any harm-gated obligation — drives the form
// question's conditional rendering, the standards card, and the recap rows.
export function harmGatedJurisdictions(selected = {}) {
  return JURISDICTIONS.filter(
    (j) => selected[j.id] && (j.obligations || []).some((o) => o.harmGate)
  );
}

// Analysis-inputs recap value for the harm assessment. "determined_unlikely"
// names the selected harm-gated jurisdictions whose standards the
// determination was applied under; the other answers are their plain labels.
export function harmAssessmentSummary(harmAssessment, selected = {}) {
  if (harmAssessment === "determined_unlikely") {
    const names = harmGatedJurisdictions(selected).map((j) => j.name);
    return names.length
      ? `${HARM_ASSESSMENT_LABELS.determined_unlikely} (${joinNatural(names)} standards)`
      : HARM_ASSESSMENT_LABELS.determined_unlikely;
  }
  return HARM_ASSESSMENT_LABELS[harmAssessment] ?? HARM_ASSESSMENT_LABELS[""];
}

// The NY/MA still-computing explainer — composed ONCE here for both surfaces
// (dashed advisory card on screen; counsel-note idiom in the memo). Non-null
// only when a harm determination is recorded AND at least one selected
// jurisdiction carries a `harmNonGateExplainer`. Renders once, directly above
// the first such jurisdiction's block. Lead order is the ratified mock's
// (New York before Massachusetts); any future explainer-carrying jurisdiction
// falls back after them.
const NON_GATE_LEAD_ORDER = ["ny", "ma"];
export function harmNonGateDisplay(harmAssessment, selected = {}) {
  if (harmAssessment !== "determined_unlikely") return null;
  const jurs = JURISDICTIONS.filter((j) => selected[j.id] && j.harmNonGateExplainer).sort((a, b) => {
    const ai = NON_GATE_LEAD_ORDER.indexOf(a.id);
    const bi = NON_GATE_LEAD_ORDER.indexOf(b.id);
    return (ai === -1 ? NON_GATE_LEAD_ORDER.length : ai) - (bi === -1 ? NON_GATE_LEAD_ORDER.length : bi);
  });
  if (!jurs.length) return null;
  return {
    jurisdictionIds: jurs.map((j) => j.id),
    lead: `${joinNatural(jurs.map((j) => j.name))} obligations remain computed.`,
    body: jurs.map((j) => j.harmNonGateExplainer).join(" "),
  };
}

// A suppressed entry's harm mechanism, read from the additive
// `suppression_reasons` array — never from the flat fields, and never by
// index: on a double-suppressed row (encryption + harm) the harm entry is not
// first and encryption owns the flat fields (commit-1 shape).
export function harmMechanismOf(s) {
  return (s?.suppression_reasons || []).find((r) => r.type === "harm") || null;
}

// Split a block's note entries ({ jurShort, note }) by placement. "sectoral" is
// also the safe default for any unknown/missing placement — a neutral block-foot
// position that never implies a pre-notification gate.
function splitNotesByPlacement(entries) {
  const caveat = [];
  const sectoral = [];
  const parallel = [];
  for (const entry of entries) {
    const p = entry.note.placement;
    if (p === "caveat") caveat.push(entry);
    else if (p === "parallel") parallel.push(entry);
    else sectoral.push(entry);
  }
  return { caveat, sectoral, parallel };
}

/**
 * Regroup engine output into jurisdiction-first blocks with placed counsel notes.
 *
 * @param {Object}  result
 * @param {Array}   [result.deadlines]     - active deadline cards (engine `deadlines`)
 * @param {Array}   [result.suppressed]    - suppressed / not-required cards
 * @param {Array}   [result.review]        - counsel-review cards
 * @param {Array}   [result.contingent]    - contingent obligations (engine `contingent`)
 * @param {Array}   [result.services]      - computed service obligations (engine `services`)
 * @param {Array}   [result.advisories]    - advisory entries (engine `advisories`; declared + auto)
 * @param {Object}  [result.jurisdictions] - { [id]: boolean } selected-jurisdiction map (facts.jurisdictions),
 *                                           used to attach each selected jurisdiction's counsel notes.
 * @returns {Array<{
 *   jurisdictionId, name, statuteSubtitle,
 *   activeCards, contingentCards, counselReviewCards, suppressedCards,
 *   serviceCards,                                   // engine service entries — render AFTER the deadline cards
 *   advisoryCards,                                  // advisoryDisplay objects — render AFTER the service cards
 *   caveatNotes,                                    // [{ jurShort, note }] — render ABOVE the cards
 *   obligations,                                    // [{ card, role: "active"|"review", parallelNotes: [{ jurShort, note }] }]
 *   sectoralNotes,                                  // [{ jurShort, note }] — render at the FOOT
 *   footParallelNotes,                              // [{ jurShort, note }] — orphaned parallels, render at the FOOT
 * }>}
 *   One entry per jurisdiction that produced any output (an all-suppressed or
 *   notes-only jurisdiction still gets a block), ordered per the knob above.
 */
export function groupResultsByJurisdiction({
  deadlines = [],
  suppressed = [],
  review = [],
  contingent = [],
  services = [],
  advisories = [],
  jurisdictions = {},
} = {}) {
  const blocks = new Map(); // jurisdictionId → block

  const ensureBlock = (short) => {
    const meta = BY_SHORT.get(short);
    if (!meta) return null;
    if (!blocks.has(meta.id)) {
      blocks.set(meta.id, {
        jurisdictionId: meta.id,
        name: meta.name,
        statuteSubtitle: meta.statute,
        activeCards: [],
        contingentCards: [],
        counselReviewCards: [],
        suppressedCards: [],
        serviceCards: [],
        advisoryCards: [],
        _notes: [],
        _index: meta.index,
        _kindByAuthority: meta.kindByAuthority,
      });
    }
    return blocks.get(meta.id);
  };

  deadlines.forEach((d) => {
    const b = ensureBlock(d.jurisdiction);
    if (b) b.activeCards.push(d);
  });
  contingent.forEach((c) => {
    const b = ensureBlock(c.jurisdiction);
    if (b) b.contingentCards.push(c);
  });
  review.forEach((r) => {
    const b = ensureBlock(r.jurisdiction);
    if (b) b.counselReviewCards.push(r);
  });
  suppressed.forEach((s) => {
    const b = ensureBlock(s.jurisdiction);
    if (b) b.suppressedCards.push(s);
  });
  services.forEach((s) => {
    const b = ensureBlock(s.jurisdiction);
    if (b) b.serviceCards.push(s);
  });
  advisories.forEach((a) => {
    const b = ensureBlock(a.jurisdiction);
    if (b) b.advisoryCards.push(advisoryDisplay(a));
  });

  // Counsel notes — sourced from data.js for each SELECTED jurisdiction. A
  // selected jurisdiction with notes but no cards still earns a block.
  JURISDICTIONS.forEach((j) => {
    if (!jurisdictions[j.id]) return;
    if (!j.counselNotes || j.counselNotes.length === 0) return;
    const b = ensureBlock(j.short);
    if (b) j.counselNotes.forEach((note) => b._notes.push({ jurShort: j.short, note }));
  });

  const list = [...blocks.values()];
  list.forEach((b) => {
    b.activeCards = sortActiveCards(b.activeCards);

    const { caveat, sectoral, parallel } = splitNotesByPlacement(b._notes);

    // Obligations = active cards (role "active") then counsel-review cards
    // (role "review"), in their existing order. Parallels attach to the first
    // obligation whose kind matches the note's anchor.
    const obligations = [
      ...b.activeCards.map((card) => ({ card, role: "active", parallelNotes: [] })),
      ...b.counselReviewCards.map((card) => ({ card, role: "review", parallelNotes: [] })),
    ];
    const footParallelNotes = [];
    for (const entry of parallel) {
      const anchor = entry.note.anchor;
      const target =
        anchor != null
          ? obligations.find((o) => b._kindByAuthority.get(o.card.authority) === anchor)
          : null;
      if (target) target.parallelNotes.push(entry);
      else footParallelNotes.push(entry);
    }

    b.caveatNotes = caveat;
    b.obligations = obligations;
    b.sectoralNotes = sectoral;
    b.footParallelNotes = footParallelNotes;
  });

  list.sort((a, b) => {
    if (!CROSS_BLOCK_URGENCY_FIRST) return a._index - b._index;
    const aHas = a.activeCards.length > 0;
    const bHas = b.activeCards.length > 0;
    if (aHas !== bHas) return aHas ? -1 : 1; // active-deadline jurisdictions first
    if (aHas && bHas) {
      const d = soonestActive(a) - soonestActive(b); // soonest deadline first
      if (d !== 0) return d;
    }
    return a._index - b._index; // tie-break: data.js order
  });

  // Strip internal fields before returning.
  return list.map(({ _index, _kindByAuthority, _notes, ...rest }) => rest);
}
