// Pure tests for the results-at-scale presentation helpers in
// results-grouping.js: orderBlocks (the screen's Urgency-default | A–Z
// cross-block sort), buildDeadlineQueue (the deadline-queue rows + counts),
// and the screen-default/memo parity contract — both surfaces consume the
// ONE shared urgency comparator, so their default sequences are identical by
// construction (JDC amendment 2026-08-21). All helpers are deliberately
// time-blind — they read only the deadline timestamps the engine computed
// plus jurisdiction names — so a given computed result always sorts the same
// way; these tests pin that ordering contract.
//
// Blocks are constructed synthetically in the groupResultsByJurisdiction
// output shape (the helpers read nothing beyond the fields set here); the
// parity test runs the real groupResultsByJurisdiction instead.

import { describe, expect, it } from "vitest";
import {
  orderBlocks,
  buildDeadlineQueue,
  groupResultsByJurisdiction,
  QUEUE_MIN_BLOCKS,
} from "./results-grouping.js";

const D = (iso) => new Date(iso);

const block = (name, { active = [], contingent = [], suppressed = 0, review = 0 } = {}) => ({
  jurisdictionId: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  statuteSubtitle: `${name} statute`,
  activeCards: active.map((deadline, i) => ({
    jurisdiction: name,
    authority: `${name} active ${i + 1}`,
    deadline,
  })),
  contingentCards: contingent.map((conditional_deadline, i) => ({
    jurisdiction: name,
    authority: `${name} contingent ${i + 1}`,
    conditional_deadline,
  })),
  counselReviewCards: Array.from({ length: review }, (_, i) => ({
    jurisdiction: name,
    authority: `${name} review ${i + 1}`,
  })),
  suppressedCards: Array.from({ length: suppressed }, (_, i) => ({
    jurisdiction: name,
    authority: `${name} suppressed ${i + 1}`,
  })),
  serviceCards: [],
  advisoryCards: [],
});

const names = (blocks) => blocks.map((b) => b.name);

describe("orderBlocks", () => {
  it("alpha mode sorts by jurisdiction name and does not mutate the input", () => {
    const input = [
      block("Texas", { active: [D("2026-09-01T00:00:00Z")] }),
      block("California", { active: [D("2026-08-01T00:00:00Z")] }),
      block("Colorado", { suppressed: 2 }),
    ];
    const inputOrder = names(input);
    const out = orderBlocks(input, "alpha");
    expect(names(out)).toEqual(["California", "Colorado", "Texas"]);
    expect(names(input)).toEqual(inputOrder); // untouched
  });

  it("urgency mode: firm-deadline blocks by earliest firm date, overdue (earliest) first", () => {
    const out = orderBlocks(
      [
        block("Texas", { active: [D("2026-09-10T00:00:00Z")] }),
        block("California", { active: [D("2026-06-01T00:00:00Z"), D("2026-12-01T00:00:00Z")] }),
        block("Colorado", { active: [D("2026-09-01T00:00:00Z")] }),
      ],
      "urgency"
    );
    // California's EARLIEST date (June, long past) leads even though it also
    // holds a December deadline — an overdue deadline is simply the earliest.
    expect(names(out)).toEqual(["California", "Colorado", "Texas"]);
  });

  it("urgency mode: contingent-only blocks follow firm blocks, by earliest conditional date; blocks with neither come last", () => {
    const out = orderBlocks(
      [
        block("Virginia", { suppressed: 1 }), // neither firm nor contingent
        block("Delaware", { contingent: [D("2026-08-15T00:00:00Z")] }),
        block("Connecticut", { contingent: [D("2026-08-01T00:00:00Z")] }),
        block("Texas", { active: [D("2026-12-01T00:00:00Z")] }),
        block("Massachusetts", { review: 1 }), // neither
      ],
      "urgency"
    );
    expect(names(out)).toEqual(["Texas", "Connecticut", "Delaware", "Massachusetts", "Virginia"]);
  });

  it("urgency mode: a block whose active obligations are all no-fixed-clock sorts after dated firm blocks but before contingent-only blocks", () => {
    const out = orderBlocks(
      [
        block("Delaware", { contingent: [D("2026-08-01T00:00:00Z")] }),
        block("Virginia", { active: [null] }), // firm but undated
        block("Texas", { active: [D("2026-12-01T00:00:00Z")] }),
      ],
      "urgency"
    );
    expect(names(out)).toEqual(["Texas", "Virginia", "Delaware"]);
  });

  it("urgency mode: ties break alphabetically", () => {
    const t = D("2026-09-01T00:00:00Z");
    const out = orderBlocks(
      [
        block("Texas", { active: [t] }),
        block("Colorado", { active: [t] }),
        block("New York", { active: [t] }),
      ],
      "urgency"
    );
    expect(names(out)).toEqual(["Colorado", "New York", "Texas"]);
  });
});

describe("screen-default / memo parity", () => {
  it("the memo path (groupResultsByJurisdiction) and the screen's default urgency sort produce identical block sequences", () => {
    // Mixed fixture over REAL jurisdictions: two firm blocks (Texas earlier
    // than California), one contingent-only block whose conditional date is
    // EARLIER than every firm date (must still follow the firm tier), and two
    // no-output blocks whose alphabetical and data.js orders differ
    // (Connecticut < Massachusetts alphabetically; data.js has MA first) —
    // pinning the alphabetical-ties resolution on the memo path too.
    const result = {
      deadlines: [
        { jurisdiction: "California", authority: "Affected California Residents", deadline: D("2026-10-05T12:00:00Z") },
        { jurisdiction: "Texas", authority: "Texas Attorney General", deadline: D("2026-09-20T12:00:00Z") },
      ],
      contingent: [
        { jurisdiction: "Colorado", authority: "Colorado Attorney General", conditional_deadline: D("2026-09-01T12:00:00Z") },
      ],
      suppressed: [
        { jurisdiction: "Massachusetts", authority: "Affected Massachusetts Residents" },
        { jurisdiction: "Connecticut", authority: "Affected Connecticut Residents" },
      ],
      review: [],
      services: [],
      advisories: [],
      jurisdictions: {},
    };
    const memoOrder = names(groupResultsByJurisdiction(result));
    expect(memoOrder).toEqual(["Texas", "California", "Colorado", "Connecticut", "Massachusetts"]);
    const screenDefault = names(orderBlocks(groupResultsByJurisdiction(result), "urgency"));
    expect(screenDefault).toEqual(memoOrder);
  });
});

describe("buildDeadlineQueue", () => {
  it("orders rows: dated firm ascending, then dated contingent ascending, then no-fixed-clock (firm before contingent)", () => {
    const { rows } = buildDeadlineQueue([
      block("Colorado", {
        active: [D("2026-09-01T00:00:00Z"), null],
        contingent: [D("2026-08-20T00:00:00Z")],
      }),
      block("Texas", { active: [D("2026-08-25T00:00:00Z")] }),
      block("Virginia", { contingent: [null] }),
    ]);
    expect(rows.map((r) => [r.kind, r.authority, r.date ? r.date.toISOString() : null])).toEqual([
      // dated firm, ascending — the Aug 20 CONTINGENT date does NOT interleave
      ["firm", "Texas active 1", "2026-08-25T00:00:00.000Z"],
      ["firm", "Colorado active 1", "2026-09-01T00:00:00.000Z"],
      // dated contingent
      ["contingent", "Colorado contingent 1", "2026-08-20T00:00:00.000Z"],
      // no fixed clock: firm first, then contingent
      ["firm", "Colorado active 2", null],
      ["contingent", "Virginia contingent 1", null],
    ]);
  });

  it("an overdue firm date is simply the earliest and leads the queue", () => {
    const { rows } = buildDeadlineQueue([
      block("Texas", { active: [D("2026-12-01T00:00:00Z")] }),
      block("Colorado", { active: [D("2026-01-05T00:00:00Z")] }), // long past
    ]);
    expect(rows[0].authority).toBe("Colorado active 1");
  });

  it("counts suppressed and counsel-review obligations instead of emitting rows, and counts eligible blocks", () => {
    const q = buildDeadlineQueue([
      block("California", { active: [D("2026-09-01T00:00:00Z")], suppressed: 2 }),
      block("Massachusetts", { review: 1 }),
      block("Virginia", { suppressed: 3 }),
      block("Delaware", { contingent: [D("2026-10-01T00:00:00Z")] }),
    ]);
    expect(q.suppressedCount).toBe(5);
    expect(q.reviewCount).toBe(1);
    // Only California (active) and Delaware (contingent) are queue-eligible.
    expect(q.eligibleBlockCount).toBe(2);
    expect(q.rows.map((r) => r.authority)).toEqual(["California active 1", "Delaware contingent 1"]);
  });

  it("dated ties break by jurisdiction name, then authority", () => {
    const t = D("2026-09-01T00:00:00Z");
    const { rows } = buildDeadlineQueue([
      block("Texas", { active: [t] }),
      block("Colorado", { active: [t, t] }),
    ]);
    expect(rows.map((r) => r.authority)).toEqual([
      "Colorado active 1",
      "Colorado active 2",
      "Texas active 1",
    ]);
  });

  it("exports the 3-block visibility floor the screen gates on", () => {
    expect(QUEUE_MIN_BLOCKS).toBe(3);
  });
});
