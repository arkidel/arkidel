import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Supabase client module: the data layer is the only place that
// imports it, so we assert it calls the right client methods without a real DB.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));
vi.mock("../lib/supabase.js", () => ({ supabase: supabaseMock }));

import {
  createIncident,
  updateIncident,
  updateIncidentStatus,
  getIncident,
  listIncidents,
  deleteIncident,
} from "./incidents.js";

// A chainable query-builder stub. The non-terminal methods return the builder;
// the terminal methods (order, single, maybeSingle) resolve to a
// PostgREST-shaped result. eq is both: it chains, but delete().eq(...) is
// awaited directly, so it must also be thenable — resolving via the result.
function makeQuery(result) {
  const q = {
    select: vi.fn(() => q),
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    delete: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

beforeEach(() => {
  supabaseMock.from.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createIncident", () => {
  it("inserts org_id + title + payload and returns the row", async () => {
    const created = { id: "inc-1", org_id: "org-1", title: "T", status: "draft" };
    const query = makeQuery({ data: created, error: null });
    supabaseMock.from.mockReturnValue(query);

    const payload = { awareness: "2026-07-01T09:00" };
    const result = await createIncident("org-1", "T", payload);

    expect(supabaseMock.from).toHaveBeenCalledWith("incidents");
    // status defaults to 'draft' when the caller doesn't pass one; the
    // notification record and incident log default to their empty shapes
    // (both are insert columns since the 2026-07-24 notification-record
    // commit — this expectation matches the shipped insert).
    expect(query.insert).toHaveBeenCalledWith({
      org_id: "org-1",
      title: "T",
      payload,
      status: "draft",
      notifications: {},
      incident_log: [],
    });
    expect(query.select).toHaveBeenCalled();
    expect(query.single).toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it("carries a non-draft status into the insert (submitted-before-first-save)", async () => {
    const query = makeQuery({ data: { id: "inc-1", status: "active" }, error: null });
    supabaseMock.from.mockReturnValue(query);

    await createIncident("org-1", "T", {}, "active");

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("throws when no org id is supplied", async () => {
    await expect(createIncident("", "T", {})).rejects.toThrow(/organization/i);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

describe("updateIncident", () => {
  it("updates title + payload by id and returns the row", async () => {
    const updated = { id: "inc-1", title: "New title" };
    const query = makeQuery({ data: updated, error: null });
    supabaseMock.from.mockReturnValue(query);

    const payload = { riskLevel: "high" };
    const result = await updateIncident("inc-1", { title: "New title", payload });

    expect(supabaseMock.from).toHaveBeenCalledWith("incidents");
    expect(query.update).toHaveBeenCalledWith({ title: "New title", payload });
    expect(query.eq).toHaveBeenCalledWith("id", "inc-1");
    expect(result).toEqual(updated);
  });

  it("carries a status transition in the SAME patch when passed (Submit & compute)", async () => {
    // The atomicity ruling (JDC 2026-08-02): payload and the active
    // transition land in one PATCH — no facts/status divergence window.
    const updated = { id: "inc-1", title: "T", status: "active" };
    const query = makeQuery({ data: updated, error: null });
    supabaseMock.from.mockReturnValue(query);

    const payload = { riskLevel: "high" };
    await updateIncident("inc-1", { title: "T", payload, status: "active" });

    expect(query.update).toHaveBeenCalledWith({ title: "T", payload, status: "active" });
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  it("never touches status when the caller omits it (plain Save)", async () => {
    const query = makeQuery({ data: { id: "inc-1" }, error: null });
    supabaseMock.from.mockReturnValue(query);

    const payload = { riskLevel: "high" };
    await updateIncident("inc-1", { title: "T", payload });

    expect(query.update).toHaveBeenCalledWith({ title: "T", payload });
    expect(query.update.mock.calls[0][0]).not.toHaveProperty("status");
  });
});

describe("updateIncidentStatus", () => {
  it("updates status alone by id and returns the row", async () => {
    const updated = { id: "inc-1", status: "closed" };
    const query = makeQuery({ data: updated, error: null });
    supabaseMock.from.mockReturnValue(query);

    const result = await updateIncidentStatus("inc-1", "closed");

    expect(supabaseMock.from).toHaveBeenCalledWith("incidents");
    // Status-only write — title and payload are never touched here.
    expect(query.update).toHaveBeenCalledWith({ status: "closed" });
    expect(query.eq).toHaveBeenCalledWith("id", "inc-1");
    expect(result).toEqual(updated);
  });

  it("throws when the update errors", async () => {
    const query = makeQuery({ data: null, error: { message: "boom" } });
    supabaseMock.from.mockReturnValue(query);

    await expect(updateIncidentStatus("inc-1", "active")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("getIncident", () => {
  it("selects by id and returns the row", async () => {
    const row = { id: "inc-1", payload: {} };
    const query = makeQuery({ data: row, error: null });
    supabaseMock.from.mockReturnValue(query);

    const result = await getIncident("inc-1");

    expect(query.eq).toHaveBeenCalledWith("id", "inc-1");
    expect(query.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(row);
  });

  it("returns null (not an error) when the row is missing or foreign", async () => {
    const query = makeQuery({ data: null, error: null });
    supabaseMock.from.mockReturnValue(query);

    await expect(getIncident("inc-nope")).resolves.toBeNull();
  });

  it("returns null for a malformed (non-uuid) id", async () => {
    const query = makeQuery({ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } });
    supabaseMock.from.mockReturnValue(query);

    await expect(getIncident("not-a-uuid")).resolves.toBeNull();
  });

  it("throws on other query errors", async () => {
    const query = makeQuery({ data: null, error: { code: "500", message: "boom" } });
    supabaseMock.from.mockReturnValue(query);

    await expect(getIncident("inc-1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("listIncidents", () => {
  it("selects the org's incidents ordered by updated_at desc", async () => {
    const rows = [{ id: "inc-2" }, { id: "inc-1" }];
    const query = makeQuery({ data: rows, error: null });
    supabaseMock.from.mockReturnValue(query);

    const result = await listIncidents("org-1");

    expect(supabaseMock.from).toHaveBeenCalledWith("incidents");
    // The list reads payload too — the Respond home's Next-deadline column
    // computes from the saved inputs at list time.
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("payload"));
    expect(query.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(result).toEqual(rows);
  });

  it("returns an empty list when the org has no incidents", async () => {
    const query = makeQuery({ data: [], error: null });
    supabaseMock.from.mockReturnValue(query);

    await expect(listIncidents("org-1")).resolves.toEqual([]);
  });
});

describe("deleteIncident", () => {
  it("deletes by id", async () => {
    const query = makeQuery({ error: null });
    supabaseMock.from.mockReturnValue(query);

    await deleteIncident("inc-1");

    expect(supabaseMock.from).toHaveBeenCalledWith("incidents");
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("id", "inc-1");
  });

  it("throws when the delete errors", async () => {
    const query = makeQuery({ error: { message: "boom" } });
    supabaseMock.from.mockReturnValue(query);

    await expect(deleteIncident("inc-1")).rejects.toMatchObject({ message: "boom" });
  });
});
