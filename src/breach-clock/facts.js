// Shared UI-layer helpers over the saved-incident input shape.
//
// One source of truth for (a) resolving the awareness datetime-local string
// and its declared zone to an instant, (b) the completeness gate that decides
// whether a set of answers can compute — the editor's canCompute / submit
// gate, reused verbatim by the incidents list's Next-deadline column so the
// two can never drift — and (c) mapping a saved payload (the exact shape
// BreachClock's buildPayload writes) to the engine's facts object. Pure
// functions: no React, no engine imports — callers pass the result to
// computeDeadlines themselves.
//
// This is presentation-side plumbing, not substance: nothing here decides
// what fires. That stays in engine.js/data.js.
//
// AWARENESS SEMANTICS (serverless bundle, JDC 2026-08-22). The payload
// carries `awareness` (the datetime-local string) and its sibling
// `awarenessTz` (an IANA zone id). This file is THE facts boundary: the pair
// is resolved to a single epoch instant here, once, and the engine receives
// only that instant — it does no timezone math. A payload WITHOUT a usable
// `awarenessTz` is a legacy record (ruling C): it remains readable and is
// interpreted in the viewer's zone exactly as before, via the same
// `new Date(string)` path; the surfaces render the "timezone not recorded"
// caveat for it. No backfill, no guessed zones. Resubmitting requires a zone.

import { isValidTimeZone, zonedWallClockToInstant } from "./timezone.js";

// Legacy parse — the datetime-local string in the reading device's zone.
// Retained verbatim for payloads that predate awarenessTz.
export function parseAwareness(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// True when the payload's zone is present and recognized. Absent or
// unrecognized → the legacy path.
export function hasAwarenessZone(awarenessTz) {
  return isValidTimeZone(awarenessTz);
}

// (awareness, awarenessTz) → Date instant, or null. Zone-explicit when the
// zone is usable; legacy viewer-zone parse otherwise.
export function resolveAwareness(awareness, awarenessTz) {
  if (!awareness) return null;
  if (hasAwarenessZone(awarenessTz)) {
    const ms = zonedWallClockToInstant(awareness, awarenessTz);
    return ms === null ? null : new Date(ms);
  }
  return parseAwareness(awareness);
}

// The minimal operative inputs required to compute (mirrors the old
// canAdvance): a real, non-future awareness instant, at least one
// jurisdiction, and at least one Q1 data type. `now` is passed in so callers
// control ticking (the editor's live clock) vs. static (the list's one-shot
// check).
//
// Two verdicts: `canCompute` (the facts resolve — legacy zone-less payloads
// included, so saved incidents and the Next-deadline column keep working) and
// `canSubmit` (canCompute AND a declared zone whenever awareness is set —
// the editor's Submit gate, which is what heals legacy incidents on
// resubmit).
export function computableGate({ awareness, awarenessTz, jurisdictions, sensitivity }, now) {
  const awarenessDate = resolveAwareness(awareness, awarenessTz);
  const hasAwareness = !!awarenessDate && awarenessDate <= now;
  const hasAwarenessTz = hasAwarenessZone(awarenessTz);
  const hasJurisdiction = Object.values(jurisdictions || {}).some(Boolean);
  const hasSensitivity = Array.isArray(sensitivity) && sensitivity.length > 0;
  const canCompute = hasAwareness && hasJurisdiction && hasSensitivity;
  return {
    awarenessDate,
    hasAwareness,
    hasAwarenessTz,
    hasJurisdiction,
    hasSensitivity,
    canCompute,
    canSubmit: canCompute && hasAwarenessTz,
  };
}

// Engine facts from a saved payload. Extra payload keys (record, quickMode,
// the raw awareness string and its zone) pass through harmlessly —
// computeDeadlines destructures only the keys it knows, and the adversarial
// parity test pins that record noise never changes engine output. The
// operative scalar inputs ride the same passthrough: riskLevel and, as of the
// harm-gate pass (2026-08-02), harmAssessment ("" | "determined_unlikely" |
// "harm_likely") — its sibling. Neither needs mapping here; the spread
// carries them.
//
// `residentCountUnknown` (intake phase 2) — the { [jurId]: true } map of
// jurisdictions whose resident count has not been established — rides the
// same spread, but is normalized to an object here so an older payload
// (written before the key existed) or a malformed value can never reach the
// engine as something it would index into. Absent key → {}; no migration.
//
// `awarenessDate` is the ONE instant the engine sees — resolved here from
// (awareness, awarenessTz); see the header note.
export function factsFromPayload(payload = {}) {
  const unknown = payload.residentCountUnknown;
  return {
    ...payload,
    residentCountUnknown: unknown && typeof unknown === "object" ? unknown : {},
    awarenessDate: resolveAwareness(payload.awareness, payload.awarenessTz),
  };
}
