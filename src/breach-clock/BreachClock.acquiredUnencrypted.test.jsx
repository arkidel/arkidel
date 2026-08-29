// @vitest-environment jsdom
//
// `acquiredUnencrypted` intake wiring (Virginia conformance pass, JDC
// 2026-08-29). Two contracts under test:
//
//   1. Reveal condition. The "Was encrypted information accessed and acquired
//      in an unencrypted form?" question is nested under the encryption
//      question and renders ONLY while encrypted === "yes" — exactly like the
//      strength and key-acquired questions beside it.
//   2. Round-trip persistence. The answer lands in the saved payload as
//      `acquiredUnencrypted` and a payload carrying it rehydrates the row's
//      checked state on load.
//
// The editor is exercised in quick mode through a saved incident whose
// answers deliberately fail the completeness gate, so it opens at the form
// rather than auto-computing to results (same harness as the unknown-count
// suite).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  updateIncidentViewState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../org/OrgProvider.jsx", () => ({ useOrg: () => org }));
vi.mock("../components/TopBarContext.jsx", () => ({ useTopBarHeader: () => {} }));
// The memo path pulls font/logo bytes through Vite `?url` imports; nothing
// here downloads a memo.
vi.mock("./memo-pdf.js", () => ({ generateMemoPdf: vi.fn() }));

import BreachClock from "./BreachClock.jsx";

const ENCRYPTED_Q = "Was the affected data encrypted?";
const ACQUIRED_UNENCRYPTED_Q = "Was encrypted information accessed and acquired in an unencrypted form?";

// A saved quick-mode incident with Virginia selected. No awareness and no Q1
// category, so the completeness gate fails and the editor opens at the form.
const savedPayload = (overrides = {}) => ({
  quickMode: true,
  awareness: "",
  jurisdictions: { va: true },
  residentCounts: { va: "" },
  sensitivity: [],
  record: { incidentTitle: "Acquired-unencrypted fixture" },
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

// Each cluster question renders label + tri-state rows inside its own wrapper
// div; ascend from the question text until the wrapper (the first ancestor
// containing checkbox rows) is found, so same-named Yes/No rows on other
// questions never collide.
const questionWrapper = (question) => {
  let node = screen.getByText(question);
  while (node && within(node).queryAllByRole("checkbox").length === 0) node = node.parentElement;
  if (!node) throw new Error(`no checkbox rows found for question: ${question}`);
  return node;
};

const answerRow = (question, answer) =>
  within(questionWrapper(question)).getByRole("checkbox", { name: answer });

beforeEach(() => {
  // jsdom ships no matchMedia; the editor uses it for its two layout queries.
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

describe("acquiredUnencrypted reveal condition", () => {
  it("renders the question only while the encryption question is answered Yes", async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText(ENCRYPTED_Q)).toBeTruthy());

    // Unset and "No" both hide the nested question.
    expect(screen.queryByText(ACQUIRED_UNENCRYPTED_Q)).toBeNull();
    await user.click(answerRow(ENCRYPTED_Q, "No"));
    expect(screen.queryByText(ACQUIRED_UNENCRYPTED_Q)).toBeNull();

    // Yes reveals it, alongside the strength and key-acquired questions.
    await user.click(answerRow(ENCRYPTED_Q, "Yes"));
    expect(screen.getByText(ACQUIRED_UNENCRYPTED_Q)).toBeTruthy();

    // Flipping back to No hides it again.
    await user.click(answerRow(ENCRYPTED_Q, "No"));
    expect(screen.queryByText(ACQUIRED_UNENCRYPTED_Q)).toBeNull();
  });
});

describe("acquiredUnencrypted round trip", () => {
  it("saves the answer into the payload", async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText(ENCRYPTED_Q)).toBeTruthy());

    await user.click(answerRow(ENCRYPTED_Q, "Yes"));
    await user.click(answerRow(ACQUIRED_UNENCRYPTED_Q, "Yes"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const [id, { payload }] = incidents.updateIncident.mock.calls[0];
    expect(id).toBe("inc-1");
    expect(payload.encrypted).toBe("yes");
    expect(payload.acquiredUnencrypted).toBe("yes");
  });

  it("rehydrates a saved answer with the row checked", async () => {
    incidents.getIncident.mockResolvedValue({
      id: "inc-1",
      status: "draft",
      payload: savedPayload({ encrypted: "yes", acquiredUnencrypted: "no" }),
      notifications: {},
      incident_log: [],
    });
    renderEditor();
    await waitFor(() => expect(screen.getByText(ACQUIRED_UNENCRYPTED_Q)).toBeTruthy());

    expect(answerRow(ACQUIRED_UNENCRYPTED_Q, "No").getAttribute("aria-checked")).toBe("true");
    expect(answerRow(ACQUIRED_UNENCRYPTED_Q, "Yes").getAttribute("aria-checked")).toBe("false");
  });

  it("preserves an unset answer as absent-or-empty, never a value", async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => expect(screen.getByText(ENCRYPTED_Q)).toBeTruthy());

    await user.click(answerRow(ENCRYPTED_Q, "Yes"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(incidents.updateIncident).toHaveBeenCalledTimes(1));
    const [, { payload }] = incidents.updateIncident.mock.calls[0];
    expect(payload.acquiredUnencrypted).toBe("");
  });
});
