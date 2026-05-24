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

## Phase 3 — complete (build)

Build of PDF memo generation, brand identity, and logo integration in the
PDF is complete as of 2026-05-23. Visual verification of these surfaces is
carried into Phase 4 as a pre-launch check. See the Completed section for
the underlying commits.

## Phase 4 — pending

Pre-launch readiness.

- Draft privacy policy.
- Draft terms of service.
- Vercel deployment configured.
- arkidel.com DNS pointed at Vercel.
- Email mailbox provisioning for hello@arkidel.com.
- Waitlist email collection wired to a real backend (Buttondown,
  ConvertKit, or a Vercel-hosted endpoint). Currently a placeholder submit
  handler that logs to console.
- Analytics installed (Plausible or Fathom — decision pending).
- Pre-launch visual audit: PDF memo output, brand surfaces (palette,
  typography, heading-case convention, voice), and logo treatment on all
  marketing surfaces (landing, about, header, footer), checked against the
  brand identity section of CLAUDE.md as source of truth. Audit was run
  2026-05-23 (read-only, code-level); resulting findings are recorded in
  the five subsections below. None of the audit findings touch `data.js`
  or `engine.js`, so none are flagged `[substance]`.

### Phase 4 audit — clear inconsistencies (mechanical fixes)

All four findings from this section were cleared on 2026-05-23. See the
Completed section below.

### Phase 4 audit — owner-review items (need a decision)

Findings that require an owner judgment before any code change.

- Off-palette tints and undocumented hover colors in
  `src/breach-clock/BreachClock.jsx`: urgent-card cream `#FBF5EE` (lines
  265, 354), primary-button hover `#2C3E55` (line 306), pure `#fff` card
  backgrounds on a Bone canvas (lines 230, 588, 815), an input-field
  serif stack that omits Tiempos/GT Sectra (line 323), and the header
  wordmark's missing letter-spacing in `src/components/Layout.jsx` (line
  22). Audit findings B7–B11.
- Cross-surface divergences: PDF cards use a 3pt left border with no fill
  while on-screen cards use white fill; marketing H1 is `text-4xl` (~36px)
  while the Breach Clock H1 is `clamp(40px, 6vw, 64px)`; the Breach Clock
  page stacks the global Layout header above its own page-internal
  "Breach Clock" header with a "Preliminary — Not Legal Advice" badge.
  Audit findings X5–X7.
- User-facing version stamp "v0.1" in the Breach Clock footer
  (`src/breach-clock/BreachClock.jsx` line 908) — minor tonal mismatch
  with the brand voice. Audit finding H6.

### Phase 4 audit — launch-infrastructure gaps

- No favicon. `index.html` has no `<link rel="icon">`; browser tabs render
  the default globe.
- Static `<title>` tag — `index.html` line 6 hardcodes "Arkidel — Breach
  Clock" for every route, including About, Privacy, and Terms. Needs
  per-route title management. Audit finding X4.
- No meta description or Open Graph / Twitter card tags in `index.html`.

### Phase 4 audit — typeface standardization (complete)

Audit findings B1–B4 (PDF wordmark rendered in Inter SemiBold rather than
serif; PDF serif is Crimson Text; stale "Source Serif Pro" comments in
`src/breach-clock/memo-pdf.js`; dead `@fontsource/source-serif-pro`
dependency in `package.json`) are resolved. The site and the PDF now both
use Merriweather (browser via `@fontsource/merriweather/400.css`; PDF via
bundled `Merriweather-Regular.ttf` + `Merriweather-Bold.ttf`). CLAUDE.md's
brand-identity section was updated in the same session — Georgia, GT
Sectra, Tiempos Headline, and Crimson Text references were removed and
Merriweather is now named as the production serif with rationale.

A gate failure surfaced during this work and is tracked as its own Phase 4
item below (URL-corruption bug isolated to JetBrains Mono).

### Phase 4 audit — manual verification checklist

These checks require rendered output and must be performed by the owner;
they cannot be confirmed from code alone. Run after the mechanical fixes
above land. Distinct from the engineering task list — this is owner-
performed verification.

PDF (generate via Breach Clock → Download memo with a realistic incident
such as awareness yesterday, CA + EU selected, financial + identifiers,
no encryption):

1. Letterhead — 24pt logo crisp at PDF zoom 100% and 200%; wordmark
   vertically centered to the icon.
2. Body typography — confirm the rendered serif matches the typeface
   chosen in the in-progress typeface-standardization session.
3. Page numbering — "Page X of N" appears bottom-center on every page
   including page 1.
4. Running header — pages 2+ show "Breach Notification Deadline Analysis"
   top-right above a thin rule.
5. Card page breaks — force a long incident (many jurisdictions, many
   counsel notes); confirm no card splits across a page boundary.
6. Source-URL link annotations — click a "Source" URL in a deadline card
   and a citation URL in a jurisdictional note; both open the primary
   source.
7. Suppression visuals — run with encryption applied; confirm the
   Moss-bordered "Notification Suppressed by Encryption" cards and the
   "no obligations fire" state when everything is suppressed.
8. Footer block — disclaimer and generated lines render in MIST gray and
   are readable.

Marketing site (`npm run dev`):

9. Logo color on dark chrome — confirm header and footer logo render as
   Parchment after the L1 fix lands.
10. Nav-link hover state — transitions to Parchment as intended.
11. Heading style — read Landing/About section headings on the rendered
    pages; confirm the declarative-sentence style reads well in context.
    The rule was settled by the CLAUDE.md amendment on 2026-05-24
    (declarative-sentence style for site-facing pages, per the
    "Heading case convention" section); this is a pre-launch
    read-through, not a decision point.
12. Mobile responsiveness — resize to ≤480px and ≤768px; confirm header
    chrome doesn't crowd, hero copy wraps cleanly, jurisdiction checkbox
    grid collapses, the multi-step Breach Clock form is usable, and
    results-page deadline cards remain legible. Open engineering item
    carried over from prior phases.
13. Browser tab title — click through Landing → About → Privacy → Terms
    → Breach Clock; confirm per-route titles work after the X4 fix lands.
14. Favicon — visible in the browser tab after the favicon ships.
15. Tests view — click the Tests link in the Breach Clock footer; confirm
    51 cases pass (matches `engine.js` `TEST_CASES` count).
16. Off-palette tints — force urgent and missed deadlines (set awareness
    ≈23.5 hours ago and ≈4 days ago against a 72-hour rule); decide
    whether `#FBF5EE` reads as on-brand or needs revisiting (ties to B7).
17. Print path — attempt browser Print → Save as PDF on the results page;
    decide whether the in-browser print is a supported artifact or
    whether the downloadable memo PDF is the only printable.

Cross-surface re-read:

18. Read `src/pages/About.jsx` top-to-bottom after the stale-counts fix
    lands; confirm "eight jurisdictions" and "fifty-one cases" before
    they reach a launch audience.

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

### 2026-05-24

- audit H3/H4: marketing heading style. Resolution was to amend the
  CLAUDE.md heading-case rule, not to restyle the pages. The
  declarative-sentence headings on `Landing.jsx` and `About.jsx`
  ("Why we started this.", "Arkidel is a tool, not a compliance
  program.") are a deliberate expression of the documented "considered,
  quiet, plain" brand voice. The rule in CLAUDE.md's "Heading case
  convention" section was split into three conventions: title case
  retained for PDF memo and product-UI structural headings (including
  the Tests view H1 cleared as H1 on 2026-05-23); declarative-sentence
  style established for section headings on site-facing marketing and
  informational pages (Landing, About, Privacy, Terms, including the
  current placeholders); sentence case retained for interactive prompts
  in the Breach Clock flow. No code changes.

### 2026-05-23

- audit cleanup: clear the four "mechanical fixes" findings from the
  Phase 4 visual audit in a single commit.
  - B5/X3 — `src/pages/About.jsx`: "seven jurisdictions" → "eight";
    "fifty cases" → "fifty-one". Verified against `data.js`
    (JURISDICTIONS length = 8) and `engine.js` (TEST_CASES length = 51,
    51/51 pass).
  - L1 — `src/components/Layout.jsx`: header logo Link recolored from
    `text-bone` to `text-parchment` so the rune (via `currentColor`) and
    wordmark both render Parchment on Midnight; footer wordmark `<span>`
    given an explicit `text-parchment` so the wordmark recolors while
    the footer nav links keep their existing `text-bone hover:text-parchment`
    treatment. Token `--color-parchment: #E8DDC4` defined in
    `src/index.css`.
  - H1 — `src/breach-clock/BreachClock.jsx`: Tests view H1
    "Rules engine tests" → "Rules Engine Tests" (descriptive structural
    heading → title case).
  - H2 — `src/breach-clock/BreachClock.jsx`: "organisation" (Q01 prompt)
    → "organization"; "modelled" (further-considerations bullet) →
    "modeled". Both are UI chrome, not statutory text or paraphrase
    quoting EU/UK GDPR; no other British spellings present in the file.
    No `data.js` change.
  Engine tests: 51/51 pass.
- engine: add dedicated VA 5,000-resident test (§ 8.10 pattern 4) —
  commit `3929b63` (engine test coverage for a data.js rule, not a
  data.js change).
- Landing: update jurisdiction count from seven to eight (Virginia) —
  commit `1d7e611`.
- brand: standardize on Merriweather across site and PDF; retire Crimson
  Text and `@fontsource/source-serif-pro`; switch PDF wordmark to serif;
  update CLAUDE.md typography (resolves audit findings B1–B4). Gate
  finding for JetBrains Mono URL corruption is tracked above as its own
  Phase 4 item.
- pdf: resolve JetBrains Mono character-corruption defect by swapping
  the bundled mono font to the No-Ligatures variant
  (`JetBrainsMonoNL-Regular.ttf`) from the same JetBrains/JetBrainsMono
  v2.304 release. Root cause was pdf-lib's fontkit subsetter applying
  GSUB ligature substitutions to plain text, mangling adjacencies like
  `://` and `1:0` — visible in source URLs and the Virginia medical-
  information citation `§ 32.1-127.1:05`. Verified end-to-end on the
  browser "Download memo" path. Same commit split `memo-pdf.js` into a
  slim Vite shim plus `memo-pdf-core.js` so the render path is Node-
  importable for the regression harness; public API unchanged.
  Regression guard: `scripts/mono-gate.mjs`.
- pdf: fix card-heading truncation in `drawCard`'s `topRow` branch. The
  authority text was drawn as a single `drawTextLine` with no wrap or
  measure step, so any heading wider than the available column was
  clipped at the right edge — visible on the Massachusetts OCABR
  suppressed card as "...Business Regulation (OCA". Fix is a general
  heading-wrap solution covering both deadline and suppressed cards
  (both share the `topRow` block type): added `wrapTextTwoCol` so the
  first line reserves space for the right-aligned deadline timestamp
  while subsequent lines use the full card-inner width; `measureBlock`
  now returns wrapped-line height so `ensureRoom` and the card
  background rectangle account for the extra line and cards still
  cannot split across a page boundary. Jurisdictional-note cards use a
  separate `noteHeader` block that already wrapped correctly and is
  unchanged. Gated end-to-end against `/tmp/gate-truncation-suppressed.pdf`
  and `/tmp/gate-truncation-deadline.pdf`; engine tests 51/51 pass.
  Standing regression harness: `scripts/render-truncation-gate.mjs`.

### Phase 3 build — 2026-05-23

The Phase 3 build is complete. Visual verification of these surfaces is
deferred to the Phase 4 pre-launch visual audit; do not treat these items
as verified.

- PDF memo generation — core layout, embedded fonts, page breaks, header
  logo, and Disclaimer-expansion. Built across commits `285d88a`,
  `09048e7`, `c7281cc`, `64c95de`, `8221baf`, and `ecc575f`.
- Brand identity codified in CLAUDE.md — commit `4e35c9f`.
- Logo integration in the PDF header — commit `8221baf`.
