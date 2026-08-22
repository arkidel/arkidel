// Timezone-explicit awareness (serverless bundle, JDC 2026-08-22).
//
// The awareness moment is stored as TWO payload fields: the datetime-local
// string the user typed (`awareness`, "YYYY-MM-DDTHH:mm[:ss]") and the IANA
// zone it was typed in (`awarenessTz`, e.g. "America/Chicago"). The user
// specifies the zone; awareness is NEVER interpreted from the reading device.
// The pair is resolved to one epoch instant exactly once, at the facts
// boundary (facts.js), and the engine receives that instant — it does no
// timezone math, ever.
//
// This module is the single home for the zone plumbing the two display
// surfaces and the facts boundary share: (a) resolving a wall-clock time in a
// named zone to an instant, (b) formatting an instant in the INCIDENT's
// declared zone with a zone label, and (c) the zone vocabulary the form's
// selector offers. Dependency-light and deterministic across hosts: the only
// primitive is Intl.DateTimeFormat's formatToParts round-trip, which every
// supported runtime (browsers, Node ≥ 18) resolves from the same IANA data.
// No runtime dependency is added. Pure functions, no React.

// ── Zone validity ─────────────────────────────────────────────────────────

const zoneFormatterCache = new Map();

function zoneFormatter(tz) {
  let fmt = zoneFormatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatterCache.set(tz, fmt);
  }
  return fmt;
}

// True when `tz` is a non-empty string the host's Intl data recognizes as a
// time zone. An unrecognized zone is treated exactly like an absent one by
// every consumer (legacy path), never guessed at.
export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    zoneFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

// The reading device's zone — offered as a visible, editable SUGGESTION in
// the form's zone selector. Never used to interpret a stored awareness.
export function deviceTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

// ── Wall clock ⇄ instant ──────────────────────────────────────────────────

// Wall-clock fields of `instantMs` as observed in `tz`.
function wallFieldsInZone(instantMs, tz) {
  const parts = zoneFormatter(tz).formatToParts(new Date(instantMs));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  // hourCycle h23 yields 00–23; guard the "24" some engines emit at midnight.
  const hour = get("hour") === 24 ? 0 : get("hour");
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute"), second: get("second") };
}

// Offset (ms) of `tz` from UTC at the given instant — positive east of UTC.
function zoneOffsetMs(instantMs, tz) {
  const w = wallFieldsInZone(instantMs, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Sub-second part of the instant never survives formatToParts; compare at
  // whole seconds so the offset is exact.
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

// Parse a datetime-local string into wall-clock fields. Accepts
// "YYYY-MM-DDTHH:mm", "YYYY-MM-DDTHH:mm:ss", and "YYYY-MM-DDTHH:mm:ss.sss".
// Returns null for anything else — a zone-explicit awareness is never
// inferred from a loosely formatted string.
export function parseWallClock(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value.trim());
  if (!m) return null;
  const fields = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
    ms: m[7] ? Number(m[7].padEnd(3, "0")) : 0,
  };
  // Reject impossible calendar values (the datetime-local control cannot emit
  // them, but a hand-edited payload could).
  const probe = new Date(Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second));
  if (
    probe.getUTCFullYear() !== fields.year || probe.getUTCMonth() !== fields.month - 1 || probe.getUTCDate() !== fields.day ||
    probe.getUTCHours() !== fields.hour || probe.getUTCMinutes() !== fields.minute || probe.getUTCSeconds() !== fields.second
  ) return null;
  return fields;
}

// Resolve a wall-clock time in `tz` to an epoch instant (ms). Returns null
// when the string or zone is unusable.
//
// Technique: treat the wall time as if it were UTC, then try each UTC offset
// the zone uses around that moment (the offset 24h before and 24h after the
// naive instant — the two sides of any transition). Each candidate instant is
// validated by formatting it back into the zone and comparing wall fields.
//
// DST resolution rule — EARLIEST INSTANT WINS, in both directions:
//   • Fall-back (ambiguous) wall time, e.g. 01:30 on 2026-11-01 in
//     America/Chicago, exists twice (01:30 CDT = 06:30Z, then 01:30 CST =
//     07:30Z). Both candidates validate; the earlier instant (06:30Z, the
//     first occurrence, still on daylight time) is chosen.
//   • Spring-forward (nonexistent) wall time, e.g. 02:30 on 2026-03-08 in
//     America/Chicago, exists zero times. Neither candidate validates: the
//     standard-time offset yields 08:30Z (which the zone shows as 03:30 CDT)
//     and the daylight offset yields 07:30Z (01:30 CST). The earlier instant
//     (07:30Z) is chosen.
// Why earliest: every deadline is awareness + N hours, so an earlier
// awareness instant can only make a computed deadline earlier — the same
// conservative direction as the engine's awareness-anchor and
// millisecond-arithmetic assumptions. The choice is deterministic on every
// host because it depends only on the zone's IANA rules, never on the
// device's zone.
export function zonedWallClockToInstant(value, tz) {
  const f = parseWallClock(value);
  if (!f || !isValidTimeZone(tz)) return null;
  const naiveUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const DAY = 24 * 3600 * 1000;
  const offsets = new Set([
    zoneOffsetMs(naiveUtc - DAY, tz),
    zoneOffsetMs(naiveUtc, tz),
    zoneOffsetMs(naiveUtc + DAY, tz),
  ]);
  const candidates = [...offsets].map((off) => naiveUtc - off);
  const valid = candidates.filter((inst) => {
    const w = wallFieldsInZone(inst, tz);
    return w.year === f.year && w.month === f.month && w.day === f.day && w.hour === f.hour && w.minute === f.minute && w.second === f.second;
  });
  const pool = valid.length ? valid : candidates;
  return Math.min(...pool) + f.ms;
}

// ── Display in the incident's declared zone ───────────────────────────────
//
// Display rule (JDC ruling B): every rendered deadline time — screen cards,
// queue, contingent qualifiers, memo — shows in the INCIDENT's declared zone
// with a zone label. When `tz` is absent/invalid (a legacy payload without
// awarenessTz) the formatters fall to the viewer's zone, exactly as before,
// and the Analysis Inputs caveat says so on both surfaces.

function zoneOpt(tz) {
  return isValidTimeZone(tz) ? { timeZone: tz } : {};
}

// Short zone label for an instant in `tz`: the en-US generic form where it is
// compact ("CT", "ET", "PT", "MST", "HST", "AKT" — the forms the spec's
// "10:00 AM CT" example uses), otherwise the specific short form the locale
// offers ("GMT+1", "GMT+5:30", "UTC"). Always non-empty.
export function zoneLabel(d, tz) {
  const date = d instanceof Date ? d : new Date(d);
  if (tz === "UTC" || tz === "Etc/UTC") return "UTC";
  const pick = (timeZoneName) => {
    try {
      return new Intl.DateTimeFormat("en-US", { ...zoneOpt(tz), timeZoneName })
        .formatToParts(date)
        .find((p) => p.type === "timeZoneName")?.value || "";
    } catch {
      return "";
    }
  };
  const generic = pick("shortGeneric");
  if (generic && generic.length <= 5 && !/\s/.test(generic)) return generic;
  const specific = pick("short");
  if (specific) return specific;
  return isValidTimeZone(tz) ? tz : "";
}

// "9/30/2026, 10:00 AM CT" — the numeric date-time with zone label (the
// on-screen due lines and the Analysis Inputs awareness row).
export function formatDateTimeInZone(d, tz) {
  const date = d instanceof Date ? d : new Date(d);
  const text = date.toLocaleString("en-US", {
    ...zoneOpt(tz),
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return `${text} ${zoneLabel(date, tz)}`;
}

// "September 30, 2026 at 10:00 AM CT" — the memo's long form.
export function formatLongDateTimeInZone(d, tz) {
  const date = d instanceof Date ? d : new Date(d);
  const day = date.toLocaleDateString("en-US", { ...zoneOpt(tz), year: "numeric", month: "long", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { ...zoneOpt(tz), hour: "2-digit", minute: "2-digit" });
  return `${day} at ${time} ${zoneLabel(date, tz)}`;
}

// "Sep 30, 2026" — date-only, judged in the incident's zone (a deadline just
// past midnight in the incident zone must not print the previous day because
// the viewer sits further west). Returns the zone-correct calendar day.
export function formatDateInZone(d, tz) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-US", { ...zoneOpt(tz), month: "short", day: "numeric", year: "numeric" });
}

// datetime-local value ("YYYY-MM-DDTHH:mm") of an instant as seen in `tz` —
// used for the awareness input's `max` (now, in the selected zone).
export function toDateTimeLocalInZone(d, tz) {
  const date = d instanceof Date ? d : new Date(d);
  if (!isValidTimeZone(tz)) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const w = wallFieldsInZone(date.getTime(), tz);
  const pad = (n) => String(n).padStart(2, "0");
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

// Legacy caveat (ruling C) — ONE string, rendered verbatim in Analysis
// Inputs on both surfaces for a record without a declared awareness zone.
export const AWARENESS_TZ_CAVEAT =
  "Awareness timezone not recorded — times shown in the viewing device's timezone.";

// ── Zone vocabulary for the selector ──────────────────────────────────────

// Common US zones, grouped first in the selector. IANA ids, with the labels
// the selector shows.
export const COMMON_US_ZONES = [
  { id: "America/New_York", label: "Eastern (America/New_York)" },
  { id: "America/Chicago", label: "Central (America/Chicago)" },
  { id: "America/Denver", label: "Mountain (America/Denver)" },
  { id: "America/Phoenix", label: "Mountain, no DST (America/Phoenix)" },
  { id: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { id: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { id: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
  { id: "UTC", label: "UTC" },
];

// The full IANA list the host knows, minus the common group above. Falls back
// to the common group alone on a runtime without Intl.supportedValuesOf.
export function allTimeZones() {
  let ids = [];
  try {
    ids = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  } catch {
    ids = [];
  }
  const common = new Set(COMMON_US_ZONES.map((z) => z.id));
  return ids.filter((id) => !common.has(id));
}
