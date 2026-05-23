# Arkidel — running task list

The canonical to-do list for the project, as described in CLAUDE.md. Items
move between sections as priorities shift. Substance items — those that
touch `src/breach-clock/data.js` or otherwise alter what the engine
computes — are flagged `[substance]` and require the formal intake process
documented in `docs/intake-forms.md`.

This file was initialized on 2026-05-23 from the Phase 3/4/5 breakdown and
"Known issues and conventions" section of CLAUDE.md, plus the recent git
log. Earlier completed work is not enumerated here — see `git log` for the
historical record prior to this file's creation.

---

## Phase 3 — in progress

PDF memo generation, brand polish, and logo integration in the PDF and
marketing surfaces.

- PDF memo generation — core layout, embedded fonts, page breaks, header
  logo, and Disclaimer-expansion landed in prior commits. Open: confirm no
  additional layout or content polish is needed before Phase 4.
- Brand polish across product and marketing surfaces — CLAUDE.md's brand
  identity section is the source of truth. Open: audit live surfaces
  against the documented palette, typography, heading-case convention, and
  voice guidance.
- Logo integration — landed in the PDF header. Open: verify logo
  treatment on all marketing surfaces (landing, about, header, footer)
  matches the canonical SVG and color rules.

## Phase 4 — pending

Pre-launch readiness.

- Privacy policy drafted by Tom.
- Terms of service drafted by Tom.
- Vercel deployment configured.
- arkidel.com DNS pointed at Vercel.
- Email mailbox provisioning for hello@arkidel.com.
- Waitlist email collection wired to a real backend (Buttondown,
  ConvertKit, or a Vercel-hosted endpoint). Currently a placeholder submit
  handler that logs to console.
- Analytics installed (Plausible or Fathom — decision pending).

## Phase 5 — post-launch

- Soft launch.
- Collect user feedback.
- Expand Breach Clock jurisdictional coverage: Connecticut next, then
  Oregon, then additional states. `[substance]`
- Begin scoping the DPIA/PIA module.

---

## Open engineering items (from CLAUDE.md "Known issues and conventions")

- Mobile responsiveness verification for the Breach Clock UI before public
  launch. Currently desktop-first.
- Waitlist email form submit handler is a placeholder that logs to
  console; needs a real backend (tracked above under Phase 4).
- `Scale` is imported but unused in `BreachClock.jsx`. Safe to leave for
  now per CLAUDE.md; tree-shaking handles it at build time.
- No localStorage persistence for in-progress Breach Clock entries.
  Deliberate v1 decision per CLAUDE.md; revisit post-launch if user
  feedback supports it.

---

## Completed

### 2026-05-23

- engine: add dedicated VA 5,000-resident test (§ 8.10 pattern 4) —
  commit `3929b63`. `[substance]`-adjacent (engine test coverage for a
  data.js rule, not a data.js change).
- Landing: update jurisdiction count from seven to eight (Virginia) —
  commit `1d7e611`.
