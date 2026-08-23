// Monitor runner contracts (change monitoring stage 1), with a stubbed clock
// and stubbed fetch against the in-memory store:
//   - static rows are inserted once (insert-if-absent), manual rows stay manual
//   - selection is stalest-first: NULL last_fetched_at first, then oldest
//   - hash rotation: baseline -> unchanged -> changed (previous_hash/changed_at)
//   - fetch errors increment consecutive_failures and never touch hashes
//   - the time budget stops the run cleanly with processed/remaining counts
//   - manual rows are never fetched

import { describe, expect, it } from "vitest";
import { runMonitor, nextRowState, staticRows } from "./run.mjs";
import { createMemoryStore } from "./store.mjs";
import { sha256 } from "./normalize.mjs";

const registry = {
  ruleset_version: "2026-08-22",
  sources: [
    { id: "aa-one", jurisdiction: "aa", source_url: "https://example.test/one", fetch_mode: "auto", ruleset_version: "2026-08-22" },
    { id: "aa-two", jurisdiction: "aa", source_url: "https://example.test/two", fetch_mode: "auto", ruleset_version: "2026-08-22" },
    { id: "bb-three", jurisdiction: "bb", source_url: "https://example.test/three", fetch_mode: "auto", ruleset_version: "2026-08-22" },
    { id: "co-manual", jurisdiction: "co", source_url: "https://example.test/co", fetch_mode: "manual", ruleset_version: "2026-08-22" },
  ],
};

function makeClock(startMs, stepMs = 0) {
  let t = startMs;
  return {
    now: () => {
      const v = t;
      t += stepMs;
      return v;
    },
  };
}

function htmlResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "text/html; charset=utf-8" },
    arrayBuffer: async () => Buffer.from(`<html><body><main>${text}</main></body></html>`),
  };
}

function stubFetch(pages, log = []) {
  return async (url) => {
    log.push(url);
    const page = pages[url];
    if (page instanceof Error) throw page;
    if (typeof page === "function") return page();
    return htmlResponse(page);
  };
}

const T0 = Date.UTC(2026, 7, 23, 5, 30, 0);
const ALL_OK = { "https://example.test/one": "A", "https://example.test/two": "B", "https://example.test/three": "C" };

describe("runMonitor", () => {
  it("inserts static rows once, marks manual rows manual, never fetches them", async () => {
    const store = createMemoryStore();
    const log = [];
    const fetchImpl = stubFetch(ALL_OK, log);
    const first = await runMonitor({ registry, store, fetchImpl, now: makeClock(T0).now });
    expect(first.inserted).toBe(4);
    expect(first.manual).toBe(1);
    expect(first.total_auto).toBe(3);
    expect(first.processed).toBe(3);
    expect(first.remaining).toBe(0);
    expect(store.rows.get("co-manual").diff_status).toBe("manual");
    expect(store.rows.get("co-manual").last_fetched_at).toBeNull();
    expect(log).not.toContain("https://example.test/co");

    const second = await runMonitor({ registry, store, fetchImpl, now: makeClock(T0 + 86_400_000).now });
    expect(second.inserted).toBe(0);
  });

  it("selects stalest first: never-fetched rows before oldest-fetched, ties by id", async () => {
    const store = createMemoryStore([
      { registry_id: "aa-one", last_fetched_at: new Date(T0 - 3 * 3600_000).toISOString(), content_hash: null, diff_status: "pending", consecutive_failures: 0 },
      { registry_id: "aa-two", last_fetched_at: null, content_hash: null, diff_status: "pending", consecutive_failures: 0 },
      { registry_id: "bb-three", last_fetched_at: new Date(T0 - 9 * 3600_000).toISOString(), content_hash: null, diff_status: "pending", consecutive_failures: 0 },
    ]);
    const log = [];
    await runMonitor({ registry, store, fetchImpl: stubFetch(ALL_OK, log), now: makeClock(T0).now });
    expect(log).toEqual(["https://example.test/two", "https://example.test/three", "https://example.test/one"]);
  });

  it("stops cleanly on the time budget and reports processed/remaining", async () => {
    const store = createMemoryStore();
    const log = [];
    // Every now() call advances the stubbed clock 30s; with a 60s budget only
    // the first fetch fits before the guard trips.
    const clock = makeClock(T0, 30_000);
    const summary = await runMonitor({ registry, store, fetchImpl: stubFetch(ALL_OK, log), now: clock.now, budgetSeconds: 60, timeoutMs: 1000 });
    expect(summary.stopped_on_budget).toBe(true);
    expect(summary.processed + summary.remaining).toBe(3);
    expect(summary.processed).toBeLessThan(3);
    expect(log.length).toBe(summary.processed);
  });

  it("rotates hashes: baseline -> unchanged -> changed, and changed is sticky", async () => {
    const store = createMemoryStore();
    const pages = { ...ALL_OK, "https://example.test/one": "v1" };
    const run = (ms) => runMonitor({ registry, store, fetchImpl: stubFetch(pages), now: makeClock(ms).now });

    await run(T0);
    const r1 = store.rows.get("aa-one");
    expect(r1.diff_status).toBe("unchanged");
    expect(r1.content_hash).toBe(sha256("v1"));
    expect(r1.previous_hash).toBeNull();
    expect(r1.changed_at).toBeNull();

    await run(T0 + 1);
    expect(store.rows.get("aa-one").diff_status).toBe("unchanged");

    pages["https://example.test/one"] = "v2";
    await run(T0 + 2);
    const r3 = store.rows.get("aa-one");
    expect(r3.diff_status).toBe("changed");
    expect(r3.previous_hash).toBe(sha256("v1"));
    expect(r3.content_hash).toBe(sha256("v2"));
    expect(r3.changed_at).toBe(new Date(T0 + 2).toISOString());
    expect(r3.http_status).toBe(200);

    await run(T0 + 3);
    const r4 = store.rows.get("aa-one");
    expect(r4.diff_status).toBe("changed");
    expect(r4.changed_at).toBe(new Date(T0 + 2).toISOString());
  });

  it("records fetch errors without touching hashes and counts consecutive failures", async () => {
    const store = createMemoryStore();
    const pages = { ...ALL_OK, "https://example.test/one": "v1" };
    await runMonitor({ registry, store, fetchImpl: stubFetch(pages), now: makeClock(T0).now });

    pages["https://example.test/one"] = () => htmlResponse("gone", 404);
    await runMonitor({ registry, store, fetchImpl: stubFetch(pages), now: makeClock(T0 + 1).now });
    let r = store.rows.get("aa-one");
    expect(r.diff_status).toBe("fetch_error");
    expect(r.http_status).toBe(404);
    expect(r.consecutive_failures).toBe(1);
    expect(r.content_hash).toBe(sha256("v1"));

    pages["https://example.test/one"] = new Error("ECONNRESET");
    await runMonitor({ registry, store, fetchImpl: stubFetch(pages), now: makeClock(T0 + 2).now });
    r = store.rows.get("aa-one");
    expect(r.consecutive_failures).toBe(2);
    expect(r.http_status).toBeNull();

    pages["https://example.test/one"] = "v1";
    await runMonitor({ registry, store, fetchImpl: stubFetch(pages), now: makeClock(T0 + 3).now });
    r = store.rows.get("aa-one");
    expect(r.diff_status).toBe("unchanged");
    expect(r.consecutive_failures).toBe(0);
  });

  it("retries once on a 5xx and succeeds on the second attempt", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const pages = {
      ...ALL_OK,
      "https://example.test/one": () => (calls++ === 0 ? htmlResponse("err", 503) : htmlResponse("ok")),
    };
    await runMonitor({ registry, store, fetchImpl: stubFetch(pages), now: makeClock(T0).now });
    expect(calls).toBe(2);
    expect(store.rows.get("aa-one").diff_status).toBe("unchanged");
  });
});

describe("staticRows / nextRowState", () => {
  it("maps fetch_mode to the initial diff_status", () => {
    expect(staticRows(registry).map((r) => r.diff_status)).toEqual(["pending", "pending", "pending", "manual"]);
  });

  it("is pure over an identical result (idempotent)", () => {
    const row = { registry_id: "x", content_hash: sha256("a"), previous_hash: null, changed_at: null, diff_status: "unchanged", consecutive_failures: 0 };
    const result = { ok: true, status: 200, contentType: "text/plain", body: Buffer.from("a") };
    const a = nextRowState(row, result, "2026-08-23T05:30:00.000Z");
    const b = nextRowState(row, result, "2026-08-23T05:30:00.000Z");
    expect(a).toEqual(b);
    expect(a.diff_status).toBe("unchanged");
  });
});
