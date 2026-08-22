// The facts boundary (serverless bundle, JDC 2026-08-22): (awareness,
// awarenessTz) resolve to ONE instant here; the engine never sees a zone.
// Legacy zone-less payloads keep the viewer-zone parse; Submit requires a
// zone; compute does not.
import { describe, it, expect } from "vitest";
import { computableGate, factsFromPayload, resolveAwareness, parseAwareness } from "./facts.js";
import { computeDeadlines } from "./engine.js";

const NOW = new Date("2026-10-01T00:00:00Z");

describe("resolveAwareness", () => {
  it("resolves zone-explicitly when a usable zone is declared", () => {
    expect(resolveAwareness("2026-09-30T10:00", "America/Chicago").toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });
  it("falls to the legacy viewer-zone parse when the zone is absent or unrecognized", () => {
    const legacy = parseAwareness("2026-09-30T10:00");
    expect(resolveAwareness("2026-09-30T10:00", undefined).getTime()).toBe(legacy.getTime());
    expect(resolveAwareness("2026-09-30T10:00", "").getTime()).toBe(legacy.getTime());
    expect(resolveAwareness("2026-09-30T10:00", "Mars/Base").getTime()).toBe(legacy.getTime());
  });
  it("never invents an instant", () => {
    expect(resolveAwareness("", "America/Chicago")).toBeNull();
    expect(resolveAwareness("2026-02-30T10:00", "America/Chicago")).toBeNull();
    expect(resolveAwareness("garbage", undefined)).toBeNull();
  });
});

describe("computableGate", () => {
  const base = { jurisdictions: { ca: true }, sensitivity: ["identifiers"] };
  it("canCompute but NOT canSubmit for a legacy payload without a zone", () => {
    const g = computableGate({ ...base, awareness: "2026-09-30T10:00" }, NOW);
    expect(g.canCompute).toBe(true);
    expect(g.hasAwarenessTz).toBe(false);
    expect(g.canSubmit).toBe(false);
  });
  it("canSubmit once a usable zone is declared", () => {
    const g = computableGate({ ...base, awareness: "2026-09-30T10:00", awarenessTz: "America/Chicago" }, NOW);
    expect(g.canCompute).toBe(true);
    expect(g.canSubmit).toBe(true);
    expect(g.awarenessDate.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });
  it("an unrecognized zone counts as no zone", () => {
    const g = computableGate({ ...base, awareness: "2026-09-30T10:00", awarenessTz: "Mars/Base" }, NOW);
    expect(g.hasAwarenessTz).toBe(false);
    expect(g.canSubmit).toBe(false);
  });
  it("future awareness (judged in the declared zone) fails both verdicts", () => {
    // 2026-09-30T19:30 in Chicago is 2026-10-01T00:30Z — 30 minutes after NOW.
    const g = computableGate({ ...base, awareness: "2026-09-30T19:30", awarenessTz: "America/Chicago" }, NOW);
    expect(g.hasAwareness).toBe(false);
    expect(g.canCompute).toBe(false);
    expect(g.canSubmit).toBe(false);
    // …while the same wall time in UTC is five hours earlier and passes.
    expect(computableGate({ ...base, awareness: "2026-09-30T19:30", awarenessTz: "UTC" }, NOW).canSubmit).toBe(true);
  });
});

describe("factsFromPayload → engine", () => {
  it("hands the engine one instant; the engine output depends on the zone only through it", () => {
    const chicago = computeDeadlines(factsFromPayload({ awareness: "2026-09-30T10:00", awarenessTz: "America/Chicago", jurisdictions: { co: true }, residentCounts: { co: 1 } }));
    const utc = computeDeadlines(factsFromPayload({ awareness: "2026-09-30T10:00", awarenessTz: "UTC", jurisdictions: { co: true }, residentCounts: { co: 1 } }));
    const res = (r) => r.deadlines.find((d) => d.jurisdiction === "Colorado" && /Residents/.test(d.authority)).deadline.getTime();
    expect(res(chicago) - res(utc)).toBe(5 * 3600 * 1000);
    expect(utc.ruleset_version).toBe("2026-08-22");
  });
  it("a zone-less payload that cannot resolve is refused by the engine, never computed empty", () => {
    const r = computeDeadlines(factsFromPayload({ awareness: "", jurisdictions: { co: true } }));
    expect(r.error).toBe("incomplete_facts");
    expect(r.missing).toEqual(["awarenessDate"]);
  });
});
