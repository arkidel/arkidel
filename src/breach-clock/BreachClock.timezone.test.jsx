// @vitest-environment jsdom
// Timezone-explicit awareness on the editor surface (serverless bundle, JDC
// 2026-08-22): the zone selector, declared-zone display of every deadline
// time, the legacy caveat (ruling C) on screen and in the memo facts, and
// the refusal never reaching a rendered "no obligations" state.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const org = { activeOrg: { id: "org-1", name: "Test Org" } };
const incidents = vi.hoisted(() => ({
  getIncident: vi.fn(),
  updateIncident: vi.fn(),
  createIncident: vi.fn(),
  updateIncidentViewState: vi.fn(),
}));
const memo = vi.hoisted(() => ({ generateMemoPdf: vi.fn() }));

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
vi.mock("./memo-pdf.js", () => ({ generateMemoPdf: (...args) => memo.generateMemoPdf(...args) }));

import BreachClock from "./BreachClock.jsx";
import { AWARENESS_TZ_CAVEAT, deviceTimeZone } from "./timezone.js";

const CAVEAT = AWARENESS_TZ_CAVEAT;

// Colorado with a known below-AG-threshold count: the resident obligation
// (30 days) is the one dated card. Awareness 2026-01-15 10:00 in Chicago =
// 16:00Z; +30d = 2026-02-14 16:00Z = 10:00 AM CST.
const payloadFor = (overrides = {}) => ({
  quickMode: true,
  awareness: "2026-01-15T10:00",
  jurisdictions: { co: true },
  residentCounts: { co: "100" },
  sensitivity: ["identifiers"],
  record: { incidentTitle: "Timezone fixture" },
  ...overrides,
});

const loadIncident = (payload, status = "active") => {
  incidents.getIncident = vi.fn().mockResolvedValue({
    id: "inc-1",
    status,
    payload,
    notifications: {},
    incident_log: [],
    view_state: {},
  });
};

const renderEditor = (path = "/breach-clock/inc-1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/breach-clock/new" element={<BreachClock />} />
        <Route path="/breach-clock/:id" element={<BreachClock />} />
      </Routes>
    </MemoryRouter>
  );

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
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  incidents.updateIncident = vi.fn().mockResolvedValue({ id: "inc-1" });
  incidents.createIncident = vi.fn().mockResolvedValue({ id: "inc-1" });
  incidents.updateIncidentViewState = vi.fn().mockResolvedValue({ id: "inc-1" });
  memo.generateMemoPdf = vi.fn().mockResolvedValue(new Uint8Array([1]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("declared-zone display", () => {
  it("renders every deadline time and the awareness recap in the incident's zone with a label, not the viewer's", async () => {
    loadIncident(payloadFor({ awarenessTz: "America/Chicago" }));
    renderEditor();
    await waitFor(() => expect(screen.getAllByText(/Notify Affected Colorado Residents/).length).toBeGreaterThan(0));
    // Awareness recap: 1/15/2026, 10:00 AM CT — regardless of the host zone.
    expect(screen.getByText("1/15/2026, 10:00 AM CT")).toBeTruthy();
    // The dated card's due line: awareness + 30 days, in Central time.
    expect(screen.getAllByText(/Due 2\/14\/2026, 10:00 AM CT/).length).toBeGreaterThan(0);
    // No legacy caveat on a zone-explicit record.
    expect(screen.queryByText(CAVEAT)).toBeNull();
  });

  it("the same wall time in a different declared zone moves the deadline — the zone is operative", async () => {
    loadIncident(payloadFor({ awarenessTz: "America/Los_Angeles" }));
    renderEditor();
    await waitFor(() => expect(screen.getAllByText(/Notify Affected Colorado Residents/).length).toBeGreaterThan(0));
    expect(screen.getByText("1/15/2026, 10:00 AM PT")).toBeTruthy();
    expect(screen.getAllByText(/Due 2\/14\/2026, 10:00 AM PT/).length).toBeGreaterThan(0);
  });

  it("the zone selector shows the saved zone and writes a change back into the payload on save", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor({ awarenessTz: "America/Chicago" }));
    renderEditor();
    await waitFor(() => expect(screen.getAllByText(/Notify Affected Colorado Residents/).length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /edit answers/i }));
    const select = screen.getByLabelText("Timezone of awareness");
    expect(select.value).toBe("America/Chicago");
    await user.selectOptions(select, "America/New_York");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const saved = incidents.updateIncident.mock.calls[0][1].payload;
    expect(saved.awareness).toBe("2026-01-15T10:00");
    expect(saved.awarenessTz).toBe("America/New_York");
  });
});

describe("legacy records (ruling C)", () => {
  it("a payload without awarenessTz still computes, shows the caveat on screen, and passes it to the memo", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor()); // no awarenessTz
    renderEditor();
    await waitFor(() => expect(screen.getAllByText(/Notify Affected Colorado Residents/).length).toBeGreaterThan(0));
    expect(screen.getByText(CAVEAT)).toBeTruthy();
    // The selector offers the device zone as the visible suggestion.
    await user.click(screen.getByRole("button", { name: /edit answers/i }));
    expect(screen.getByLabelText("Timezone of awareness").value).toBe(deviceTimeZone());
    await user.click(screen.getByRole("button", { name: /back to results/i }));
    // Memo facts carry the display zone and the "not recorded" flag.
    await user.click(screen.getByRole("button", { name: /download memo/i }));
    await waitFor(() => expect(memo.generateMemoPdf).toHaveBeenCalledTimes(1));
    const facts = memo.generateMemoPdf.mock.calls[0][0];
    expect(facts.awarenessTzRecorded).toBe(false);
    expect(facts.awarenessTz).toBe(deviceTimeZone());
  });

  it("resubmitting a legacy record writes the zone (healing) and the caveat clears", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor());
    renderEditor();
    await waitFor(() => expect(screen.getByText(CAVEAT)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /edit answers/i }));
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const saved = incidents.updateIncident.mock.calls[0][1].payload;
    expect(saved.awarenessTz).toBe(deviceTimeZone());
    await waitFor(() => expect(screen.queryByText(CAVEAT)).toBeNull());
  });

  it("a zone-explicit record never shows the caveat in the memo facts", async () => {
    const user = userEvent.setup();
    loadIncident(payloadFor({ awarenessTz: "America/Chicago" }));
    renderEditor();
    await waitFor(() => expect(screen.getAllByText(/Notify Affected Colorado Residents/).length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /download memo/i }));
    await waitFor(() => expect(memo.generateMemoPdf).toHaveBeenCalledTimes(1));
    const facts = memo.generateMemoPdf.mock.calls[0][0];
    expect(facts.awarenessTz).toBe("America/Chicago");
    expect(facts.awarenessTzRecorded).toBe(true);
  });
});

describe("new incident", () => {
  it("prefills the zone selector with the device zone as an editable suggestion", async () => {
    const user = userEvent.setup();
    renderEditor("/breach-clock/new");
    // Full mode opens with only the first section expanded; awareness lives
    // in "How & When Discovered".
    await user.click(await screen.findByRole("button", { name: /how & when discovered/i }));
    const select = await screen.findByLabelText("Timezone of awareness");
    expect(select.value).toBe(deviceTimeZone());
    expect(screen.getByText(/suggested from this device/)).toBeTruthy();
  });
});
