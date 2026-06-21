import { afterEach, describe, expect, it, vi } from "vitest";

// The client module reads import.meta.env at load and throws if either var is
// missing. We stub the env per-test and reset the module registry between tests
// so each dynamic import re-evaluates the module against the current env.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("supabase client module", () => {
  it("creates and exports a client when both env vars are present", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    const { supabase } = await import("./supabase.js");

    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
    expect(supabase.auth).toBeDefined();
  });

  it("throws a descriptive error when VITE_SUPABASE_URL is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    await expect(import("./supabase.js")).rejects.toThrow(/VITE_SUPABASE_URL/);
  });

  it("throws a descriptive error when VITE_SUPABASE_PUBLISHABLE_KEY is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(import("./supabase.js")).rejects.toThrow(
      /VITE_SUPABASE_PUBLISHABLE_KEY/
    );
  });
});
