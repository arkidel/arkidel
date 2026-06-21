// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Control the org context: OrgProvider passes through, useOrg returns our value.
const { mockOrg } = vi.hoisted(() => ({ mockOrg: { value: null } }));
vi.mock("../org/OrgProvider.jsx", () => ({
  OrgProvider: ({ children }) => children,
  useOrg: () => mockOrg.value,
}));

// Control auth (AppHome reads user/signOut).
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { value: null } }));
vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => mockAuth.value,
}));

// Mock the data layer so onboarding submits without a real DB call.
const { createOrganization } = vi.hoisted(() => ({
  createOrganization: vi.fn(),
}));
vi.mock("../data/organizations.js", () => ({ createOrganization }));

import AppArea from "./AppArea.jsx";

beforeEach(() => {
  mockAuth.value = { user: { email: "lawyer@example.com" }, signOut: vi.fn() };
  createOrganization.mockReset().mockResolvedValue({ id: "org-1", name: "Acme" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppArea gate", () => {
  it("shows a spinner while orgs are loading", () => {
    mockOrg.value = { organizations: [], activeOrg: null, loading: true, refresh: vi.fn() };
    render(<AppArea />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText(/create your organization/i)).toBeNull();
  });

  it("renders onboarding when the user has no org, and creates one on submit", async () => {
    const refresh = vi.fn().mockResolvedValue([{ id: "org-1", name: "Acme" }]);
    mockOrg.value = { organizations: [], activeOrg: null, loading: false, refresh };
    const user = userEvent.setup();
    render(<AppArea />);

    expect(screen.getByText(/create your organization/i)).toBeTruthy();

    await user.type(screen.getByLabelText(/organization name/i), "Acme");
    await user.click(screen.getByRole("button", { name: /create organization/i }));

    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(createOrganization).toHaveBeenCalledWith("Acme");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("renders the app with the active org's name when one exists", () => {
    mockOrg.value = {
      organizations: [{ id: "org-1", name: "Acme Legal" }],
      activeOrg: { id: "org-1", name: "Acme Legal" },
      loading: false,
      refresh: vi.fn(),
    };
    render(<AppArea />);

    // Active org name shown, plus the signed-in email.
    expect(screen.getAllByText(/acme legal/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/lawyer@example\.com/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeTruthy();
    // Not onboarding.
    expect(screen.queryByText(/create your organization/i)).toBeNull();
  });
});
