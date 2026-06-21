// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Control useAuth() without a real provider or any Supabase client.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { value: null } }));
vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => mockAuth.value,
}));

import SignIn from "./SignIn.jsx";

function renderSignIn() {
  return render(
    <MemoryRouter initialEntries={["/sign-in"]}>
      <SignIn />
    </MemoryRouter>
  );
}

let signInWithMagicLink;

beforeEach(() => {
  signInWithMagicLink = vi.fn().mockResolvedValue({ data: {}, error: null });
  mockAuth.value = { session: null, loading: false, signInWithMagicLink };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SignIn", () => {
  it("submits the email to signInWithMagicLink and shows the confirmation", async () => {
    const user = userEvent.setup();
    renderSignIn();

    await user.type(
      screen.getByLabelText(/email address/i),
      "lawyer@example.com"
    );
    await user.click(screen.getByRole("button", { name: /send sign-in link/i }));

    expect(signInWithMagicLink).toHaveBeenCalledTimes(1);
    expect(signInWithMagicLink).toHaveBeenCalledWith("lawyer@example.com");

    // Confirmation replaces the form.
    expect(await screen.findByText(/check your email/i)).toBeTruthy();
    expect(screen.getByText(/lawyer@example\.com/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /send sign-in link/i })
    ).toBeNull();
  });

  it("shows an error message when sign-in fails", async () => {
    signInWithMagicLink.mockResolvedValueOnce({
      data: {},
      error: { message: "Email rate limit exceeded" },
    });
    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(/email address/i), "x@example.com");
    await user.click(screen.getByRole("button", { name: /send sign-in link/i }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Email rate limit exceeded"
    );
    // Still on the form, not the confirmation.
    expect(screen.queryByText(/check your email/i)).toBeNull();
  });

  it("is auth-only: no marketing or newsletter consent on the page", () => {
    renderSignIn();
    expect(screen.queryByText(/newsletter/i)).toBeNull();
    expect(screen.queryByText(/marketing/i)).toBeNull();
    expect(screen.queryByText(/agree to receive/i)).toBeNull();
  });
});
