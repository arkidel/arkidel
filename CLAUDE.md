# Arkidel — Claude Code project instructions

**Project:** Arkidel is a compliance suite for small businesses. The first
module is the Breach Clock, a multi-jurisdiction breach notification deadline
calculator. Future modules include a DPIA/PIA workflow.

The audience is the small or solo privacy and compliance function inside
startups and growing companies — typically a CIPP-certified privacy lead, an
in-house counsel handling privacy alongside other duties, or an outside
attorney serving multiple SMB clients. The product is designed for
professionals who already know what they're doing and need reliable tools that
respect their expertise.

---

## The substantive-vs-engineering line

This project has two distinct layers, and they are not treated the same way.

### `src/breach-clock/data.js` — substantive legal layer (PROTECTED)

Contains the `JURISDICTIONS` array — the source of truth for all breach-
notification rules. This file changes when laws change.

**Do not modify `data.js` without:**

1. Surfacing the proposed change explicitly to the user.
2. Getting confirmation before editing.
3. Following the formal intake process documented in `docs/intake-forms.md`.

Every change to `data.js` requires primary-source verification and, for U.S.
states, an IAPP State Breach Notification Chart cross-check. Treat it as you
would a legal document, not application code. Commits to `data.js` should
have descriptive messages that reference the specific rule changed and the
primary source (e.g., "Update CA AG threshold to >500 per § 1798.82(f)
post-SB-446 verification") rather than generic messages.

### `src/breach-clock/engine.js` — rules engine

Pure JavaScript, no React. Contains `computeDeadlines(facts)`, `isHighRisk`,
`runTests`, and 51 test cases as of the latest coverage addition. After
any engine change, the test harness must pass — check the in-app Tests view
(footer link in the rendered component) or run programmatically.

The engine is the correctness instrument for the substantive layer. If a
test fails after a `data.js` edit, the substantive change is wrong, not the
test.

### `src/breach-clock/BreachClock.jsx` — React UI

UI/UX changes go here. Layout, copy, styling, form interactions, the in-app
counsel-notes rendering, the tests view, the result page. Edit freely.

Do not make substantive legal changes in this file — those belong in
`data.js`. If a UI change would alter what the engine computes or what the
counsel notes say substantively, stop and surface the change rather than
making it.

### `src/breach-clock/memo-pdf.js` — PDF memo generation

Generates the downloadable memo as a PDF using pdf-lib. The PDF layout,
typography, and structure live here. Substantive content (the deadline
cards, counsel notes, suppressed obligations) is derived from the engine
output and `data.js` — do not hardcode content here that should come from
those sources.

### `docs/intake-forms.md` — audit trail

The formal intake forms for every jurisdiction modeled in `data.js`. Each
form documents the rules as encoded, the sources relied on, the IAPP chart
consistency status (for U.S. states), and the sign-off. When a substantive
change to `data.js` lands, the corresponding intake form's Sign-off section
must be updated to reflect the change. The master intake-forms file lives in
the originating Claude conversation and is backfilled into the repo as needed.

### `docs/todo.md` — running task list

The canonical to-do list for the project. Items move between sections as
priorities shift. Substance items are flagged with `[substance]` and require
the formal intake process. When starting a new Claude Code session, check
this file for context on what's pending. The file was initialized on
2026-05-23; session history prior to that date lives in the git log.

---

## Brand identity

Arkidel's brand is the project's most visible long-term asset. Treat it as
seriously as the substantive layer — it's how the product communicates
quality before any user runs the tool.

### Naming and meaning

The name evokes "ark" (a vessel that keeps your data safe) with the cadence
of an Elven name from Tolkien's legendarium. The product is "considered,
quiet, plain" — compliance is serious work, and the brand carries weight
without raising its voice.

### Logo

The logo is a custom rune-glyph icon paired with a serif wordmark.

The rune is built from a vertical stem with rounded terminals, two short
diagonal strokes branching off the right side (one rising, one falling,
mirrored around the stem's vertical midpoint), and a small triangle pointing
left, centered on the stem's midpoint — which reads simultaneously as a
runic mark, a sideways "A" for Arkidel, and a vault/key element. The whole
glyph sits inside a softened square box (8px corner radius, same stroke
weight as the interior strokes), making the "ark" metaphor literal: contents
kept inside a vault.

The canonical SVG (uses `currentColor` for inheritance):

```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Arkidel">
  <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>
  <line x1="50" y1="22" x2="50" y2="78" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="38" x2="72" y2="28" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <line x1="50" y1="62" x2="72" y2="72" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <path d="M 38 42 L 24 50 L 38 58 Z" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
```

The wordmark is "Arkidel" in Merriweather Regular, with letter-spacing
around 1.2. The wordmark is sentence case: "Arkidel" — never "ARKIDEL"
or "arkidel".

The logo and wordmark generally appear together. On marketing surfaces and
PDF letterheads, the rune sits to the left of the wordmark, vertically
centered. The logo color follows the surface: Midnight on light backgrounds
(Bone, Parchment), Parchment on dark backgrounds (Midnight).

### Color palette

| Token | Hex | Use |
|---|---|---|
| Midnight | `#1B2A3F` | Primary brand color (deep navy, slightly warm). Marketing surfaces; primary headings; logo on light surfaces. |
| Bone | `#FAF8F2` | Primary app canvas. Background for product UI. |
| Parchment | `#E8DDC4` | Warm counterweight. Logo color on dark surfaces. Counsel-notes card borders in the PDF. |
| Ink | `#2C2418` | Body text on light surfaces. Slightly warmer than pure black. |
| Mist | `#9FAEC2` | Secondary text on dark surfaces. Labels, captions, rules in the PDF. |
| Ember | `#C76E3A` | Attention/warning state. No red by design — red is overused in compliance UX. Use sparingly. |
| Moss | `#5A6E4A` | Safe/verified state. Suppressed-obligation card borders in the PDF. |

Marketing surfaces are Midnight-dominant. Product UI keeps a Bone canvas
with Midnight used sparingly for chrome and accents.

### Typography

The rule: display and headings use Merriweather serif; body text and all
form and input text use Inter sans. Applied consistently across the
on-screen UI and the embedded PDF memo — the two surfaces agree on which
face is doing which job. The serif/sans line is what reads as "considered,
quiet, plain" to the reader; mixing it up undermines the brand.

Display and headlines use Merriweather, a serif by Eben Sorkin
(SorkinType) released under the SIL Open Font License. The same family is
used on screen and in the embedded PDF memo so the two surfaces agree
visually. Merriweather was chosen for open-source licensing (no friction
for PDF embedding) and because its static TTFs embed cleanly through
pdf-lib's subsetter, which the project has been burned by in the past.
24px and up on screen.

Body and UI use a sans-serif: Inter (current, open-source) as the practical
choice. Söhne is the production target if/when a license is added. 16px
body, 12–14px UI labels, 1.6 line height on screen. In the embedded PDF
memo, body type renders at 10.5pt — a single `BODY_TEXT_SIZE` constant in
`src/breach-clock/memo-pdf.js` is the one point of adjustment if it needs
to be re-tuned. The PDF body face is also Inter, matching the screen.

Form and input text follows the body rule: Inter sans, not serif. The
Breach Clock step inputs, the Landing waitlist input, and any future form
fields should share the same Inter stack as the buttons.

Monospace uses JetBrains Mono for IDs, hashes, citations, audit entries.

Spaced caps for section labels (e.g., `BASIS`, `CONDITIONAL`, `SOURCE`,
`CONTROLS · EVIDENCE · OPEN ITEMS`).

### Heading case convention

Three conventions, used for different functions:

- **Title case** for descriptive structural headings: document titles,
  section headings within the PDF memo, and structural headings within
  the product UI that label a section of content rather than address the
  user (e.g. the Breach Clock Tests view H1, "Rules Engine Tests"). Use
  AP-style title case (capitalize nouns, verbs, adjectives, adverbs,
  pronouns; do not capitalize articles, short prepositions of four letters
  or fewer, or coordinating conjunctions; always capitalize the first and
  last word of the heading).
- **Declarative-sentence style** for section headings on site-facing
  marketing and informational pages — Landing, About, and the
  Privacy/Terms pages (including the current placeholders). Sentence
  case, with a terminal period permitted ("Why we started this.",
  "Arkidel is a tool, not a compliance program."). This is a deliberate
  matter of brand voice: section headings on these pages read as plain
  declarative statements consistent with the "considered, quiet, plain"
  voice described below, rather than as labels imposed on top of the
  content. The voice established on Landing and About is the reference
  for new site-facing pages. This convention does not extend into the
  product UI or the PDF memo, both of which keep title case for their
  structural headings per the rule above.
- **Sentence case** for interactive prompts: the question headings that
  appear in the multi-step Breach Clock flow ("When did you become aware of
  the breach?", "Which jurisdictions' residents are affected?", "What kind
  of data was involved?"). These are addressed to the user and read more
  naturally in sentence case.

Card-internal spaced-caps labels (`BASIS`, `CONDITIONAL`, `SOURCE`, etc.)
are unaffected — they remain in their existing all-caps treatment.

### Voice

Considered, quiet, plain. Plain declarative sentences. Compliance is serious
work, so the writing carries weight without raising its voice.

Avoid: "revolutionize," "AI-powered," "next-gen," "best-in-class,"
"compliance, simplified," "stop worrying about compliance," "your trusted
partner," "we make it easy," exclamation marks, customer-logo grids before
real customers exist, green-checkmark feature lists.

Embrace: precise statements about what the product does and doesn't do;
specific framing of the audience and their moment ("the privacy professional
who finds out about a possible incident at 4:45 on a Friday"); visible
methodology (test harness, audit trail, primary-source citations);
acknowledgment that software cannot replace professional judgment.

Tone target: "Your data, kept." not "Revolutionize your compliance!"

The Breach Clock is a tool, not a compliance program. Marketing copy and
in-app text should reinforce this distinction, not obscure it.

---

## Stack

- Vite + React (no TypeScript for now)
- `lucide-react` for icons in the React UI
- `pdf-lib` and `@pdf-lib/fontkit` for PDF generation
- Tailwind CSS v4 for styling on marketing pages (added in Phase 2; the
  Breach Clock component still uses inline styles, additively compatible)
- React Router for the multi-page site
- Target deployment: Vercel at arkidel.com
- Email mailbox for contact: hello@arkidel.com (provisioning pending)

### Font handling

PDF embedded fonts are bundled directly as TTF files in `src/assets/fonts/`,
not via `@fontsource` packages. The WOFF format that `@fontsource` provides
caused character-encoding issues in pdf-lib's embedding pipeline (mangled
colons, slashes, hyphens, and `fi`/`ff` ligatures). Direct TTF bundling
avoids the problem. If new fonts are added, follow the same pattern.

For the on-screen UI, web fonts are loaded via the standard browser font
mechanism. Inter and JetBrains Mono are loaded via `@fontsource` (which is
fine for browser rendering; the encoding issue was specific to pdf-lib).
Merriweather is loaded for the browser via `@fontsource/merriweather`
(Regular/400 only — no other weights or italics are used on screen). For
the PDF, the same family is bundled as direct TTFs
(`Merriweather-Regular.ttf`, `Merriweather-Bold.ttf`) in
`src/assets/fonts/`, following the rule above. Two delivery paths for one
typeface is intentional.

---

## Session goals by phase

- **Phase 1 (complete):** Breach Clock running locally in a Vite project,
  all engine tests passing.
- **Phase 2 (complete):** Tailwind, React Router, marketing pages
  (landing, about, with placeholders for privacy and terms).
- **Phase 3 (complete (build)):** PDF memo generation; brand polish; logo
  integration in the PDF and marketing surfaces. The build of these
  surfaces is complete; visual verification of the PDF output, brand
  application, and logo treatment is carried into Phase 4 as a pre-launch
  check.
- **Phase 4 (pending):** Draft privacy policy; draft terms of service;
  Vercel deployment; arkidel.com DNS; email mailbox provisioning; waitlist
  email collection wired to a real backend; analytics (Plausible or Fathom).
- **Phase 5 (post-launch):** Soft launch; user feedback; expand Breach Clock
  jurisdictional coverage (Connecticut next, then Oregon, then more states);
  begin scoping the DPIA/PIA module.

---

## Known issues and conventions

- `Scale` is imported but unused in `BreachClock.jsx` — safe to leave for
  now; tree-shaking handles it at build time.
- No persistence (localStorage) for in-progress Breach Clock entries —
  deliberate v1 decision. Refresh wipes user input.
- The Breach Clock UI is desktop-first; mobile responsiveness needs
  verification before public launch.
- The waitlist email form uses a placeholder submit handler that logs to
  console. A real backend (Buttondown, ConvertKit, or a Vercel-hosted
  endpoint) is pending.

---

## Operating principles for Claude Code sessions

**Engineering execution, not legal substance.** The substantive legal
content and rules engine are governed by a separate review process between
the user and the originating Claude conversation. Engineering work — UI,
styling, routing, build configuration, deployment, PDF layout, marketing
copy — proceeds normally. If a session task seems to cross into substantive
legal territory, surface the concern rather than acting on it.

**Ask before destructive operations.** File deletions, force pushes, schema
changes to data files, anything irreversible — confirm before doing.

**Explain commands as you run them.** The user is not a full-time developer
and prefers to understand what's happening rather than have things just work
magically.

**One milestone per session.** Resist scope creep. If a session is set up to
do A, do A well rather than also doing B, C, and D. The discipline of
narrow sessions makes the overall arc of the project manageable.

**Commit messages should reflect substantive milestones.** For substance
commits, reference the specific rule, statute, or source. For engineering
commits, describe what changed and why. Generic messages ("Update files")
break the audit trail.

**Surface inconsistencies and ambiguities.** If something seems off — math
that doesn't reconcile, copy that contradicts a previous decision, a
brand-identity treatment that conflicts with this file — flag it rather than
silently choose. The user can adjudicate.
