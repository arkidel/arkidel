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
 * @param {Object}  [result.jurisdictions] - { [id]: boolean } selected-jurisdiction map (facts.jurisdictions),
 *                                           used to attach each selected jurisdiction's counsel notes.
 * @returns {Array<{
 *   jurisdictionId, name, statuteSubtitle,
 *   activeCards, counselReviewCards, suppressedCards,
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
        counselReviewCards: [],
        suppressedCards: [],
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
  review.forEach((r) => {
    const b = ensureBlock(r.jurisdiction);
    if (b) b.counselReviewCards.push(r);
  });
  suppressed.forEach((s) => {
    const b = ensureBlock(s.jurisdiction);
    if (b) b.suppressedCards.push(s);
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
