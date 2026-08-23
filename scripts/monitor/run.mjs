#!/usr/bin/env node
// =============================================================================
// CHANGE MONITOR — deterministic fetch → normalize → hash → diff.
//
// Change monitoring, stage 1 (JDC rulings 2026-08-23). No model calls, no
// triage: the monitor only records whether a source's normalized content
// hash moved. Incremental and stalest-first — each run works through the
// fetch_mode="auto" registry rows in last_fetched_at ASC NULLS FIRST order
// until its time budget is spent, then stops cleanly and reports how many
// rows it processed and how many remain. Idempotent: re-running on
// unchanged sources writes the same state again.
//
// Row transitions (diff_status):
//   pending      inserted from the registry, never fetched
//   unchanged    fetched; hash equals the stored hash (or first baseline)
//   changed      fetched; hash differs — previous_hash/changed_at record it.
//                Sticky: later identical fetches leave it 'changed' until a
//                later stage acknowledges the change (nothing in stage 1
//                resets it), so an un-reviewed change is never overwritten
//                by the next night's "no further change".
//   fetch_error  request failed after one retry or returned non-2xx;
//                hashes untouched, consecutive_failures incremented
//   manual       never fetched (Colorado); untouched by the runner
//
// Importable (`runMonitor`) for the Vercel trigger and the tests;
// CLI-runnable for a one-off local pass against MONITOR_DB_URL:
//   MONITOR_DB_URL=postgres://monitor_bot:…  node scripts/monitor/run.mjs [--budget 240]
// =============================================================================

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { normalizeBody } from "./normalize.mjs";
import { createMemoryStore, createPgStore } from "./store.mjs";

const require = createRequire(import.meta.url);

export function loadRegistry() {
  // Resolved relative to this module so the Vercel bundle (which traces the
  // require) and a local checkout read the same committed file.
  return require("../../registry.json");
}

export function staticRows(registry) {
  return registry.sources.map((s) => ({
    registry_id: s.id,
    ruleset_version: s.ruleset_version,
    diff_status: s.fetch_mode === "manual" ? "manual" : "pending",
  }));
}

const USER_AGENT = "ArkidelChangeMonitor/1 (+https://arkidel.com)";

async function fetchOnce(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8" },
    });
    const body = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, ok: res.ok, contentType: res.headers.get("content-type"), body };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch with one retry on thrown errors or 5xx/429. */
export async function fetchWithRetry(fetchImpl, url, timeoutMs) {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      last = await fetchOnce(fetchImpl, url, timeoutMs);
      if (last.ok || (last.status < 500 && last.status !== 429)) return last;
    } catch (err) {
      last = { status: null, ok: false, error: err?.name === "AbortError" ? "timeout" : String(err?.message || err) };
    }
  }
  return last;
}

/** Pure: derive the next row state from the stored row and a fetch result. */
export function nextRowState(row, result, nowIso) {
  if (!result.ok) {
    return {
      ...row,
      last_fetched_at: nowIso,
      http_status: result.status,
      diff_status: "fetch_error",
      consecutive_failures: (row.consecutive_failures || 0) + 1,
    };
  }
  const { hash } = normalizeBody(result.body, result.contentType);
  const base = { ...row, last_fetched_at: nowIso, http_status: result.status, consecutive_failures: 0 };
  if (row.content_hash === null || row.content_hash === undefined) {
    return { ...base, content_hash: hash, previous_hash: null, diff_status: "unchanged" };
  }
  if (hash === row.content_hash) {
    return { ...base, diff_status: row.diff_status === "changed" ? "changed" : "unchanged" };
  }
  return { ...base, previous_hash: row.content_hash, content_hash: hash, changed_at: nowIso, diff_status: "changed" };
}

/**
 * Run one monitor pass.
 * @param {object} opts
 * @param {object} [opts.registry]     parsed registry.json (default: committed file)
 * @param {object} opts.store          a store from store.mjs
 * @param {Function} [opts.fetchImpl]  fetch (default: global fetch)
 * @param {Function} [opts.now]        clock returning ms since epoch
 * @param {number} [opts.budgetSeconds] global time budget (default 240)
 * @param {number} [opts.timeoutMs]    per-request timeout (default 20000)
 */
export async function runMonitor({
  registry = loadRegistry(),
  store,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  budgetSeconds = 240,
  timeoutMs = 20_000,
} = {}) {
  if (!store) throw new Error("runMonitor: a store is required");
  const started = now();
  const deadline = started + budgetSeconds * 1000;

  const inserted = await store.ensureRows(staticRows(registry));
  const byId = new Map(registry.sources.map((s) => [s.id, s]));
  const autoIds = registry.sources.filter((s) => s.fetch_mode === "auto").map((s) => s.id);
  const queue = await store.selectAuto(autoIds);

  const summary = {
    ruleset_version: registry.ruleset_version,
    started_at: new Date(started).toISOString(),
    budget_seconds: budgetSeconds,
    inserted,
    total_auto: queue.length,
    manual: registry.sources.length - autoIds.length,
    processed: 0,
    remaining: queue.length,
    unchanged: 0,
    changed: 0,
    fetch_error: 0,
    stopped_on_budget: false,
    rows: [],
  };

  for (const row of queue) {
    const remainingMs = deadline - now();
    // Leave room for the request itself: stop if less than a quarter of the
    // per-request timeout is left, so a run never overruns its budget.
    if (remainingMs < Math.max(1000, timeoutMs / 4)) {
      summary.stopped_on_budget = true;
      break;
    }
    const source = byId.get(row.registry_id);
    const result = await fetchWithRetry(fetchImpl, source.source_url, Math.min(timeoutMs, remainingMs));
    const next = nextRowState(row, result, new Date(now()).toISOString());
    await store.writeResult(next);
    summary.processed += 1;
    summary.remaining -= 1;
    summary[next.diff_status] += 1;
    summary.rows.push({ id: row.registry_id, status: next.diff_status, http_status: next.http_status });
  }

  summary.finished_at = new Date(now()).toISOString();
  summary.elapsed_seconds = Math.round((now() - started) / 100) / 10;
  return summary;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const budgetArg = process.argv.indexOf("--budget");
  const budgetSeconds = budgetArg > -1 ? Number(process.argv[budgetArg + 1]) : 240;
  const dry = process.argv.includes("--dry-run");
  const url = process.env.MONITOR_DB_URL;
  if (!url && !dry) {
    console.error("MONITOR_DB_URL is not set (pass --dry-run to use an in-memory store).");
    process.exit(1);
  }
  const store = dry ? createMemoryStore() : await createPgStore(url);
  try {
    const summary = await runMonitor({ store, budgetSeconds });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await store.close();
  }
}
