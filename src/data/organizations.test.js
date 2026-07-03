import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Supabase client module: the data layer is the only place that
// imports it, so we assert it calls the right client methods without a real DB.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));
vi.mock("../lib/supabase.js", () => ({ supabase: supabaseMock }));

import { getMyOrganizations, createOrganization } from "./organizations.js";

// A chainable query-builder stub. select/insert return the builder; the
// terminal methods (order, single) resolve to a PostgREST-shaped result.
function makeQuery(result) {
  const q = {
    select: vi.fn(() => q),
    insert: vi.fn(() => q),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return q;
}

beforeEach(() => {
  supabaseMock.from.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getMyOrganizations", () => {
  it("selects from organizations and returns the rows", async () => {
    const rows = [{ id: "org-1", name: "Acme", created_by: "u1" }];
    const query = makeQuery({ data: rows, error: null });
    supabaseMock.from.mockReturnValue(query);

    const result = await getMyOrganizations();

    expect(supabaseMock.from).toHaveBeenCalledWith("organizations");
    expect(query.select).toHaveBeenCalled();
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual(rows);
  });

  it("returns an empty list (not an error) when the user has no orgs", async () => {
    const query = makeQuery({ data: [], error: null });
    supabaseMock.from.mockReturnValue(query);

    await expect(getMyOrganizations()).resolves.toEqual([]);
  });

  it("throws when the query errors", async () => {
    const query = makeQuery({ data: null, error: { message: "boom" } });
    supabaseMock.from.mockReturnValue(query);

    await expect(getMyOrganizations()).rejects.toMatchObject({ message: "boom" });
  });
});

describe("createOrganization", () => {
  it("inserts with created_by = the caller's user id and returns the row", async () => {
    const created = { id: "org-9", name: "New Co", created_by: "user-123" };
    const query = makeQuery({ data: created, error: null });
    supabaseMock.from.mockReturnValue(query);

    const result = await createOrganization("New Co", "user-123");

    expect(supabaseMock.from).toHaveBeenCalledWith("organizations");
    expect(query.insert).toHaveBeenCalledWith({
      name: "New Co",
      created_by: "user-123",
    });
    expect(query.select).toHaveBeenCalled();
    expect(query.single).toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it("throws when no user id is supplied", async () => {
    await expect(createOrganization("Nope")).rejects.toThrow(/signed in/i);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
