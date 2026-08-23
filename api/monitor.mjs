// Vercel Cron trigger for the change monitor (stage 1, JDC rulings
// 2026-08-23). Plain Vercel serverless function — this is a Vite SPA, no
// framework router. Vercel's cron scheduler calls GET /api/monitor with
// `Authorization: Bearer <CRON_SECRET>` once nightly (vercel.json → crons);
// cron invocations pass Deployment Protection. Anything without that exact
// header is rejected. No model calls, no triage — the run summary is the
// whole response.
//
// Env vars (values set by JDC in the Vercel dashboard, never in code):
//   CRON_SECRET      shared secret Vercel attaches to cron requests
//   MONITOR_DB_URL   Postgres URL for the scoped monitor_bot role

import { timingSafeEqual } from "node:crypto";
import { runMonitor } from "../scripts/monitor/run.mjs";
import { createPgStore } from "../scripts/monitor/store.mjs";

export const config = { maxDuration: 300 };

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers?.authorization || "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!process.env.MONITOR_DB_URL) {
    res.status(500).json({ error: "MONITOR_DB_URL not configured" });
    return;
  }
  const store = await createPgStore(process.env.MONITOR_DB_URL);
  try {
    const summary = await runMonitor({ store, budgetSeconds: 240 });
    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  } finally {
    await store.close();
  }
}
