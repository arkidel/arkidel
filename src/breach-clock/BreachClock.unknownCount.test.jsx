// @vitest-environment jsdom
//
// "Count not yet known" (intake phase 2) — the form half of the contingent-
// deadlines feature. Two contracts under test:
//
//   1. Mutual exclusion, BOTH directions. Checking the toggle clears and
//      disables the jurisdiction's resident-count input; typing a count
//      unchecks the toggle. The engine defends against the combination
//      anyway (a numeric count always beats the flag), but the form must
//      never produce it.
//   2. Round-trip persistence of `residentCountUnknown`. What the toggle
//      writes lands in the saved payload as a sparse { [jurId]: true } map,
//      and a payload carrying that map rehydrates the toggle — with the
//      count input disabled — on load.
//
// The editor is exercised in quick mode (the operative fields render flat, no
// collapsible sections) through a saved incident whose answers deliberately
// fail the completeness gate, so it opens at the form rather than
// auto-computing to results.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { incidents, org } = vi.hoisted(() => ({
  incidents: { getIncident: null, updateIncident: null, createIncident: null },
  org: { activeOrg: { id: "org-1", name: "Arkidel, LLC" } },
}));

vi.mock("../data/incidents.js", () => ({
  getIncident: (...args) => incidents.getIncident(...args),
  updateIncident: (...args) => incidents.updateIncident(...args),
  createIncident: (...args) => incidents.createIncident(...args),
  updateIncidentStatus: vi.fn().mockResolvedValue(undefined),
  updateIncidentNotifications: vi.fn().mockResolvedValue(undefined),
  updateIncidentLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../org/OrgProvider.jsx", () => ({ useOrg: () => org }));
vi.mock("../components/TopBarContext.jsx", () => ({ useTopBarHeader: () => {} }));
// The memo path pulls font/logo bytes through Vite `?url` imports; nothing
// here downloads a memo.
vi.mock("./memo-pdf.js", () => ({ generateMemoPdf: vi.fn() }));

import BreachClock from "./BreachClock.jsx";

// A saved quick-mode incident with Colorado selected. No awareness and no Q1
// category, so the completeness gate fails and the editor opens at the form.
const savedPayload = (overrides = {}) => ({
  quickMode: true,
  awareness: "",
  jurisdictions: { co: true },
  residentCounts: { co: "" },
  sensitivity: [],
  record: { incidentTitle: "Unknown-count fixture" },
  ...overrides,
});

const renderEditor = () =>
  render(
    <MemoryRouter initialEntries={["/breach-clock/inc-1"]}>
      <Routes>
        <Route path="/breach-clock/:id" element={<BreachClock />} />
      </Routes>
    </MemoryRouter>
  );

const unknownToggle = () => screen.getByLabelText("Count not yet known — Colorado");
const countInput = () => screen.getByLabelText("Colorado residents affected");

beforeEach(() => {
  // jsdom ships no matchMedia; the editor uses it for its two layout queries
  // (narrow / wide). Both report false here — the desktop two-column layout,
  // minus the wide-gutter section index.
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  incidents.updateIncident = vi.fn().mockResolvedValue({ id: "inc-1" });
  incidents.createIncident = vi.fn().mockResolvedValue({ id: "inc-1" });
  incidents.getIncident = vi.fn().mockResolvedValue({
    id: "inc-1",
    status: "draft",
    payload: savedPayload(),
    notifications: {},
    incident_log: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("'Count not yet known' toggle", () => {
  it("clears and disables the resident count when checked", async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(unknownToggle()).toBeTruthy());

    await user.type(countInput(), "1200");
    expect(countInput().value).toBe("1200");
    expect(unknownToggle().checked).toBe(false);

    await user.click(unknownToggle());
    expect(unknownToggle().checked).toBe(true);
    expect(countInput().value).toBe("");
    expect(countInput().disabled).toBe(true);
  });

  it("unchecks when a count is typed (the other direction)", async () => {
    const user = userEvent.setup();
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "draft",
      payload: savedPayload({ residentCountUnknown: { co: true } }),
      notifications: {},
      incident_log: [],
    });
    renderEditor();
    await waitFor(() => expect(unknownToggle().checked).toBe(true));
    expect(countInput().disabled).toBe(true);

    // Unchecking re-enables the input; entering a count leaves the toggle off.
    await user.click(unknownToggle());
    expect(countInput().disabled).toBe(false);
    await user.type(countInput(), "750");
    expect(countInput().value).toBe("750");
    expect(unknownToggle().checked).toBe(false);
  });
});

describe("Contingent Deadlines group (results view)", () => {
  // A COMPLETE saved incident auto-computes to results on rehydrate, so the
  // group is reachable without a submit (which would require persistence).
  const completePayload = () => ({
    quickMode: true,
    awareness: "2026-08-10T15:00",
    jurisdictions: { co: true },
    residentCounts: { co: "" },
    residentCountUnknown: { co: true },
    sensitivity: ["identifiers"],
    record: { incidentTitle: "Unknown-count fixture" },
  });

  it("renders the heading, the verbatim explainer, and one card per contingent obligation", async () => {
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "active",
      payload: completePayload(),
      notifications: {},
      incident_log: [],
    });
    renderEditor();

    await waitFor(() => expect(screen.getByText("Contingent Deadlines")).toBeTruthy());
    expect(
      screen.getByText(
        "These obligations apply only if the affected-resident count meets the statutory threshold. Because the count for this jurisdiction has not yet been determined, the deadlines below are shown for planning purposes and should be treated as potentially applicable until the count is established."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("Notice is required if 500 or more Colorado residents are affected.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Notice is required if more than 1,000 Colorado residents are affected."
      )
    ).toBeTruthy();
    // The firm resident obligation is unaffected and still leads the block.
    expect(screen.getByText(/Notify Affected Colorado Residents/)).toBeTruthy();
    // The recap states the unestablished count rather than leaving it blank.
    expect(screen.getByText(/Colorado \(count not established\)/)).toBeTruthy();
  });

  it("renders no group when the count is established", async () => {
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "active",
      payload: { ...completePayload(), residentCounts: { co: "5000" }, residentCountUnknown: {} },
      notifications: {},
      incident_log: [],
    });
    renderEditor();

    await waitFor(() => expect(screen.getByText(/Notify Colorado Attorney General/)).toBeTruthy());
    expect(screen.queryByText("Contingent Deadlines")).toBeNull();
  });
});

describe("residentCountUnknown round trip", () => {
  it("saves the toggle into the payload as a sparse map", async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(unknownToggle()).toBeTruthy());

    await user.click(unknownToggle());
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const [id, { payload }] = incidents.updateIncident.mock.calls[0];
    expect(id).toBe("inc-1");
    expect(payload.residentCountUnknown).toEqual({ co: true });
    expect(payload.residentCounts.co).toBe("");
  });

  it("drops the flag from the payload when the toggle is turned back off", async () => {
    const user = userEvent.setup();
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "draft",
      payload: savedPayload({ residentCountUnknown: { co: true } }),
      notifications: {},
      incident_log: [],
    });
    renderEditor();
    await waitFor(() => expect(unknownToggle().checked).toBe(true));

    await user.click(unknownToggle());
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const [, { payload }] = incidents.updateIncident.mock.calls[0];
    expect(payload.residentCountUnknown).toEqual({});
  });

  it("rehydrates a saved flag, and ignores a falsy one", async () => {
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "draft",
      payload: savedPayload({ residentCountUnknown: { co: false } }),
      notifications: {},
      incident_log: [],
    });
    renderEditor();
    await waitFor(() => expect(unknownToggle()).toBeTruthy());
    // A serialized `false` is not a claim that the count is unknown.
    expect(unknownToggle().checked).toBe(false);
    expect(countInput().disabled).toBe(false);
  });

  it("clears the flag when the jurisdiction is removed", async () => {
    const user = userEvent.setup();
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "draft",
      payload: savedPayload({ residentCountUnknown: { co: true } }),
      notifications: {},
      incident_log: [],
    });
    renderEditor();
    await waitFor(() => expect(unknownToggle().checked).toBe(true));

    await user.click(screen.getByRole("button", { name: /remove colorado/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const [, { payload }] = incidents.updateIncident.mock.calls[0];
    expect(payload.residentCountUnknown).toEqual({});
    expect(payload.jurisdictions.co).toBe(false);
  });
});
