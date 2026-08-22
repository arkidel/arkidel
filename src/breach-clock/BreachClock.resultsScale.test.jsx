// @vitest-environment jsdom
//
// Results at scale — the deadline queue, collapsing jurisdiction blocks, and
// the A–Z | Urgency block-order toggle. Contracts under test:
//
//   1. Queue visibility: renders only when 3+ jurisdiction blocks have a
//      queue-eligible row; hidden below that.
//   2. Queue rows: dated firm rows precede dated contingent rows regardless
//      of date; contingent rows carry the "If required, due …" qualifier;
//      suppressed obligations are a summary line, never rows.
//   3. Collapse: at ≤3 selected jurisdictions blocks render expanded exactly
//      as before; at >3 they default collapsed — EXCEPT a block holding a
//      firm-overdue obligation, which defaults expanded. Expand all /
//      Collapse all override either way; a queue-row click expands its block.
//   4. Order toggle: Urgency is the DEFAULT (both surfaces lead with the
//      shared urgency comparator — parity is pinned in
//      results-grouping.test.js); firm blocks by earliest firm date with
//      ties alphabetical; A–Z is the screen's secondary view. The choice is
//      view state, persisted PER INCIDENT in incidents.view_state
//      ({ blockOrder: "az" | "urgency" }; migration 20260822120000) — beside
//      the facts payload, never in it: the payload is byte-identical whether
//      or not the toggle was ever touched while view_state changes. Toggle
//      → one view_state write (on change only, never on load); load applies
//      a present view_state.blockOrder and falls to Urgency on an empty one;
//      incidents are isolated from one another.
//
// Fixtures use saved ACTIVE incidents whose answers pass the completeness
// gate, so the editor auto-computes to results on rehydrate. Awareness is
// generated relative to the real clock (the engine's deadlines are date
// arithmetic over it), so assertions never rot as wall-clock time passes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { incidents, org } = vi.hoisted(() => ({
  incidents: { getIncident: null, updateIncident: null, createIncident: null, updateIncidentViewState: null },
  org: { activeOrg: { id: "org-1", name: "Arkidel, LLC" } },
}));

vi.mock("../data/incidents.js", () => ({
  getIncident: (...args) => incidents.getIncident(...args),
  updateIncident: (...args) => incidents.updateIncident(...args),
  createIncident: (...args) => incidents.createIncident(...args),
  updateIncidentStatus: vi.fn().mockResolvedValue(undefined),
  updateIncidentNotifications: vi.fn().mockResolvedValue(undefined),
  updateIncidentLog: vi.fn().mockResolvedValue(undefined),
  updateIncidentViewState: (...args) => incidents.updateIncidentViewState(...args),
}));
vi.mock("../org/OrgProvider.jsx", () => ({ useOrg: () => org }));
vi.mock("../components/TopBarContext.jsx", () => ({ useTopBarHeader: () => {} }));
vi.mock("./memo-pdf.js", () => ({ generateMemoPdf: vi.fn() }));

import BreachClock from "./BreachClock.jsx";

// datetime-local string for "now + offsetMs" in LOCAL time (what the
// awareness input stores).
const awarenessAt = (offsetMs) => {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const payloadFor = ({ jurs, awareness, counts, unknown = {}, harmAssessment = "" }) => ({
  quickMode: true,
  awareness,
  jurisdictions: Object.fromEntries(jurs.map((j) => [j, true])),
  residentCounts: counts ?? Object.fromEntries(jurs.map((j) => [j, "100000"])),
  residentCountUnknown: unknown,
  sensitivity: ["identifiers"],
  harmAssessment,
  record: { incidentTitle: "Results-scale fixture" },
});

const renderEditor = (id = "inc-1") =>
  render(
    <MemoryRouter initialEntries={[`/breach-clock/${id}`]}>
      <Routes>
        <Route path="/breach-clock/:id" element={<BreachClock />} />
      </Routes>
    </MemoryRouter>
  );

const loadIncident = (payload, status = "active", viewState = {}) => {
  incidents.getIncident = vi.fn().mockResolvedValue({
    id: "inc-1",
    status,
    payload,
    notifications: {},
    incident_log: [],
    view_state: viewState,
  });
};

// The jurisdiction blocks' disclosure headers (collapsible mode) in DOM
// order, by name. They are tagged data-block-header — aria-expanded alone
// would also match the caveat-note disclosure buttons.
const blockHeaderNames = () =>
  [...document.querySelectorAll("button[data-block-header]")].map((b) => b.getAttribute("data-block-header"));

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  incidents.updateIncident = vi.fn().mockResolvedValue({ id: "inc-1" });
  incidents.createIncident = vi.fn().mockResolvedValue({ id: "inc-1" });
  incidents.updateIncidentViewState = vi.fn().mockResolvedValue({ id: "inc-1" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("deadline queue", () => {
  it("renders at 3+ eligible blocks: dated firm rows first, then contingent rows with the 'If required, due' qualifier, no-clock rows last", async () => {
    // Colorado's count is not yet known → its AG and CRA obligations are
    // contingent (AG dated at 30d, CRA no fixed clock) while its resident
    // obligation stays firm. California and Texas fire on known counts.
    loadIncident(
      payloadFor({
        jurs: ["ca", "tx", "co"],
        awareness: awarenessAt(-HOUR),
        counts: { ca: "100000", tx: "100000", co: "" },
        unknown: { co: true },
      })
    );
    renderEditor();
    await waitFor(() => expect(screen.getByText("Deadline queue")).toBeTruthy());

    const table = screen.getByRole("table");
    const rowTexts = within(table)
      .getAllByRole("row")
      .slice(1) // header row
      .map((r) => r.textContent);

    const firstContingent = rowTexts.findIndex((t) => t.includes("If required, due"));
    expect(firstContingent).toBeGreaterThan(0);
    // Texas residents (60d) is the LATEST dated firm row; the Colorado AG
    // contingent date (30d) is earlier, yet must not interleave — every firm
    // dated row precedes every contingent row.
    const lastDatedFirm = rowTexts.findLastIndex(
      (t) => !t.includes("If required") && !t.includes("No fixed notification deadline")
    );
    expect(lastDatedFirm).toBeLessThan(firstContingent);
    // No-fixed-clock rows sit at the bottom with their existing label.
    const noClock = rowTexts.findIndex((t) => t.includes("No fixed notification deadline"));
    expect(noClock).toBeGreaterThan(firstContingent);
  });

  it("does not render below 3 eligible blocks", async () => {
    loadIncident(payloadFor({ jurs: ["ca", "tx"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(screen.getByText(/Notify Affected California Residents/)).toBeTruthy());
    expect(screen.queryByText("Deadline queue")).toBeNull();
  });

  it("summarizes suppressed obligations under the table instead of listing them as rows", async () => {
    // Colorado harm-suppressed (documented determination) while California,
    // Texas, and New York still compute → 3 eligible blocks + a suppressed
    // group that must NOT appear in the table.
    loadIncident(
      payloadFor({
        jurs: ["ca", "tx", "ny", "co"],
        awareness: awarenessAt(-HOUR),
        harmAssessment: "determined_unlikely",
      })
    );
    renderEditor();
    await waitFor(() => expect(screen.getByText("Deadline queue")).toBeTruthy());

    const table = screen.getByRole("table");
    expect(within(table).queryByText(/Colorado/)).toBeNull();
    // Colorado's three obligations (residents, AG, CRA) are the suppressed set.
    expect(screen.getByRole("button", { name: "3 suppressed" })).toBeTruthy();
    expect(screen.queryByText(/for counsel review/)).toBeNull();
  });
});

describe("collapsing jurisdiction blocks", () => {
  it("renders blocks expanded (no disclosure headers) at 3 selected jurisdictions", async () => {
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(screen.getByText(/Notify Colorado Attorney General/)).toBeTruthy());
    expect(screen.getByText(/Notify Affected Connecticut Residents/)).toBeTruthy();
    expect(blockHeaderNames().length).toBe(0);
  });

  it("defaults blocks collapsed at 4 selected jurisdictions", async () => {
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    expect(screen.queryByText(/Notify Affected Colorado Residents/)).toBeNull();
    // Collapsed summary rows carry count chips.
    expect(screen.getAllByText(/^\d+ due$/).length).toBeGreaterThan(0);
  });

  it("defaults a block EXPANDED when it holds a firm-overdue obligation", async () => {
    // 45 days after awareness: Colorado's 30-day clocks are overdue;
    // Connecticut's 60-day clocks are not.
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-45 * DAY) }));
    renderEditor();
    await waitFor(() => expect(screen.getByText(/Notify Affected Colorado Residents/)).toBeTruthy());
    expect(screen.queryByText(/Notify Affected Connecticut Residents/)).toBeNull();
  });

  it("Expand all / Collapse all override the defaults", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText(/Notify Affected Colorado Residents/)).toBeTruthy();
    expect(screen.getByText(/Notify Affected Connecticut Residents/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText(/Notify Affected Colorado Residents/)).toBeNull();
  });

  it("a queue-row click expands the row's block", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(screen.getByText("Deadline queue")).toBeTruthy());
    expect(screen.queryByText(/Notify Affected Connecticut Residents/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Go to Connecticut — Affected Connecticut Residents" }));
    expect(screen.getByText(/Notify Affected Connecticut Residents/)).toBeTruthy();
  });
});

describe("block-order toggle", () => {
  it("defaults to Urgency (earliest firm date first, ties alphabetical) and reorders on A–Z", async () => {
    const user = userEvent.setup();
    // Earliest firm clocks: CO 30d, NY 30d, TX 30d (AG), CT 60d — a three-way
    // 30-day tie that must break alphabetically, with Connecticut last.
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    expect(blockHeaderNames()).toEqual(["Colorado", "New York", "Texas", "Connecticut"]);

    await user.click(screen.getByRole("radio", { name: "A–Z" }));
    expect(blockHeaderNames()).toEqual(["Colorado", "Connecticut", "New York", "Texas"]);

    await user.click(screen.getByRole("radio", { name: "Urgency" }));
    expect(blockHeaderNames()).toEqual(["Colorado", "New York", "Texas", "Connecticut"]);
  });

  it("writes { blockOrder } to view_state on toggle — on change only, never on load", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    // Load applied the default without a write.
    expect(incidents.updateIncidentViewState).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "A–Z" }));
    await waitFor(() => expect(incidents.updateIncidentViewState).toHaveBeenCalledTimes(1));
    expect(incidents.updateIncidentViewState).toHaveBeenLastCalledWith("inc-1", { blockOrder: "az" });

    // Re-selecting the already-selected value is not a change: no write.
    await user.click(screen.getByRole("radio", { name: "A–Z" }));
    expect(incidents.updateIncidentViewState).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("radio", { name: "Urgency" }));
    await waitFor(() => expect(incidents.updateIncidentViewState).toHaveBeenCalledTimes(2));
    expect(incidents.updateIncidentViewState).toHaveBeenLastCalledWith("inc-1", { blockOrder: "urgency" });

    // view_state is written alone — the facts payload path never ran.
    expect(incidents.updateIncident).not.toHaveBeenCalled();
  });

  it("rolls the toggle back and surfaces the save error when the view_state write fails", async () => {
    const user = userEvent.setup();
    incidents.updateIncidentViewState = vi.fn().mockRejectedValue(new Error("network down"));
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));

    await user.click(screen.getByRole("radio", { name: "A–Z" }));
    await waitFor(() => expect(screen.getByText(/Jurisdiction order failed to save: network down/)).toBeTruthy());
    expect(screen.getByRole("radio", { name: "Urgency" }).getAttribute("aria-checked")).toBe("true");
    expect(blockHeaderNames()).toEqual(["Colorado", "New York", "Texas", "Connecticut"]);
  });

  it("applies a present view_state.blockOrder on load", async () => {
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }), "active", { blockOrder: "az" });
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    expect(blockHeaderNames()).toEqual(["Colorado", "Connecticut", "New York", "Texas"]);
    expect(screen.getByRole("radio", { name: "A–Z" }).getAttribute("aria-checked")).toBe("true");
    expect(incidents.updateIncidentViewState).not.toHaveBeenCalled();
  });

  it("falls to the Urgency default on an empty view_state (the column default)", async () => {
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }), "active", {});
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    expect(blockHeaderNames()).toEqual(["Colorado", "New York", "Texas", "Connecticut"]);
    expect(screen.getByRole("radio", { name: "Urgency" }).getAttribute("aria-checked")).toBe("true");
    expect(incidents.updateIncidentViewState).not.toHaveBeenCalled();
  });

  it("isolates view state per incident: toggling one leaves the other on its own saved order", async () => {
    const user = userEvent.setup();
    const payload = payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) });
    const rows = {
      "inc-1": { id: "inc-1", status: "active", payload, notifications: {}, incident_log: [], view_state: {} },
      "inc-2": { id: "inc-2", status: "active", payload, notifications: {}, incident_log: [], view_state: {} },
    };
    incidents.getIncident = vi.fn(async (id) => rows[id]);
    // The mock persists like the real column would: view_state alone, by id.
    incidents.updateIncidentViewState = vi.fn(async (id, viewState) => {
      rows[id] = { ...rows[id], view_state: viewState };
      return rows[id];
    });

    // Toggle inc-1 to A–Z.
    const first = renderEditor("inc-1");
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    await user.click(screen.getByRole("radio", { name: "A–Z" }));
    await waitFor(() => expect(incidents.updateIncidentViewState).toHaveBeenCalledTimes(1));
    expect(incidents.updateIncidentViewState).toHaveBeenLastCalledWith("inc-1", { blockOrder: "az" });
    expect(rows["inc-2"].view_state).toEqual({});
    first.unmount();

    // inc-2 opens on the Urgency default, untouched.
    const second = renderEditor("inc-2");
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    expect(blockHeaderNames()).toEqual(["Colorado", "New York", "Texas", "Connecticut"]);
    expect(screen.getByRole("radio", { name: "Urgency" }).getAttribute("aria-checked")).toBe("true");
    second.unmount();

    // inc-1 reopens on its persisted A–Z.
    renderEditor("inc-1");
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));
    expect(blockHeaderNames()).toEqual(["Colorado", "Connecticut", "New York", "Texas"]);
    expect(incidents.updateIncidentViewState).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved facts payload byte-identical across a toggle round-trip while view_state changes", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor({ jurs: ["co", "tx", "ct", "ny"], awareness: awarenessAt(-HOUR) }));
    renderEditor();
    await waitFor(() => expect(blockHeaderNames().length).toBe(4));

    // Save once without ever touching the toggle.
    await user.click(screen.getByRole("button", { name: /edit answers/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const untouched = incidents.updateIncident.mock.calls[0][1].payload;

    // Back to results, flip the toggle (to A–Z, off the Urgency default),
    // save again.
    await user.click(screen.getByRole("button", { name: /back to results/i }));
    await user.click(screen.getByRole("radio", { name: "A–Z" }));
    await user.click(screen.getByRole("button", { name: /edit answers/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(2));
    const touched = incidents.updateIncident.mock.calls[1][1].payload;

    // Data-subject blocks get FRESH local ids on every hydrate (a deliberate,
    // pre-existing applyPayload behavior unrelated to the toggle), so the id
    // is normalized out; everything else must be byte-identical.
    const normalize = (p) =>
      JSON.stringify({
        ...p,
        record: {
          ...p.record,
          dataSubjectBlocks: p.record.dataSubjectBlocks.map(({ id, ...rest }) => rest),
        },
      });
    expect(normalize(touched)).toBe(normalize(untouched));
    expect("blockOrder" in touched).toBe(false);
    expect("view_state" in touched).toBe(false);
    // …while the view state DID persist — in its own column, not the payload.
    expect(incidents.updateIncidentViewState).toHaveBeenCalledTimes(1);
    expect(incidents.updateIncidentViewState).toHaveBeenCalledWith("inc-1", { blockOrder: "az" });
    for (const call of incidents.updateIncident.mock.calls) {
      expect("view_state" in call[1]).toBe(false);
    }
  });
});
