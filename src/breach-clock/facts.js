// Shared UI-layer helpers over the saved-incident input shape.
//
// One source of truth for (a) parsing the awareness datetime-local string,
// (b) the completeness gate that decides whether a set of answers can compute
// — the editor's canCompute / submit gate, reused verbatim by the incidents
// list's Next-deadline column so the two can never drift — and (c) mapping a
// saved payload (the exact shape BreachClock's buildPayload writes) to the
// engine's facts object. Pure functions: no React, no engine imports —
// callers pass the result to computeDeadlines themselves.
//
// This is presentation-side plumbing, not substance: nothing here decides
// what fires. That stays in engine.js/data.js.

export function parseAwareness(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// The minimal operative inputs required to compute (mirrors the old
// canAdvance): a real, non-future awareness date, at least one jurisdiction,
// and at least one Q1 data type. `now` is passed in so callers control
// ticking (the editor's live clock) vs. static (the list's one-shot check).
export function computableGate({ awareness, jurisdictions, sensitivity }, now) {
  const awarenessDate = parseAwareness(awareness);
  const hasAwareness = !!awarenessDate && awarenessDate <= now;
  const hasJurisdiction = Object.values(jurisdictions || {}).some(Boolean);
  const hasSensitivity = Array.isArray(sensitivity) && sensitivity.length > 0;
  return {
    awarenessDate,
    hasAwareness,
    hasJurisdiction,
    hasSensitivity,
    canCompute: hasAwareness && hasJurisdiction && hasSensitivity,
  };
}

// Engine facts from a saved payload. Extra payload keys (record, quickMode,
// the raw awareness string) pass through harmlessly — computeDeadlines
// destructures only the keys it knows, and the adversarial parity test pins
// that record noise never changes engine output. The operative scalar
// inputs ride the same passthrough: riskLevel and, as of the harm-gate pass
// (2026-08-02), harmAssessment ("" | "determined_unlikely" | "harm_likely")
// — its sibling. Neither needs mapping here; the spread carries them.
//
// `residentCountUnknown` (intake phase 2) — the { [jurId]: true } map of
// jurisdictions whose resident count has not been established — rides the
// same spread, but is normalized to an object here so an older payload
// (written before the key existed) or a malformed value can never reach the
// engine as something it would index into. Absent key → {}; no migration.
export function factsFromPayload(payload = {}) {
  const unknown = payload.residentCountUnknown;
  return {
    ...payload,
    residentCountUnknown: unknown && typeof unknown === "object" ? unknown : {},
    awarenessDate: parseAwareness(payload.awareness),
  };
}
