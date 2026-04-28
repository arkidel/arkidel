# Arkidel — Claude Code project instructions

**Project:** Arkidel is a compliance suite for small businesses. The first
module is the Breach Clock, a multi-jurisdiction breach notification deadline
calculator.

## The substantive-vs-engineering line

This project has two distinct layers, and they are not treated the same way:

### `src/breach-clock/data.js` — substantive legal layer (PROTECTED)

Contains the `JURISDICTIONS` array — the source of truth for all breach-
notification rules. This file changes when laws change.

**Do not modify `data.js` without:**
1. Surfacing the proposed change explicitly to the user
2. Getting confirmation before editing
3. Following the formal intake process documented in `docs/intake-forms.md`

Every change to `data.js` requires primary-source verification and an IAPP
State Breach Notification Chart cross-check. Treat it as you would a legal
document, not application code.

### `src/breach-clock/engine.js` — rules engine

Pure JavaScript, no React. Contains `computeDeadlines(facts)`, `isHighRisk`,
`runTests`, and 50 test cases. After any engine change, the test harness must
pass — check the in-app Tests view (footer link in the rendered component) or
run programmatically.

### `src/breach-clock/BreachClock.jsx` — React UI

UI/UX changes go here. Layout, copy, styling, form interactions, memo
generation, tests view rendering. Edit freely. Do not make substantive legal
changes in this file — those belong in `data.js`.

## Stack

- Vite + React (no TypeScript for now)
- `lucide-react` for icons
- Inline styles in BreachClock.jsx (Tailwind added later, additive only)
- Target deployment: Vercel at arkidel.com

## Known issues (do not fix without instruction)

- `Scale` is imported but unused in `BreachClock.jsx` — safe to leave
- No persistence (localStorage) — deliberate v1 decision
- Memo download is HTML, not docx — v2 upgrade candidate

## Session goals by phase

- **Phase 1 (complete):** Breach Clock running locally, all 50 tests passing
- **Phase 2:** Add Tailwind, React Router, marketing pages (landing, about, privacy, terms)
- **Phase 3:** Deploy to Vercel, point arkidel.com
- **Phase 4:** Analytics (Plausible or Fathom), error monitoring (Sentry)
