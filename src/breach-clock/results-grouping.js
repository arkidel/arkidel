// =============================================================================
// results-grouping.js — PRESENTATION logic (NOT engine logic).
//
// Pure, shared regrouping of the engine's flat result buckets (deadlines,
// suppressed, review) plus each selected jurisdiction's counsel notes into
// jurisdiction-first blocks — one block per jurisdiction holding all of that
// jurisdiction's cards and notes. Consumed by BOTH the on-screen results page
// (BreachClock.jsx) and the PDF memo (memo-pdf-core.js) so the two surfaces
// cannot drift in how output is grouped or ordered.
//
// This file performs NO legal computation. It only regroups and reorders
// objects the engine already produced; engine.js / data.js are untouched. The
// card objects it receives are passed through by reference, not rebuilt — card
// content, copy, and ordering-within-a-card are exactly as the engine emitted.
//
// The `pending` bucket is intentionally NOT grouped here. It renders as a single
// consolidated "Risk assessment required" banner above the blocks, so a
// pending-only jurisdiction (EU/UK awaiting a risk assessment) produces no
// block — its state is spoken by that banner.
// =============================================================================

import { JURISDICTIONS } from "./data.js";

// ── Ordering knobs — the two ordering choices, isolated so the gate review can
//    flip either independently without touching the grouping logic. ──
//
// (A) WITHIN_BLOCK_SEQUENCE — the order of card-type groups INSIDE one
//     jurisdiction block: (1) active deadline cards, (2) counsel-review cards,
//     (3) suppressed / not-required cards, (4) counsel notes. Reorder these four
//     keys to change within-block order on BOTH surfaces at once.
export const WITHIN_BLOCK_SEQUENCE = ["active", "review", "suppressed", "notes"];
//
// (B) CROSS_BLOCK_URGENCY_FIRST — block order ACROSS jurisdictions.
//       true  → jurisdictions with at least one active deadline first, ordered
//               by soonest deadline; then jurisdictions with no active deadline;
//               canonical data.js order as the tie-break.
//       false → fixed canonical data.js order, ignoring urgency.
export const CROSS_BLOCK_URGENCY_FIRST = true;

// Canonical short-name → metadata lookup over the data.js jurisdiction list.
const BY_SHORT = new Map(
  JURISDICTIONS.map((j, index) => [
    j.short,
    { id: j.id, name: j.name, statute: j.statute, index },
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

/**
 * Regroup engine output into jurisdiction-first blocks.
 *
 * @param {Object}  result
 * @param {Array}   [result.deadlines]     - active deadline cards (engine `deadlines`)
 * @param {Array}   [result.suppressed]    - suppressed / not-required cards
 * @param {Array}   [result.review]        - counsel-review cards
 * @param {Object}  [result.jurisdictions] - { [id]: boolean } selected-jurisdiction map (facts.jurisdictions),
 *                                           used to attach each selected jurisdiction's counsel notes.
 * @returns {Array<{ jurisdictionId, name, statuteSubtitle,
 *                   activeCards, counselReviewCards, suppressedCards, counselNotes }>}
 *   One entry per jurisdiction that produced any output (an all-suppressed or
 *   notes-only jurisdiction still gets a block), ordered per the knobs above.
 *   Each counselNotes entry is { jurShort, note } (mirrors the PDF note shape).
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
        counselNotes: [],
        _index: meta.index,
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
    if (b) j.counselNotes.forEach((note) => b.counselNotes.push({ jurShort: j.short, note }));
  });

  const list = [...blocks.values()];
  list.forEach((b) => {
    b.activeCards = sortActiveCards(b.activeCards);
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

  return list.map(({ _index, ...rest }) => rest);
}

/**
 * The block's non-empty card-type groups, in WITHIN_BLOCK_SEQUENCE order, for
 * renderers that iterate generically. Each entry: { kind, cards }.
 * Both surfaces call this so within-block order is defined in exactly one place.
 */
export function blockSections(block) {
  const byKind = {
    active: block.activeCards,
    review: block.counselReviewCards,
    suppressed: block.suppressedCards,
    notes: block.counselNotes,
  };
  return WITHIN_BLOCK_SEQUENCE.map((kind) => ({ kind, cards: byKind[kind] || [] })).filter(
    (s) => s.cards.length > 0
  );
}
