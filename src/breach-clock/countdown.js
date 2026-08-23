// =============================================================================
// countdown.js — countdown PRESENTATION (not engine logic).
//
// Magnitude-tiered countdown strings for the results page (JDC ruling
// 2026-08-23, "countdown precision degrades with magnitude"). Applies to
// remaining and overdue alike, on cards and in the deadline queue:
//
//   tier "days"     — magnitude ≥ 7 days        → "34d"        ("34d overdue")
//   tier "dayshrs"  — 24 hours ≤ magnitude < 7d → "4d 01h"
//   tier "hrsmins"  — 1 hour ≤ magnitude < 24h  → "3h 05m"
//   tier "minsecs"  — magnitude < 1 hour        → "12m 09s"    (live, per second)
//
// Boundaries are inclusive at the top of each tier: exactly 7d is "days",
// exactly 24h is "dayshrs", exactly 1h is "hrsmins". Precision lives in the
// exact "Due {date, time, zone}" line beneath the counter, not here.
//
// Only the "minsecs" tier needs a per-second refresh; everything else is
// correct to the minute, so the page's shared interval is 60 seconds and a
// 1-second interval attaches only to an element in that tier (see the
// Countdown element in BreachClock.jsx). The queue's status cells use the
// same tiering with no per-second tier at all.
//
// Pure: no React, no Date.now() — the caller supplies the millisecond delta.
// =============================================================================

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const COUNTDOWN_SHARED_INTERVAL_MS = 60 * SECOND;
export const COUNTDOWN_LIVE_INTERVAL_MS = SECOND;

/**
 * The precision tier for a millisecond delta (sign-insensitive).
 * @param {number} ms
 * @returns {"days"|"dayshrs"|"hrsmins"|"minsecs"}
 */
export function countdownTier(ms) {
  const abs = Math.abs(ms);
  if (abs >= 7 * DAY) return "days";
  if (abs >= DAY) return "dayshrs";
  if (abs >= HOUR) return "hrsmins";
  return "minsecs";
}

/** True when an element showing this delta needs the per-second refresh. */
export const countdownIsLive = (ms) => countdownTier(ms) === "minsecs";

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Format a millisecond delta at its tier's precision. Negative deltas are
 * overdue and carry the " overdue" suffix; the magnitude is truncated
 * (floored) at the tier's finest unit, never rounded up.
 * @param {number} ms
 * @returns {string}
 */
export function formatCountdown(ms) {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / SECOND);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  let text;
  switch (countdownTier(ms)) {
    case "days":
      text = `${days}d`;
      break;
    case "dayshrs":
      text = `${days}d ${pad2(hours)}h`;
      break;
    case "hrsmins":
      text = `${hours}h ${pad2(mins)}m`;
      break;
    default:
      text = `${mins}m ${pad2(secs)}s`;
  }
  return neg ? `${text} overdue` : text;
}
