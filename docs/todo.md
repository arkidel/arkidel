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
- Breach Clock page density pass — the page top and wizard still read as
  marketing-promo styling (large type, generous whitespace) rather than the
  denser information layout of a finished application. Revisit type scale
  and object density across the Breach Clock page to give it working-app
  density. Design pass requiring a defined visual target before
  implementation, not a mechanical fix — needs owner scoping before it
  becomes a session. Surfaced 2026-05-26 while resolving X7.
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

All three findings from this section (X5–X7) were cleared on 2026-05-26.
See the Completed section below. The Phase 4 visual audit is now fully
resolved.

### Phase 4 audit — launch-infrastructure gaps

The three original gaps — no favicon, static `<title>` for every route
(finding X4), and no meta/Open Graph tags — were all cleared on 2026-05-30
(see Completed). Remaining follow-ups:

- Per-page meta descriptions — once the copy-review pass is complete, write
  per-route meta descriptions (~150 chars each) for Landing, Breach Clock,
  About, Privacy, Terms; replace the site-level default ("Practical tools
  for privacy professionals who want to show their work.") now in
  `index.html`.
- Open Graph image — once the landing-page hero is built (per the "rune at
  scale" direction in the recorded design decisions below), export a static
  1200×630 version of that composition as the OG image, wire it into
  `index.html` as `og:image`, and serve it from `public/` alongside the
  favicon.
- Simplified small-size favicon glyph (queued — after launch-readiness
  work, not blocking) — at 16×16 the canonical rune's interior detail
  (triangle + diagonals) doesn't survive pixel quantization, regardless of
  viewBox tightness. The proper fix is a designed-for-small variant that
  keeps the box and the central stem but drops or simplifies the interior
  elements, served at 16×16 via the favicon `sizes` attribute or media
  queries while the canonical glyph continues to serve at 32×32 and above.
  This is a small design exercise scoped on its own, not a mechanical fix.

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

### Phase 4 — recorded design decisions

Settled directions captured so future sessions don't re-open them.
Neither item is `[substance]`.

- Landing-page hero direction — decided. The hero will use a "rune at
  scale" backdrop: the Arkidel rune-glyph enlarged and bled off one edge
  of a Midnight-dominant hero panel, rendered low-contrast in Parchment,
  with the hero text sitting in the open area. This is the chosen
  direction, not a built asset. The production hero is not to be built
  until the landing-page marketing copy (tagline and subhead) is
  finalized — the composition depends on the final copy length. When
  built, treat it as a responsive, full-bleed front-end task: SVG (not
  raster), degrading gracefully on mobile.
- Geometric-motif brand texture — scope decided. A secondary motif built
  from the rune's vocabulary (stem, mirrored diagonals, triangle, rounded
  box), used at faint contrast and large scale, is approved as a brand
  texture for marketing and document surfaces only. Candidate uses: the
  About page, secondary landing-page sections, and a very restrained
  treatment on the PDF memo letterhead. Explicitly NOT to be used as a
  background on the Breach Clock tool/app pages. Reason: those pages
  already have a queued density-pass item above because they read as
  marketing-promo rather than finished-application; decorative
  backgrounds would work against that goal. Tool pages stay on a plain
  Bone working canvas by design. If a future session is tempted to add
  the motif to the Breach Clock UI, the answer is no — it was considered
  and excluded here.

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

## Risk-assessment follow-ups (queued 2026-06-08)

Surfaced after the EU/UK risk-assessment feature shipped (`be2f252` engine/data,
`cdcd93d` UI). None block launch.

- Special-category data taxonomy reconciliation. Reconcile the Q1 `sensitivity`
  taxonomy with the Section-5 data-element repeater: resolve the overlap where
  health / biometric / genetic data sit beside a separate "Special category"
  option, account for `children` (which is not an Art. 9 special category), and
  review the category descriptions for accuracy. This changes the categories the
  engine and UI reason about, so it is a design exercise **plus** formal sign-off
  through the intake process before any `data.js` touch. `[substance]`
- Review-page artifact controls in a rail. Move **Download memo** / **Edit
  answers** off the top of the review content into a right rail on the review
  page. There is no rail on the review today — the entry-form rail renders only
  pre-submit — so this likely means a new right column; decide whether it is
  pinned/sticky or flows with the page.
- "SUGGESTED" tag treatment. Revisit the non-selecting hint on the risk
  section's "high" option — placement, wording, visual weight, and colour (today
  a parchment mono chip). Purely presentational; the hint logic
  (`isHighRisk(sensitivity)`) is settled.

---

## Completed

### 2026-06-07

- breach-clock form controls: close the two to-dos queued in `4cb226e`.
  - "Mode" control wording — resolved by the Respond rename. The rail's "Mode"
    label became "Breach Clock", and the quick-mode toggle became a checkbox in
    the standard check-row idiom labelled "Notification requirements and
    deadlines only", with helper text "Check this box if you don't need a full
    incident report." Behavior unchanged (checked = deadlines-only output;
    unchecked, the default, = full incident report). The leftover deadlines-only
    review badge was relabelled "Quick mode" → "Breach Clock" so the control and
    the review agree (`fa6da51`, `404ec4b`).
  - "Start over" button — removed from the form's first screen along with its
    sole `reset()` handler; the remaining Submit button is now right-aligned. It
    was a pure form reset, wired nowhere else (`fa6da51`).
  Verified in the dev preview: new control renders (label + checkbox + helper),
  default unchecked, no "Start over" in the DOM, the deadlines-only path works
  end to end, no console errors. No `data.js` / `engine.js` / `intake-forms.md`
  change. Files: `src/breach-clock/BreachClock.jsx`.

### 2026-05-30

- web: favicon, per-route page titles (finding X4), and base meta/Open
  Graph tags — clears all three Phase 4 launch-infrastructure gaps.
  - Favicon generated from the Arkidel rune (not redrawn): colour-adaptive
    SVG (Midnight on light, Parchment on dark via `prefers-color-scheme`)
    with ICO and 180×180 apple-touch-icon fallbacks (Midnight on
    transparent). viewBox tightened to "5 5 90 90" for 16×16 legibility;
    files in `public/`, regenerated via `scripts/gen-favicons.mjs`. A
    designed-for-small 16px variant is queued as a non-blocking follow-up
    above.
  - Per-route titles via a hand-rolled `src/usePageTitle.js` hook (no new
    dependency) wired into Landing ("Arkidel"), Breach Clock, About,
    Privacy, and Terms (each "… — Arkidel"). `index.html` keeps a static
    `<title>Arkidel</title>` as the pre-hydration fallback.
  - Site-level meta description plus Open Graph / Twitter Card tags added
    to `index.html`; no `og:image` yet (deferred to the follow-up above,
    pending the landing hero).
  Verified: per-route titles render correctly (iframe loads), favicon
  assets resolve, engine tests 51/51 pass. No `data.js` / `engine.js` /
  `intake-forms.md` change. Files: `index.html`, `public/favicon.svg`,
  `public/favicon.ico`, `public/apple-touch-icon.png`,
  `scripts/gen-favicons.mjs`, `src/usePageTitle.js`, `src/pages/Landing.jsx`,
  `src/pages/About.jsx`, `src/pages/Privacy.jsx`, `src/pages/Terms.jsx`,
  `src/breach-clock/BreachClock.jsx`, `docs/todo.md`.

### 2026-05-26

- audit cleanup: clear X5, X6, and X7 from the Phase 4 owner-review list
  in a single consolidation commit. With these three resolved, the Phase 4
  visual audit is now fully resolved.
  - X6 — H1 sizing unified at 36px across all surfaces. Marketing pages
    (`src/pages/About.jsx` updated from `text-3xl` to `text-4xl`; Landing,
    Privacy, Terms already at `text-4xl`) and `src/breach-clock/BreachClock.jsx`
    main + Tests view (both changed from `clamp(40px, 6vw, 64px)` to a
    fixed 36px) now share one H1 scale. Owner approved 36px as the
    unified value before application.
  - X7 — Breach Clock page-top compressed. The oversized "Breach Clock"
    H1 (was up to 64px) was reduced to the unified 36px, descriptive
    paragraph trimmed from 17px to 15px, header bottom border and
    margin tightened so the wizard begins inside the first viewport.
    The floating top-right "Preliminary — Not Legal Advice" badge was
    removed and replaced with a slim full-width notice line directly
    above the step indicator — hairline top/bottom borders, Inter 14px,
    full Midnight color (no opacity reduction). Notice copy is verbatim:
    "For preliminary triage purposes only. Breach Clock does not provide
    legal advice. Results must be confirmed by qualified counsel."
  - X5 — Card styling reconciled on Option A (bring on-screen toward
    the PDF). PDF unchanged (left-border-only treatment kept as the
    standard). On-screen in `src/breach-clock/BreachClock.jsx`: the
    standard `.deadline-card` lost its 1px all-around hairline outer
    border and gained a 4px Midnight left border; the suppressed card
    inline style dropped its outer border (keeping the 4px Moss left);
    the jurisdictional-notes `<aside>` flipped from Parchment fill +
    outer border to white fill + 4px Parchment left. Urgent (Ember
    left + cream fill) and missed (Ember left + Midnight fill) state
    variants kept as state cues over the category indicator. The
    Step-0 "Counsel's note" Parchment-filled aside is a sidebar
    callout, not a card-in-a-list, and was left alone.
  Engine tests: 51/51 pass. Files touched: `src/breach-clock/BreachClock.jsx`,
  `src/pages/About.jsx`, `docs/todo.md`. `src/breach-clock/memo-pdf-core.js`
  unchanged per Option A.

### 2026-05-24

- audit cleanup: clear B7–B11 and H6 from the Phase 4 owner-review list in
  a single consolidation commit.
  - B7–B9 — off-palette tints in `src/breach-clock/BreachClock.jsx`
    (`#FBF5EE`, `#2C3E55`, `#FFFFFF`) documented in CLAUDE.md's color
    palette as intentional, named values with a note on each one's
    purpose, so a future audit recognizes them rather than re-flagging.
    No code change in `BreachClock.jsx`.
  - B10 — input-field serif stack. Already resolved by the earlier
    typography-harmonization work that changed `.input-field` to Inter
    sans; no code change in this session.
  - B11 — wordmark letter-spacing. CLAUDE.md's documented value (~1.2px)
    applied to the Arkidel wordmark in both header and footer of
    `src/components/Layout.jsx`. CLAUDE.md unchanged.
  - H6 — user-facing version stamp. " · v0.1" removed from the Breach
    Clock footer in `src/breach-clock/BreachClock.jsx`; rest of the
    footer intact.
  Engine tests: 51/51 pass.
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
