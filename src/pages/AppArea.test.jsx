// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Control the org context: OrgProvider passes through, useOrg returns our value.
const { mockOrg } = vi.hoisted(() => ({ mockOrg: { value: null } }));
vi.mock("../org/OrgProvider.jsx", () => ({
  OrgProvider: ({ children }) => children,
  useOrg: () => mockOrg.value,
}));

// Control auth (Onboarding reads user; AppHome reads profile).
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { value: null } }));
vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => mockAuth.value,
}));

// Mock the data layer so onboarding submits without a real DB call.
const { createOrganization } = vi.hoisted(() => ({
  createOrganization: vi.fn(),
}));
vi.mock("../data/organizations.js", () => ({ createOrganization }));

// Mock incidents so AppHome's recent-work list resolves without a DB call.
const { listIncidents } = vi.hoisted(() => ({
  listIncidents: vi.fn(),
}));
vi.mock("../data/incidents.js", () => ({ listIncidents }));

import AppArea from "./AppArea.jsx";

// AppHome renders router Links, so the gate is rendered inside a MemoryRouter.
const renderArea = () =>
  render(
    <MemoryRouter>
      <AppArea />
    </MemoryRouter>
  );

beforeEach(() => {
  mockAuth.value = {
    user: { id: "user-1", email: "lawyer@example.com" },
    profile: { full_name: "Jane Counsel" },
    signOut: vi.fn(),
  };
  createOrganization.mockReset().mockResolvedValue({ id: "org-1", name: "Acme" });
  listIncidents.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppArea gate", () => {
  it("shows a spinner while orgs are loading", () => {
    mockOrg.value = { organizations: [], activeOrg: null, loading: true, refresh: vi.fn() };
    renderArea();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText(/create your organization/i)).toBeNull();
  });

  it("renders onboarding when the user has no org, and creates one on submit", async () => {
    const refresh = vi.fn();
    const adoptOrganization = vi.fn();
    mockOrg.value = {
      organizations: [],
      activeOrg: null,
      loading: false,
      refresh,
      adoptOrganization,
    };
    const user = userEvent.setup();
    renderArea();

    expect(screen.getByText(/create your organization/i)).toBeTruthy();

    await user.type(screen.getByLabelText(/organization name/i), "Acme");
    await user.click(screen.getByRole("button", { name: /create organization/i }));

    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(createOrganization).toHaveBeenCalledWith("Acme", "user-1");
    // The returned row is adopted directly; no post-create re-select.
    expect(adoptOrganization).toHaveBeenCalledWith({ id: "org-1", name: "Acme" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders the app home when an org exists: greeting, tool cards, recent work", async () => {
    mockOrg.value = {
      organizations: [{ id: "org-1", name: "Acme Legal" }],
      activeOrg: { id: "org-1", name: "Acme Legal" },
      loading: false,
      refresh: vi.fn(),
    };
    listIncidents.mockResolvedValue([
      { id: "inc-1", title: "Vendor laptop theft", status: "draft", updated_at: "2026-07-08T14:00:00Z" },
      { id: "inc-2", title: "Phishing follow-up", status: "draft", updated_at: "2026-07-07T09:30:00Z" },
      { id: "inc-3", title: "S3 exposure review", status: "draft", updated_at: "2026-07-06T18:15:00Z" },
      { id: "inc-4", title: "Should not appear", status: "draft", updated_at: "2026-07-01T12:00:00Z" },
    ]);
    renderArea();

    // Greeting: no nickname set, so the first token of the full name.
    expect(screen.getByRole("heading", { name: /welcome back, jane/i })).toBeTruthy();

    // Tool cards: the Respond card is the "New incident" action (fresh form);
    // Map is a non-link placeholder.
    expect(screen.getByRole("link", { name: /respond/i }).getAttribute("href")).toBe("/breach-clock/new");
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.getByText(/in development/i)).toBeTruthy();
    expect(screen.getByText(/coming soon/i)).toBeTruthy();

    // Recent work: the 3 newest incidents render, the 4th is sliced off.
    expect(await screen.findByRole("link", { name: "Vendor laptop theft" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Phishing follow-up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "S3 exposure review" })).toBeTruthy();
    expect(screen.queryByText("Should not appear")).toBeNull();
    expect(listIncidents).toHaveBeenCalledWith("org-1");

    // View-all link into Respond home (the list lives at /breach-clock now).
    expect(screen.getByRole("link", { name: /view all/i }).getAttribute("href")).toBe("/breach-clock");

    // The stub's sign-out button is gone (the account menu owns that now),
    // and this isn't onboarding.
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
    expect(screen.queryByText(/create your organization/i)).toBeNull();
  });

  it("greets with the nickname when one is set, beating the full name", async () => {
    mockAuth.value = {
      ...mockAuth.value,
      profile: { full_name: "Jane Counsel", nickname: "  JC  " },
    };
    mockOrg.value = {
      organizations: [{ id: "org-1", name: "Acme Legal" }],
      activeOrg: { id: "org-1", name: "Acme Legal" },
      loading: false,
      refresh: vi.fn(),
    };
    renderArea();

    // Nickname wins (trimmed); the full name's first token is not used.
    expect(await screen.findByRole("heading", { name: "Welcome back, JC" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /welcome back, jane/i })).toBeNull();
  });

  it("greets plainly when neither nickname nor full name is set", async () => {
    mockAuth.value = { ...mockAuth.value, profile: null };
    mockOrg.value = {
      organizations: [{ id: "org-1", name: "Acme Legal" }],
      activeOrg: { id: "org-1", name: "Acme Legal" },
      loading: false,
      refresh: vi.fn(),
    };
    renderArea();

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  });

  it("shows the empty recent-work state when no incidents are saved", async () => {
    mockOrg.value = {
      organizations: [{ id: "org-1", name: "Acme Legal" }],
      activeOrg: { id: "org-1", name: "Acme Legal" },
      loading: false,
      refresh: vi.fn(),
    };
    renderArea();

    expect(await screen.findByText(/nothing saved yet/i)).toBeTruthy();
    // The tool card targets the fresh form; the empty-state "Respond" link
    // targets Respond home (the list at /breach-clock).
    const respondHrefs = screen
      .getAllByRole("link", { name: /respond/i })
      .map((a) => a.getAttribute("href"));
    expect(respondHrefs).toContain("/breach-clock/new");
    expect(respondHrefs).toContain("/breach-clock");
  });
});
