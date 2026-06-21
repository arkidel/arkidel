// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Control useAuth() without a real provider or any Supabase client.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { value: null } }));
vi.mock("./AuthProvider.jsx", () => ({
  useAuth: () => mockAuth.value,
}));

import RequireAuth from "./RequireAuth.jsx";

function renderAt(authValue) {
  mockAuth.value = authValue;
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route
          path="/app"
          element={
            <RequireAuth>
              <div>Protected content</div>
            </RequireAuth>
          }
        />
        <Route path="/sign-in" element={<div>Sign-in page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe("RequireAuth", () => {
  it("redirects to /sign-in when unauthenticated", () => {
    renderAt({ session: null, loading: false });
    expect(screen.getByText("Sign-in page")).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("renders children when a session exists", () => {
    renderAt({
      session: { user: { email: "lawyer@example.com" } },
      loading: false,
    });
    expect(screen.getByText("Protected content")).toBeTruthy();
    expect(screen.queryByText("Sign-in page")).toBeNull();
  });

  it("renders neither (no redirect flash) while the session is loading", () => {
    renderAt({ session: null, loading: true });
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(screen.queryByText("Sign-in page")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
