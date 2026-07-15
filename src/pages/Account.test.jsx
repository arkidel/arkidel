// @vitest-environment jsdom
//
// Account page: single-save profile form with a diffed patch. The contract
// under test: only changed fields go to updateProfile, nickname is
// null-normalized ("" and null compare equal), the button disables when the
// patch would be empty (and re-disables after a successful save), and a
// failed save leaves the form state untouched.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { value: null } }));
vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => mockAuth.value,
}));

import Account from "./Account.jsx";

const renderAccount = () =>
  render(
    <MemoryRouter>
      <Account />
    </MemoryRouter>
  );

const saveButton = () => screen.getByRole("button", { name: /^save$/i });

beforeEach(() => {
  mockAuth.value = {
    user: { id: "user-1", email: "lawyer@example.com", created_at: "2026-01-05T00:00:00Z" },
    profile: { full_name: "Jane Counsel", nickname: null },
    loading: false,
    updateProfile: vi.fn().mockResolvedValue({ error: null }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Account single-save form", () => {
  it("renders one Save button, disabled while nothing has changed", () => {
    renderAccount();
    expect(screen.getAllByRole("button", { name: /^save$/i })).toHaveLength(1);
    expect(saveButton().disabled).toBe(true);
  });

  it("sends a nickname-only patch when only the nickname was edited", async () => {
    const user = userEvent.setup();
    renderAccount();

    await user.type(screen.getByLabelText(/nickname/i), "  JC  ");
    expect(saveButton().disabled).toBe(false);
    await user.click(saveButton());

    // Trimmed, and no full_name key — the diff carries only what changed.
    expect(mockAuth.value.updateProfile).toHaveBeenCalledTimes(1);
    expect(mockAuth.value.updateProfile).toHaveBeenCalledWith({ nickname: "JC" });

    // Shared status line and the baseline advancing: "Saved · <time>" shows
    // and the button disables again.
    expect(await screen.findByText(/^Saved · /)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("sends a full_name-only patch when only the name was edited", async () => {
    const user = userEvent.setup();
    renderAccount();

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Q. Counsel");
    await user.click(saveButton());

    expect(mockAuth.value.updateProfile).toHaveBeenCalledWith({ full_name: "Jane Q. Counsel" });
  });

  it("keeps Save disabled when clearing an already-null nickname", async () => {
    const user = userEvent.setup();
    renderAccount();

    // Whitespace normalizes to null, which equals the stored null — no change.
    await user.type(screen.getByLabelText(/nickname/i), "   ");
    expect(saveButton().disabled).toBe(true);
    expect(mockAuth.value.updateProfile).not.toHaveBeenCalled();
  });

  it("clearing a set nickname sends null, not an empty string", async () => {
    mockAuth.value.profile = { full_name: "Jane Counsel", nickname: "JC" };
    const user = userEvent.setup();
    renderAccount();

    await user.clear(screen.getByLabelText(/nickname/i));
    await user.click(saveButton());

    expect(mockAuth.value.updateProfile).toHaveBeenCalledWith({ nickname: null });
  });

  it("shows the error and leaves form state untouched when the save fails", async () => {
    mockAuth.value.updateProfile.mockResolvedValue({ error: { message: "boom" } });
    const user = userEvent.setup();
    renderAccount();

    await user.type(screen.getByLabelText(/nickname/i), "JC");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
    // Edits survive the failure and the button stays enabled for a retry.
    expect(screen.getByLabelText(/nickname/i).value).toBe("JC");
    expect(saveButton().disabled).toBe(false);
    expect(screen.queryByText(/^Saved · /)).toBeNull();
  });
});
