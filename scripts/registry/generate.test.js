// Registry generator contracts (change monitoring stage 1):
//   - determinism: two independent renders are byte-identical
//   - drift: the committed registry.json matches the current data.js
//   - shape: every row carries the fields the monitor and the report rely on
//   - fetch mode: Colorado is manual, everything else auto (JDC 2026-08-23)

import { describe, expect, it } from "vitest";
import { JURISDICTIONS, RULESET_VERSION } from "../../src/breach-clock/data.js";
import { buildRegistry, renderRegistry, readCommittedRegistry, VERIFIED_DATES } from "./generate.mjs";

describe("registry generator", () => {
  it("renders byte-identical output across two runs", () => {
    const a = renderRegistry();
    const b = renderRegistry();
    expect(a).toBe(b);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(a).not.toMatch(/generated_at|timestamp/i);
  });

  it("drift check: committed registry.json matches the current data.js", () => {
    const committed = readCommittedRegistry();
    expect(committed, "registry.json is missing — run node scripts/registry/generate.mjs").not.toBeNull();
    expect(committed).toBe(renderRegistry());
  });

  it("emits one row per distinct (jurisdiction, source_url) with stable ids", () => {
    const rows = buildRegistry();
    const keys = rows.map((r) => `${r.jurisdiction} ${r.source_url}`);
    expect(new Set(keys).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.id).toMatch(/^[a-z]{2}-[a-z0-9-]+$/);
      expect(r.id.startsWith(`${r.jurisdiction}-`)).toBe(true);
      expect(typeof r.citation).toBe("string");
      expect(r.citations).toContain(r.citation);
      expect(r.source_url).toMatch(/^https?:\/\//);
      expect(r.rule_fields.length).toBeGreaterThan(0);
      for (const f of r.rule_fields) expect(f.startsWith(`${r.jurisdiction}.`)).toBe(true);
      expect(r.verified_date).toBe(VERIFIED_DATES[r.jurisdiction]);
      expect(r.ruleset_version).toBe(RULESET_VERSION);
      expect(["auto", "manual"]).toContain(r.fetch_mode);
    }
  });

  it("covers every jurisdiction in data.js, including counsel-note sources", () => {
    const rows = buildRegistry();
    for (const j of JURISDICTIONS) {
      expect(rows.some((r) => r.jurisdiction === j.id)).toBe(true);
    }
    expect(rows.some((r) => r.rule_fields.some((f) => f.includes(".counselNotes[")))).toBe(true);
  });

  it("marks Colorado manual and all other jurisdictions auto", () => {
    const rows = buildRegistry();
    for (const r of rows) {
      expect(r.fetch_mode).toBe(r.jurisdiction === "co" ? "manual" : "auto");
    }
    expect(rows.filter((r) => r.fetch_mode === "manual").length).toBeGreaterThan(0);
  });

  it("refuses a jurisdiction without a recorded verification date", () => {
    expect(() => buildRegistry([{ id: "zz", name: "Nowhere", obligations: [] }], "x")).toThrow(/verification date/);
  });

  it("citation strings are exact data.js strings", () => {
    const rows = buildRegistry();
    const all = new Set();
    for (const j of JURISDICTIONS) {
      for (const o of j.obligations) all.add(o.citation);
      for (const n of j.counselNotes || []) all.add(n.citation);
    }
    for (const r of rows) for (const c of r.citations) expect(all.has(c)).toBe(true);
  });
});
