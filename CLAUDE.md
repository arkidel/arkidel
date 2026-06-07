# Arkidel — Claude Code project instructions

**Project:** Arkidel is a compliance suite for small businesses. The first
module is **Respond**, an incident-response workspace whose core is a
multi-jurisdiction breach-notification deadline calculator. Future modules
include a DPIA/PIA workflow.

**Respond / Breach Clock naming.** "Respond" is the user-facing name of the
module — one of the planned single-word module names (Assess, Map, Share,
Respond). "Breach Clock" is **not** retired: it survives as the name of the
deadlines-only **mode** within Respond (the original deadline calculator). The
mode is invoked by the form's first-screen checkbox ("Notification requirements
and deadlines only"): checked = deadlines-only output, unchecked (the default) =
full incident report; the control label and the review badge both render
"BREACH CLOCK". Because of this, the internal `breach-clock` routes, file names
(`BreachClock.jsx`), and CSS classes now **match a live concept** — do not
rename them to "respond"; there is no naming lag to clean up. In substantive
jurisdictional-note copy (`data.js`, `intake-forms.md`) the product is referred
to as "Respond" (the product, not the engine or the mode); the PDF disclaimer
uses "Arkidel Respond" as a standalone document name.

The audience is the small or solo privacy and compliance function inside
startups and growing companies — typically a CIPP-certified privacy lead, an
in-house counsel handling privacy alongside other duties, or an outside
attorney serving multiple SMB clients. The product is designed for
professionals who already know what they're doing and need reliable tools that
respect their expertise.

---

## The substantive-vs-engineering line

This project has two distinct layers, and they are not treated the same way.

**Protected files — explicit sign-off required.** Three files may not be edited
without surfacing the change and getting explicit confirmation first:
`src/breach-clock/data.js`, `src/breach-clock/engine.js`, and
`docs/intake-forms.md`. Every other file in the repo is ordinary engineering —
edit it as normal. The per-file notes below give the specific process for each.

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

Encryption is a *global* incident fact, not a per-jurisdiction one. When
encryption is reported, the engine evaluates suppression across every
selected jurisdiction at once, so on a single results page you get either
firing deadline cards or encryption-suppressed cards — never both together.
(With encryption applied, all modeled jurisdictions' obligations are
suppressed; without it, none are.) This is a structural property worth
knowing when working on the results-page layout: do not design for a mixed
state that the engine cannot produce.

### `src/breach-clock/BreachClock.jsx` — React UI

UI/UX changes go here. Layout, copy, styling, form interactions, the in-app
counsel-notes rendering, the tests view, the result page. Edit freely.

Do not make substantive legal changes in this file — those belong in
`data.js`. If a UI change would alter what the engine computes or what the
counsel notes say substantively, stop and surface the change rather than
making it.

**Unified incident form (replaced the step wizard).** The Breach Clock is one
form, not a multi-step wizard. The five engine inputs are ordinary fields
interspersed with incident-record fields across six sections: (1) general
information, (2) how & when discovered, (3) when the incident occurred,
(4) incident summary, (5) data affected, (6) measures.

- **Operative vs. record is internal, not user-facing.** Five fields feed the
  engine — awareness → `awarenessDate`; jurisdictions → `jurisdictions`;
  per-jurisdiction counts → `residentCounts`; Q1 personal-data types →
  `sensitivity`; encryption → `encryptionApplied`. They're grouped under
  `OPERATIVE_KEYS` so quick mode and the cross-check can target them, but they
  carry **no** "required/operative" badge in the default full view (the lone
  visible "Required" badge is on the record-only incident title, used for the
  filename). The form prompts for what's missing rather than badging fields.
  Everything else is a record field, captured for the report and never seen by
  the engine. The engine wiring is unchanged: `computeDeadlines` /`isHighRisk`
  and the input shape are exactly as before; the wizard's state and handlers
  were relocated, not rebuilt.
- **Two-column layout + document-order counsel-note rail.** The form fills a
  wide main column (~3 parts); a right rail (~1 part) carries the parchment
  counsel notes (awareness, Q1, encryption). The notes **flow in normal document
  order** — nothing pinned, nothing sticky, and no JS-measured anchoring (the
  earlier `useLayoutEffect` + `ResizeObserver` positioning was removed). This is
  by design: do not re-pin or re-anchor the rail. Each note is titled with a bare
  **topical header naming its field** — "Awareness", "Data categories",
  "Encryption" — in sentence case; the visible title deliberately carries **no**
  "counsel" / "counsel's note" wording, which can imply legal advice is being
  given (the internal `.counsel-note` class and `counselNotes` identifiers may
  stay). A hairline vertical rule divides the columns. Below the `md` (768px)
  breakpoint the layout collapses to one column: notes render inline beneath
  their fields.
- **Checkbox-row selection idiom.** Every selection control — jurisdictions, Q1,
  type-of-incident, the CIA data-security principles, the data-element
  checklists, and the boolean toggles (quick mode, encryption, "not available")
  — uses one `.check-row`: a prominent always-visible square checkbox + a
  clickable, hover-lit, keyboard-operable (`role="checkbox"`, space/enter) row.
  Dropdowns, text, textarea, and number inputs keep their plain styling.
- **Submit-gated review (no live result).** Nothing computes on screen during
  entry. A Submit button validates the minimal operative inputs (awareness + ≥1
  jurisdiction + ≥1 Q1 type — the old `canAdvance` conditions) and, if any are
  missing, lists them instead of proceeding. On a valid submit the main column
  switches to a read-only **review**: an analysis-inputs recap plus the computed
  deadline obligations. Only there do the **Download memo** and **Edit answers**
  controls appear, at the top of the review content (nothing is pinned); Edit
  returns to the form with all values intact. Quick mode's review shows the
  operative answers + obligations only (no incident-report recap, no
  further-considerations); full mode includes both.
- **Quick mode** is a focusing view over one shared state, not a separate
  workflow — it shows only the operative fields; entered record data persists
  across toggles.
- **Q1 retains all ten sensitivity options with their exact IDs.** `location`
  and `communications` are kept (they are not high-risk, so the engine ignores
  them) rather than dropped — removing user-facing data categories would be a
  substantive reduction, and the IDs must match what the engine treats as
  high-risk.
- **Dynamic, user-named data-subject categories.** Section 5's "categories of
  data subjects" is a repeater of removable blocks (start with one): each block
  is a user-entered name + approximate count + a **shared** 14-element checklist
  + repeatable custom "Other" element fields. It replaced the earlier fixed
  Customers/Employees/Visitors/Other structure. All record-only.
- **Element → Q1 cross-check.** Each checklist element may tag a Q1 category;
  selecting a tagged element whose Q1 category is unchecked raises a
  non-blocking, on-brand (Ember/`#FBF5EE`) warning naming the category, shown at
  the data section and re-shown on review while unresolved (its prompt is to
  update Q1 — there is no live clock to re-run). The mapping: Password →
  `credentials`; National identification number → `gov_id`; Government ID →
  `gov_id`; Payment card information → `financial`; Fingerprint → `biometric`;
  Health or medical information → `health`; Sensitive/Special-category data →
  `special`. All other elements (name, email, username, physical address, IP,
  date of birth, photos) and custom "Other" entries never trigger. Fingerprint
  makes `biometric` reachable here; `children` has no element and stays a
  Q1-only selection — do not invent one.

### `src/breach-clock/memo-pdf.js` — PDF memo generation

Generates the downloadable memo as a PDF using pdf-lib. The PDF layout,
typography, and structure live here. Substantive content (the deadline
cards, counsel notes, suppressed obligations) is derived from the engine
output and `data.js` — do not hardcode content here that should come from
those sources. The actual render path is the pure `memo-pdf-core.js`
(importable from Node for the gate scripts); `memo-pdf.js` is the thin Vite
shim that loads font/logo bytes and delegates to it.

**Incident-report section.** Full-mode downloads append an "Incident Report"
section (`drawIncidentReport` in `memo-pdf-core.js`). It always **starts on a
fresh page** (`state.addPage()` before it) — it is a distinct artifact appended
to the analysis. The structure is built UI-side in `BreachClock.jsx`
(`buildIncidentReportSections` → `facts.incidentReport`, an ordered array of
`{type:"group"}` / `{type:"field"}` entries) so all field labels and option text
stay in the component — the core just renders whatever it's given, in order,
matching the memo's type/colors (group sub-headings in mixed-case serif; field
labels uppercased like the rest of the memo's labels). Empty fields and
"information not available" groups are dropped before render; data-subject
counts are formatted with thousands separators. Quick mode passes no
`incidentReport`, so its memo is the deadline analysis alone and keeps the
`breach-notification-analysis-<date>.pdf` filename; full mode names the file
from the sanitized incident reference/title + date.

**Top recap section is "Analysis Inputs"** (`drawIncidentSummary`, name
unchanged) — the awareness/jurisdictions/categories/encryption recap. It was
renamed from "Incident Summary" to avoid colliding with the incident-report
"Incident summary" narrative group, which is distinct and unchanged.

**Keep-with-next headers — one uniform guard.** Every header that introduces
following content reserves the header *plus the true rendered height of its
first following element*, through one helper, `keepHeaderWithNext`, which breaks
to a new page first if both won't fit. Never estimate by line count — mirror
whatever renderer draws that first element:

- **Field-followed headers** — the Incident Report section and group headers,
  and the Analysis Inputs first row — reserve `fieldHeight`, which mirrors
  `drawField` *including its bottom padding*. (The original orphan was exactly a
  missing +10pt pad in the reservation.)
- **Bullet-followed headers** — Further Considerations — reserve the bullet
  renderer's own first-line reservation.
- **Card sections** — Deadline Obligations, encryption-suppressed, and
  Jurisdictional Notes — reserve the whole first card via `measureCard`. Cards
  draw atomically, so a card's eyebrow + title always rides with its body.

Why uniform: orphaned headers recurred (Incident summary → Data subjects →
Further Considerations), each surfacing only once a longer memo pushed that
header to a page boundary. Guarding header types one at a time kept exposing the
next one; the uniform guard is the structural fix. To add a new header type,
mirror its first element's renderer — never go back to estimating lines.

Known edge (low priority): reserving the whole first card assumes the card fits
on a page after the heading; a single card taller than a page would need
separate handling. Not an issue at current note lengths.

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

The canonical SVG above lives in code as a single shared React component,
`src/components/ArkidelLogo.jsx` — the **one source of truth** for the rune.
Do not paste the SVG inline anywhere or redraw it; import the component. It is
consumed by the header and footer lockups in `src/components/Layout.jsx` and by
the Landing hero (`src/pages/Landing.jsx`). It takes a `frame` prop (default
`true`) that draws the rounded-square box: the header and footer use the framed
default, and the Landing hero passes `frame={false}` to render only the inner
mark (stem, diagonals, arrow) with no box. The favicons and SaaS-upload assets
generated by `scripts/gen-favicons.mjs` draw the rune independently (they are
not React), so a geometry change to the rune must be mirrored there as well.

The wordmark is "Arkidel" in Merriweather Regular, with letter-spacing
around 1.2px. The wordmark is sentence case: "Arkidel" — never "ARKIDEL"
or "arkidel".

In the header lockup (`src/components/Layout.jsx`), the rune and wordmark sit
side by side at a fixed 1.4:1 glyph-to-wordmark proportion that scales as a
unit: rune glyph **39px**, wordmark **28px**, with a **17px** gap between them.
The lockup was deliberately enlarged to this size so the wordmark reads as the
brand anchor and clearly outweighs the adjacent nav links, while keeping the
header bar compact (≈79px tall).

The wordmark is shifted slightly downward (`transform: translateY(...)`) to
optically align its x-height band with the vertical center of the rune. This
compensates for "Arkidel" having no descenders, so its visual mass concentrates
in the x-height band and would otherwise ride high relative to the rune's
geometric center. The shift is proportional to the wordmark size (~0.093em):
**2.6px at the current 28px wordmark** (it was 2px back when the wordmark was
20px). The exact value is chosen by true-size rendered comparison, not by a
single font metric — different definitions of the glyph's "center" yield
different numbers, so the live render is the arbiter. If the lockup is ever
resized, re-derive the nudge proportionally and re-check it on a real render
rather than carrying the old absolute pixel value forward.

The footer (same file) carries the same rune+wordmark lockup as a quiet
sign-off, deliberately smaller than the header so it reads as the echo, not the
anchor: framed rune 20px, wordmark 14px, ~1.4:1 proportion. Its optical nudge is
re-derived for that size — **1.3px** (0.093em × 14px), not the header's 2.6px —
which is the same rule restated: the shift tracks the wordmark size, so each
lockup gets its own value.

The logo and wordmark generally appear together. On marketing surfaces and
PDF letterheads, the rune sits to the left of the wordmark, vertically
centered. The logo color follows the surface: Midnight on light backgrounds
(Bone, Parchment), Parchment on dark backgrounds (Midnight).

**SaaS-upload brand assets.** For third-party tools where we don't control the
surrounding surface (Google Workspace organization logo, Buttondown email
header, etc.), the "color follows surface" rule is deliberately set aside in
favor of a self-contained mark: the signature header look — Parchment
(`#E8DDC4`) logo on a solid Midnight (`#1B2A3F`) panel that fills the whole
canvas. The panel *is* the surface, so the mark carries its own visual context
on any host background. These assets live at `outputs/brand-assets/`
(`arkidel-square-512.png`, a contained rune; `arkidel-horizontal-600.png`, rune
+ wordmark) and are generated by `scripts/gen-favicons.mjs` — the script is the
source of truth; the PNGs are committed for easy upload but are regenerable. The
favicons that same script produces follow the original rule instead (Midnight on
transparent), since browser chrome is a surface we don't own. They sit in
`outputs/`, not `public/`, on purpose: `public/` is copied into `dist/` at
build, and these are upload artifacts, not site assets.

**Component styling — buttons:** All buttons (and adjacent boxed form
inputs, e.g. the waitlist email field) use an 8px corner radius, matching the
rune box's 8px corners, so they read as part of the same geometric vocabulary.
This applies to the `.btn-primary` and `.btn-ghost` classes in
`BreachClock.jsx`, the inline-styled buttons there (Download memo, Tests-view
back), and the Tailwind `rounded-lg` CTAs and form controls on Landing.
Text-link controls with no box (the footer "Tests" link, the inline "Try
Breach Clock →" link) are excluded — a radius is meaningless without a border
or fill.

**Component styling — cards & surfaces:** Cards and larger surface elements
use a 12px corner radius — deliberately larger than the 8px on buttons and
inputs, following the convention that bigger surfaces carry a larger radius
than smaller interactive controls. This keeps the geometric voice coherent
while being proportionally tuned. The 12px applies to the simple (no
left-accent) cards — `.checkbox-card` (rounding holds across default, hover,
and selected, since those states change only background), the Tests-view test
list card, the counsel-note `<aside>` beside question prompts, and the
review-step confirmation card. The three left-accent cards — deadline
(`.deadline-card`, Midnight stripe), suppressed-obligation (Moss stripe), and
jurisdictional-notes (Parchment stripe) — use **asymmetric** rounding
(`border-radius: 0 12px 12px 0`): the left edge stays square so the 4px
categorization stripe runs straight full-height, while the top-right and
bottom-right corners round to 12px. (This was "Option B" in the rounding
review; the symmetric alternative, where the stripe curves with the corners,
was "Option A" and was not chosen.)

### Landing page composition

**Hero rune-at-scale.** The Landing hero (`src/pages/Landing.jsx`) carries a
large rune watermark: the frameless mark (`<ArkidelLogo frame={false} />`) in
Parchment on the Bone hero, enlarged well beyond logo size and bled off the
right edge so only a portion shows — it reads as brand texture, not a contained
logo. It sits behind the text (`z-0` under the copy's `z-10`) and never reduces
headline or subhead legibility; full-strength Parchment on Bone already reads as
a quiet watermark. The left-pointing arrow is kept inside the visible area
rather than cropped. It is quieter on tablet (smaller, pushed further off the
edge) and dropped entirely below the `md` breakpoint so it never crowds the
stacked mobile text.

**Four-pillar band.** Directly below the hero is a full-bleed Midnight band
(`py-16`, with `max-w-5xl` inner content) of four short value propositions: four
columns at `lg`, 2×2 from the `sm` breakpoint, single-column stacked on mobile.
Each column is numbered 01–04 in Parchment mono over a thin Parchment top rule
(`border-t-2 border-parchment/30`), with a Merriweather serif heading and Mist
(`text-mist`) body copy.

### Color palette

| Token | Hex | Use |
|---|---|---|
| Midnight | `#1B2A3F` | Primary brand color (deep navy, slightly warm). Marketing surfaces; primary headings; logo on light surfaces. |
| Bone | `#FAF8F2` | Primary app canvas. Background for product UI. |
| Parchment | `#E8DDC4` | Warm counterweight. Logo color on dark surfaces. Counsel-notes card borders in the PDF. |
| Ink | `#2C2418` | Body text on light surfaces. Slightly warmer than pure black. |
| Mist | `#9FAEC2` | Secondary text on dark surfaces. Labels, captions, rules in the PDF. Also a registered Tailwind theme token (`text-mist`, defined in `src/index.css`), used on screen for the Landing four-pillar band body copy. |
| Ember | `#C76E3A` | Attention/warning state. No red by design — red is overused in compliance UX. Use sparingly. |
| Moss | `#5A6E4A` | Safe/verified state. Suppressed-obligation card borders in the PDF. |

Marketing surfaces are Midnight-dominant. Product UI keeps a Bone canvas
with Midnight used sparingly for chrome and accents.

In addition to the named tokens above, three off-palette values are
deliberate and recur in the Breach Clock UI. They are intentional — a
future audit should recognize them rather than re-flag them.

| Value | Use |
|---|---|
| `#FBF5EE` | Warm cream attention tint paired with Ember. Background of the urgent deadline-card variant (approaching the deadline) and of the failing-test error panel in the Tests view. |
| `#2C3E55` | Primary-button hover color — a lightened Midnight applied via `.btn-primary:hover`. |
| `#FFFFFF` | Pure white card-surface background on the Bone canvas. Used for deadline cards, encryption-suppression cards, and the Tests-view test list. The slight lift against `#FAF8F2` is intentional and gives the cards their own surface. |

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

Serif headings take their emphasis from size, not weight. Merriweather is
loaded on screen at weight 400 only (`@fontsource/merriweather`, Regular), so
applying `font-semibold`/`font-bold` — or any weight above 400 — to a serif
heading produces synthetic faux-bold (the browser algorithmically thickening
the 400 outlines), which looks muddy and off-brand. Don't bold a serif heading;
scale it up instead. (The PDF pipeline additionally bundles
`Merriweather-Bold.ttf` as a separate, genuine bold face — but that is for the
PDF only and is not available to on-screen CSS.)

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

**Producing Title Case (structural + PDF + on-screen form headers).** The Breach
Clock's on-screen form section headers follow the Title-Case structural rule
too, matching the PDF section and group headers. Set the literal strings in
Title Case — never use an automatic capitalize or CSS `text-transform` to
generate it, which wrongly capitalizes short interior words like "the" and
mishandles "&". Keep short interior words lowercase ("When the Incident
Occurred") and preserve "&" ("How & When Discovered"). User-entered values pass
through untouched and are never auto-capitalized — e.g. the category name after
the em dash in "Data Subjects — {name}". The incident-report group titles are a
single shared source (`buildIncidentReportSections`) consumed by both the PDF
and the on-screen review, so fixing a literal once corrects both surfaces.

**Two slots are deliberately NOT Title Case.** Rail labels render all-caps
through the `.section-mark` idiom — "AWARENESS", the "Breach Clock" control
label, the footer "ARKIDEL · RESPOND", and the deadlines-only review-state badge
— which is intentional and consistent, not a casing slip. And checkbox-row
option labels are sentence case ("Notification requirements and deadlines
only"). Neither is a structural header, so the Title-Case rule above does not
apply; do not "correct" them.

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
