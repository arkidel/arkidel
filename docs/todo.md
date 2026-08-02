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
No item here is `[substance]`.

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
- 2026-07-17 — sign-out destination is /sign-in (was specced as /); made
  deterministic by awaiting signOut before navigating.
- 2026-07-17 — Auth roadmap (settled direction, do not re-litigate): magic
  link stays the spine; passwords will not be added (credential-store
  liability is disproportionate for a breach-notification vendor; "we cannot
  leak your password because we have never held one" is part of the
  positioning). Ladder, each rung on pull rather than speculation: (1)
  six-digit OTP code alongside the magic link — small, adopt when
  link-burning by corporate mail scanners (Outlook SafeLinks etc.) generates
  friction, or preemptively; (2) Google + Microsoft OAuth sign-in — identity
  scopes only (email, name), free on both platforms for these scopes, no
  schema or data-layer changes; sequence AFTER arkidel.com and the privacy
  policy since both provider consoles want the real domain and policy URL;
  before shipping, test account linking against the parked scratch account
  (Gmail-based, existing magic-link identity — confirms same-email OAuth
  sign-in links rather than duplicates); (3) passkeys and SAML SSO when
  customer pull demands them.

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

## Dependency audit — pre-existing vulnerabilities (logged 2026-06-21)

Surfaced while scaffolding the Supabase client/auth layer; **not** introduced by
that work. None block the current scaffolding.

- `npm audit` reports 4 vulnerabilities (3 high, 1 low), all in pre-existing
  transitive dependencies of `react-router-dom` / `vite` / `@babel/core`. Action:
  run `npm audit`, evaluate the upgrades (prioritise the high-severity
  `react-router-dom` / `vite` items), and resolve before the app holds real
  client data.

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
- "SUGGESTED" tag treatment. Revisit the non-selecting hint on the risk
  section's "high" option — placement, wording, visual weight, and colour (today
  a parchment mono chip). Purely presentational; the hint logic
  (`isHighRisk(sensitivity)`) is settled.

---

## Encryption gate — per-jurisdiction decomposition `[substance]` (queued 2026-06-14)

Signed-off build-of-record for replacing the single global encryption switch
with a per-jurisdiction encryption safe-harbor cluster, routed through a generic
per-obligation conditional seam. Multi-stage, protected-file work (`engine.js`,
`data.js`, plus `BreachClock.jsx`, tests, docs). Recorded verbatim below as the
build-of-record; do not paraphrase. STAGE 1 in progress 2026-06-14.

```
ADDENDUM — Encryption gate build plan (granular/precise variant)
Extends the per-jurisdiction encryption decomposition spec. Engine.js + data.js
(PROTECTED) + BreachClock.jsx + tests + docs. Multi-commit, staged.

DESIGN PRINCIPLE: most granular and precise at every fork; never let an
unset/partial value suppress or under-notify. A safe harbor applies ONLY when every
condition is affirmatively established; any unset → obligation fires.

--- A. FINAL SUB-QUESTION WORDING (factual-assertion voice) ---
US cluster (shown for US jurisdictions), each tri-state, unset → fires:
  1. encrypted: "Was the affected data encrypted?" Yes / No
  2. encryptionStrength (revealed iff encrypted=Yes): "Was the encryption at least
     128-bit (AES-128 or stronger)?" Yes (128-bit+) / No (below 128-bit) / Unknown
     Helper: "Massachusetts recognizes its safe harbor only for 128-bit-or-higher."
  3. redacted: "Was the affected data redacted?" Yes / No
     Helper: "Virginia's safe harbor includes redacted data; most states' do not."
  4a. keyAcquired (revealed iff encrypted=Yes): "Was the encryption key, decryption
     means, or a security credential able to render the encrypted data readable also
     acquired?" Yes / No
     Helper: "If acquired, the encryption safe harbor does not apply — California
     explicitly includes an acquired security credential."
  4b. reidentificationAcquired (revealed iff redacted=Yes): "Was the information
     needed to re-identify the redacted data also acquired?" Yes / No
     Helper: "If acquired, the redaction safe harbor does not apply."
GDPR input (separate; shown for EU/UK near the risk section), tri-state:
  5. gdprUnintelligibility: "Were appropriate technical measures (e.g. encryption)
     applied that render the data unintelligible to unauthorised persons?" Yes / No
     Helper: "Under Art. 34(3)(a), individual notification may be exempt where such
     measures rendered the data unintelligible. Does NOT affect Art. 33 authority
     notification." (No 128-bit floor — Art. 34(3)(a) is a qualitative standard.)

--- B. GENERIC SEAM (conditionalGates, per OBLIGATION, multi-gate, role-typed) ---
The engine walks each obligation's conditionalGates generically. NO per-state
encryption logic in the engine body — each gate is data. Evaluation is PER
OBLIGATION (not per jurisdiction), so a CRA obligation can route independently of a
resident-notice obligation in the same state.

Gate shape:
  { role: "fireCondition" | "safeHarbor",
    input: "<conditional input id>",        // e.g. "encrypted", "riskLevel", "gdprUnintelligibility"
    condition: <how to read input>,          // e.g. value=="yes"; riskLevel in ["risk","high"]
    requiresStrength: "ge_128" | null,        // MA encryption only
    defeatedBy: "keyAcquired" | "reidentificationAcquired" | null,
    onSatisfied: "suppress" | "review" | null,// safeHarbor only
    whenUnset: "pending" | "fires",           // fireCondition→pending; safeHarbor→fires
    citation, description }

A safeHarbor gate is SATISFIED iff: input affirmatively == qualifying value, AND
(requiresStrength==null OR strength affirmatively meets it), AND (defeatedBy==null
OR that input affirmatively == "no"). Any unset in that chain → NOT satisfied →
obligation fires (unless another gate suppresses). Maximally conservative.

Risk gate is RE-EXPRESSED in this vocabulary (behavior-identical; its 12 EU/UK
tests are the regression net): Art.33 obligation gets a fireCondition gate
{input:"riskLevel", condition: in ["risk","high"], whenUnset:"pending"}; Art.34 gets
fireCondition {riskLevel=="high", whenUnset:"pending"} PLUS a safeHarbor gate
{input:"gdprUnintelligibility", onSatisfied:"suppress", whenUnset:"fires"}.

--- C. PER-OBLIGATION BUCKET RESOLUTION (4 buckets) ---
Buckets: deadlines | suppressed | pending | review. Resolve each obligation:
  1. fireCondition gates first. If any is indeterminate (its input unset) → PENDING.
     If any fireCondition is not-met → SUPPRESSED (reason: that condition).
     If all fireConditions met (or none) → continue.
  2. safeHarbor gates. Among satisfied ones: if any onSatisfied=="review" → REVIEW;
     else if any =="suppress" → SUPPRESSED. If none satisfied → DEADLINES.
  Precedence: pending (missing input) outranks harbor evaluation; review outranks
  suppress (never silently suppress when a path demands judgment).

--- D. ROUTING TABLE (confirm each row vs statute) ---
Each US obligation carries a safeHarbor encryption gate; VA also a redaction gate:
  CA  encryption: defeatedBy keyAcquired (incl. security credential) → suppress
  TX  encryption: defeatedBy keyAcquired → suppress
  CO  encryption: defeatedBy keyAcquired (the 6-1-716(2)(a.4) re-trigger) → suppress
  NY  encryption: defeatedBy keyAcquired → suppress
  VA  encryption: defeatedBy keyAcquired → suppress; AND redaction:
      defeatedBy reidentificationAcquired → suppress (either harbor suffices)
  MA  encryption: requiresStrength ge_128, defeatedBy keyAcquired → REVIEW (see E)
  GDPR Art.34 only: gdprUnintelligibility → suppress (Art.34(3)(a)); Art.33 never.
Per-obligation: if any obligation is encryption-INDEPENDENT it declares NO
encryption gate and always fires. (No modeled CRA obligation is encryption-
independent — encryption defeats the breach definition for the whole state, so CRA
suppresses with the rest.)

--- E. MA ROUTING ---
MA c.93H 3(b) has two triggers; the SECOND (unauthorized acquisition/use of PI) has
NO encryption qualifier, so encryption can never fully suppress MA.
  - encrypted=Yes AND strength=ge_128 AND keyAcquired=No → 1 harbor met → all three
    MA obligations (AG, OCABR, residents) → REVIEW, with copy: "The encryption safe
    harbor excuses 3(b)'s breach-of-security trigger, but 3(b)'s second trigger
    (unauthorized acquisition or use, no encryption qualifier) must be independently
    assessed by counsel."
  - harbor not met (unencrypted, strength below/unknown, key acquired, or any unset)
    → MA fires normally (deadlines).
  - MA has no CRA-equivalent in the modeled set (AG/OCABR/residents only).

--- F. `review` BUCKET SEMANTICS (general, not MA-only) ---
Meaning: all inputs provided, but the obligation's outcome turns on a substantive
legal judgment the engine does not make. Distinct from `pending` (awaiting a user
input) and `suppressed` (affirmatively excused). The harm gate and NY inadvertent-
disclosure gate will also produce `review`.
  - Engine: computeDeadlines returns a 4th array `review`; runTests signature gains
    a 4th arg; the tri-state invariant doc becomes a quad-state invariant.
  - Results page: a distinct card, NOT Ember (Ember is warnings). Neutral (Mist
    family) treatment, labeled "Counsel review required", each item showing the
    reason. Mixed states render plainly (e.g. CA suppressed / CO fired / MA review).
  - PDF memo: a dedicated "Requires counsel review" section listing review items +
    reasons, parallel to suppressed/pending.
  - Recap row: review-state obligations shown with their reason.

--- G. STAGING (multi-commit; each: explicit-filename commit, HOLD push; tests green
    + gate-render reviewed before the next) ---
  S1. Generic conditionalGates seam in engine.js + re-express the risk gate in it.
      BEHAVIOR-PRESERVED. The 12 EU/UK risk tests + all existing tests stay green.
      No new buckets, no new inputs.
  S2. Add the 4th `review` bucket to the engine return shape + runTests 4th arg +
      results card + PDF memo + recap — but NO obligation routes to it yet. Pure
      shape change; all existing tests green.
  S3. US encryption cluster: add inputs (encrypted/strength/redacted/keyAcquired/
      reidentificationAcquired) + safeHarbor gates for CA/TX/CO/NY/VA (suppress) and
      VA redaction gate; remove the global encryption switch atomically; re-point the
      existing encryption tests + adversarial A/B groups; add CA-credential,
      CO-re-trigger, VA-redacted edges. UI cluster. Gate-render mixed-state results.
  S4. MA encryption gate → review (populates the bucket) + second-trigger copy. Add
      MA-second-trigger test. Gate-render the MA review card.
  S5. GDPR Art.34(3)(a): add gdprUnintelligibility input + safeHarbor gate on Art.34
      only + UI input near the risk section. Add tests (high+unintelligible→suppress;
      high+not→fire; Art.33 unaffected). Gate-render.
  S6. Docs: update the "no mixed states" carve-out (per-jurisdiction encryption
      routing supersedes it; mixed results are correct) AND the tri→quad-state
      invariant passage; update the CA/TX/CO/NY/VA + EU/UK intake-form sign-off
      sections to record the encryption-model change. PROTECTED + sign-off.

--- H. GUARDRAILS ---
  - Do NOT wire the harm gate or NY inadvertent gate here — later `review`-producing
    consumers; keep the seam general. Encryption + GDPR-unintel are the only wired
    consumers in this build.
  - No deadline/threshold/prose changes except MA's review treatment + the carve-out
    doc + the encryption-model intake-form notes.
  - No push at any stage; protected-file work.
```

### Stage status

- **S1 — done (2026-06-14):** generic per-obligation `conditionalGates` seam in
  `engine.js`; EU/UK risk gate re-expressed in it, behavior-preserved; three
  buckets retained; global encryption switch untouched. In-file 60/60 +
  adversarial 57/57, no test rewritten. Commit `ebde37f`.
- **S2 — done (2026-06-14):** 4th `review` bucket added end to end —
  `computeDeadlines` returns `review`; `runTests`/`expectAll` extended to a 4th
  arg (plus unused `expectReview`/`expectReviewCount` helpers for S4); results
  page gains a neutral Mist "Counsel review required" card + conditional recap
  row; PDF memo gains a "Requires Counsel Review" section (Mist border); both
  zero-state banners now guard on `review.length === 0`. Nothing routes to
  `review` (bucket empty); behavior-preserved. Quad-state invariant verified
  across 189 fact-sets (review empty, no obligation in >1 bucket). In-file 60/60
  + adversarial 57/57 unchanged; production build green.
- **S3a — done (2026-06-14):** every encryption-suppressing state migrated to
  per-obligation safeHarbor `conditionalGates` in `data.js` (CA/TX/CO/NY/MA
  encryption; VA encryption + redaction; EU/UK Art. 34 unintelligibility). The
  global `encryptionApplied` switch is deleted from the engine — no dual code
  path; the seam now evaluates fireConditions before the threshold and
  safeHarbors after it. Behavior reproduced exactly: MA still suppresses
  (`onSatisfied:"suppress"`; S4 flips it to `review` + adds `requiresStrength`),
  GDPR Art. 34 still suppresses via the `encryptionApplied` fact the gate reads
  (S5 swaps it for `gdprUnintelligibility`). US states read the cluster inputs
  `encrypted`/`keyAcquired`/`redacted`/`reidentificationAcquired`. Existing
  encryption cases re-pointed to identical outcomes (only `facts` changed, never
  `expect`); +6 new edge cases (CA security-credential, CO re-trigger, VA
  redaction both ways, conservative-unset, strength-irrelevant-for-non-MA).
  In-file 66/66 (was 60), adversarial 57/57, EU/UK risk 12/12 unchanged,
  quad-state invariant holds (review empty), build green. **Transitional:** the
  UI still sends the old `encryptionApplied` boolean and not the cluster, so US
  encryption suppression is not wired to the UI until S3b; the engine path is
  test-driven for now. Committed with the adversarial harness (A group
  re-pointed) added to the file list.
- **S3b — done (2026-06-14):** the encryption cluster UI in `BreachClock.jsx`
  (UI-only; no engine/data change). The single encryption toggle is replaced by
  five tri-state inputs (encrypted / encryptionStrength / redacted / keyAcquired /
  reidentificationAcquired, wording + helpers per ADDENDUM §A), built on a
  `triStateRow` check-row-as-radio helper. Nested reveals: strength + keyAcquired
  appear when encrypted=Yes; reidentification when redacted=Yes. All five wired
  into `computeDeadlines`. **GDPR preserved (instruction 2):** `encryptionApplied`
  is now a *derived* boolean (`encrypted === "yes" && keyAcquired === "no"`) that
  still drives the EU/UK Art. 34 gate until S5 — the same cluster drives both US
  and GDPR; nothing stranded. **Visibility:** the cluster renders when any
  jurisdiction is selected (not US-only) — gating it US-only would strand EU-only
  GDPR encryption, the sole encryption control until S5. Analysis-inputs recap now
  summarizes the cluster. Verified: in-file 66/66, adversarial 57/57 (engine
  untouched), build green; preview gate-render — cluster renders, both reveals
  work, no console errors, and a mixed-state result (CA fires + VA
  redaction-suppressed, same incident) renders correctly.
- **S4 — done (2026-06-14):** MA's encryption gate flipped `suppress` → `review`,
  with `requiresStrength: "ge_128"` added and the description replaced by the
  § 3(b) second-trigger copy ("The encryption safe harbor excuses § 3(b)'s
  breach-of-security trigger, but § 3(b)'s second trigger … must be independently
  assessed by counsel."). All three MA obligations (AG, OCABR, residents) route
  together. First population of the review bucket; the S2 review card renders from
  the gate data with no UI change. MA routing now: encrypted + ge_128 + key-not-
  acquired → REVIEW; anything weaker (unencrypted, below_128, Unknown, strength
  unset, key acquired) → FIRES. The first intended behavior change in the feature
  — two MA encryption test cases re-pointed (suppress → review), each flagged in
  the commit. No other state changed (CA/TX/CO/NY/VA stay suppress; EU/UK
  unchanged). Engine *logic* untouched (requiresStrength + review push existed
  from S1–S3a); engine.js edited for TEST_CASES only. In-file 70/70 (was 66; +4
  new MA edges), adversarial 57/57, quad-state invariant holds with review
  populated, build green.
- **S5 — done (2026-06-14):** GDPR Art. 34(3)(a) gets a dedicated
  `gdprUnintelligibility` tri-state input (wording/helper verbatim from ADDENDUM
  §A #5), rendered near the risk section for EU/UK in both quick and full mode.
  The EU/UK Art. 34 gate's `input` switched from `encryptionApplied` to
  `gdprUnintelligibility` (`equals: true` → `equals: "yes"`). The derived
  `encryptionApplied` boolean is **fully retired** — no code reads or writes it
  anywhere (grep-clean; only explanatory comments remain). Engine `gateInputs`
  now supplies `gdprUnintelligibility`; the US cluster reverts to **US-only
  visibility** (`anyUSJurisdiction`) now that EU/UK has its own control. The
  PDF-memo orphan was fixed: `memo-pdf-core.js` reads a new `encryptionSummary`
  string (the same cluster summary shown on screen) instead of the retired
  boolean. EU/UK Art. 34 exemption test cases re-pointed (`encryptionApplied:
  true` → `gdprUnintelligibility: "yes"`) — facts only, no `expect` moved.
  Verified: in-file 70/70, adversarial 57/57 (identical outcomes), render gates
  green, build green. **File-list note:** beyond the named four (data.js,
  BreachClock.jsx, engine.js, docs/todo.md) the cleanup necessarily touched
  `memo-pdf-core.js` (production orphan) and the `adversarial`/`render-gate-memo`/
  `render-truncation-gate` harnesses (re-pointed dead `encryptionApplied`); the
  truncation gate's old "suppressed" scenario — silently neutered back at S3a when
  MA moved off the global switch — is re-pointed to the MA **review** path.
- **S6 — done (2026-06-14, pending Jim's diff sign-off):** docs only. CLAUDE.md
  updated — the "no mixed states" carve-out now records that per-jurisdiction
  encryption routing intentionally produces mixed results (superseding the
  global-switch rule); the "unreachable tri-state" passage became the **quad-state
  invariant** (deadlines/suppressed/pending/review, exactly one per obligation,
  combinations may co-occur); a per-state encryption-model summary + the generic
  conditionalGates-seam note were added; and two stale UI-section references to the
  retired `encryptionApplied` were corrected. `docs/intake-forms.md` — a dated
  "Encryption modeling (2026-06-14)" note added to all **eight** sign-offs
  (CA/TX/CO/NY suppress; VA encryption + redaction; **MA suppress→review**, scope
  addition flagged; EU/UK Art. 34 via gdprUnintelligibility), each non-substantive
  to deadlines/thresholds and pointing to the addendum as build-of-record.
- **Encryption-gate feature COMPLETE (S1–S6).** Generic per-obligation
  conditionalGates seam; quad-state engine; per-state encryption safe harbors
  (CA/TX/CO/NY suppress, VA encryption+redaction, MA counsel-review, EU/UK
  Art. 34(3)(a) via gdprUnintelligibility); full cluster UI; docs + intake-form
  sign-offs recorded. Commits ebde37f (S1) · 6828dff (S2) · fc265e5 (S3a) ·
  f2e03b2 (S3b) · bfc9834 (S4) · 3c17f49 (S5) · S6 pending sign-off.

---

## Backlog — forward features (queued 2026-06-21)

Forward features captured for after the Phase 4 launch-readiness work. None
block launch; all are post-launch scope. The account system and saved-incident
history share a Supabase backend and should be sequenced together.

- **Account system — magic-link login.** Passwordless magic-link
  authentication. Newsletter opt-in must be decoupled from account creation —
  no consent-coupling: creating an account must not bundle marketing-list
  consent (GDPR).
- **Saved-incident history (persistence).** Let users save and revisit prior
  Breach Clock incidents. Introduce Supabase at the **start** of this work, not
  after — it bundles Postgres, auth, and storage in a single backend. Stand up
  a Vercel staging environment once Supabase is in, so the auth flows can be
  tested against a real URL. Shares the Supabase backend with the magic-link
  account system above; sequence the two together.
- **Standalone `/compare` (or `/vs`) page.** A dedicated competitive-
  positioning page carrying comparison copy, kept separate from About — About
  stays the brand/mission page; `/compare` carries the competitive positioning.
- **Top-bar search stub's designated job:** filtering the Respond incidents
  list (recorded 2026-07-19; not yet built).
- **Status lifecycle future work (recorded 2026-07-21):** consider
  edit-locking/audit trail on Active (what-did-we-believe-when has litigation
  value); a "no notification required" closed-state distinction downstream of
  risk-of-harm modeling; list filtering by status when the search stub is
  built.
  - **Compute/persist divergence — RESOLVED (JDC rulings 2026-08-02, landed
    same day).** Four rulings: (1) Submit & compute also saves, universally
    including quick mode — a never-saved form is created active in one
    insert; a saved incident gets ONE update carrying payload and the status
    transition together (single PATCH, no divergence window); a failed save
    keeps the user on the form with the save-error treatment — results
    render only after confirmed persistence. (2) Memos always generate from
    a fresh compute of current facts at generation time, never a cached
    results state (belt-and-braces; protects the Save-without-Submit path).
    (3) Edit mode gains a ghost Back-to-results affordance that discards
    unsaved in-memory edits (revert to last-saved payload) with no save and
    no status transition. (4) Closed-incident resubmit reactivates without a
    confirmation prompt — Back to results is the non-mutating exit. A quiet
    Parchment staleness banner renders on results when facts have changed
    since the displayed compute. This resolves the never-saved-submit trap,
    the saved-incident facts/status divergence, the stale-memo hazard, and
    the closed-resubmit question (gate renders 2026-07-24 / 2026-07-26).
  - **What-if / exploratory compute mode — deliberate future feature:** edit
    facts and compute without persisting, visibly flagged as exploratory.
    Replaces the accidental capability removed by Submit-also-saves. Design
    conversation required.
  - No affordance to clear a recorded notification date — Edit date only.
    Decide whether a clear/remove control is needed and how it renders in
    the record. (Gate render 2026-07-24.)
  - Decision (JDC, 2026-07-24): the record-notification affordance and log
    add-entry form remain available on closed incidents; closed is a status,
    not a lock. Locking arrives with the edit-locking/audit-trail work.
- File attachments on incident log entries + per-incident Files tab — gated
  on privacy policy (processor status, retention, deletion for stored breach
  files; see account-maintenance.md [JDC] markers). Supabase Storage,
  attachments metadata table, editor tab IA. Log entry JSONB needs no
  forward-compat work.
- **Category-conditioned engine pass — DONE 2026-07-26** (commit 1 of 2;
  design pass + engine + data + tests + intake record; JDC sign-off
  2026-07-25). Standalone `ssn` element (gov_id excludes SSN);
  `gating.categories { anyOf }`; obligation kinds `service` / `advisory`
  with additive `services` / `advisories` engine outputs; Connecticut
  (Conn. Gen. Stat. § 36a-701b) added as the tenth jurisdiction; DE
  § 12B-102(e)/(f) and MA c. 93H § 3A standing notes upgraded to computed
  obligations. The **four statutory-phrase repairs are DONE** in the same
  commit: per-obligation `deadline_phrase` in data.js, basis composed as
  `{citation} — {deadline_phrase}`, no hardcoded phrases left in engine.js
  (pinned by the adversarial source-grep case) — fixes the VA/CO "without
  undue delay" mislabel, the EU Art. 34 "Without unreasonable delay" display
  slot (data now correct; the display-slot rendering itself is commit 2), the
  EU Art. 33 "3 days from awareness" label (now "72 hours from awareness"),
  and the DE AG "0 days from notification" artifact. **Commit 2 (rendering)
  DONE 2026-07-26**: Q1 renders from the canonical SENSITIVITY_OPTIONS export
  (ssn selectable above the relabeled gov_id); service cards (Midnight
  stripe, "Service period" slot, statutory duration units) and advisory
  cards (dashed border, Parchment stripe; auto-advisories carry the
  screen-only "Edit data categories" jump) render per jurisdiction on the
  results view; the memo prints service cards (Ink "{duration} (minimum)"
  right slot, never through formatDeadline) and advisories in the
  counsel-note idiom; the memo's no-fixed-clock right slot now composes
  "Due {statutory phrase}" from the basis (closing phrase defect #2 in the
  renderer). Verified headlessly: build, both engine suites (96 + 63), and
  the extended memo gate (scripts/render-gate-memo.mjs — three fixtures, 15
  assertions). Commits f02f0ef and the rendering commit ship together —
  never push commit 1 alone (interim rendering regression documented in the
  commit-1 report).
  - **Fixture data-category updates — COMPLETE (2026-07-26).** Correction to
    the commit-2 note: "Test Incident 2" carries [identifiers, financial] —
    no bundled gov_id, so no migration was needed. "Delaware Test 1"'s
    category migration is DONE (2026-07-26, driven via the UI: ssn added,
    saved, closed status restored). Fixture work complete.
  - Gate verified the edit-data-categories jump fix live: the SSN row lands
    in view; the row top sits flush against the nav clearance — cosmetic
    tightness only, revisit only if it bothers JDC. (Gate render 2026-07-26.)
- **Harm-gate form question** `[substance]` — **DONE 2026-08-02, both
  commits** (engine/data commit 1 d48ff1b + the § 3(b) explainer fix + the
  UI/memo commit); the trio ships together after one JDC + Claude gate.
  Design settled in principle
  (single generic question, per-jurisdiction harmGate mechanism carrying each
  statute's exact standard and character: exemption CT/DE, misuse
  determination CO, duty element VA, definitional-with-dual-trigger-bypass
  MA; "Not assessed" computes everything; never blocks like EU risk).
  Deferred to the primary-source review cycle for CA/TX/CO/VA/NY/MA/DE/CT
  harm language verification. JDC 2026-07-25. **Verification complete
  2026-08-01** — every jurisdiction's harm standard captured verbatim in the
  intake-forms sign-off blocks (primary-source review entries). Character
  map confirmed: CA and TX have NO harm standard (`harmGate` absent — a form
  answer is inert); CT and DE general self-determination (different
  wording, carried verbatim each); CO misuse determination (dual: (2)(a)
  residents / (2)(f)(I) AG); VA duty element (element-negation form); MA
  definitional with trigger-two bypass (can inform § 1, can never suppress
  the second-trigger duty); NY narrow compound — recorded as not gateable by
  the generic question (design ruling pending, to be made properly in the
  harm-gate design conversation). The design conversation now sits on
  verified language: the question is purely how one form question applies
  eight different standards honestly.
  - **Commit 1 landed 2026-08-02** (design locked and mock ratified by JDC
    2026-08-02; protected-file edits authorized): `harmAssessment` fact
    ("" | "determined_unlikely" | "harm_likely", facts.js passthrough);
    per-obligation `harmGate { standard, citation, character }` in data.js
    (CT/DE/CO exemption — CO dual (2)(a)/(2)(f)(I) standards; VA
    duty_element; CT/DE services cascade via their own gates);
    jurisdiction-level `harmNonGateExplainer` on NY and MA (render in
    commit 2); engine suppression via the additive `suppression_reasons`
    mechanism array ("determined_unlikely" is the only suppressing value;
    encryption+harm double suppression stays one entry with both reasons);
    intake-forms § 0A + six sign-off amendments. Both suites green:
    111 in-file (was 98), 73 adversarial (was 63; new "J. Harm" group).
    NY design ruling made: not gateable by the generic question —
    `harmNonGateExplainer` instead.
  - **MA explainer citation fix landed 2026-08-02** (own commit before the
    UI commit; JDC ruling 2026-08-02): the trigger-two bypass lives in the
    owner/licensor duty at § 3(b), not "§ 3(a)(2)"; explainer string now
    cites M.G.L. c. 93H §§ 1, 3(b); the intake-forms (a)/(b) flag from the
    2026-08-01 review is resolved.
  - **Commit 2 (UI + memo) landed 2026-08-02** (mock ratified by JDC
    2026-08-02): conditional "Harm Assessment" form question (renders only
    when a selected jurisdiction carries a harmGate; three single-select
    rows, "Not assessed" default; risk and harm never prefill each other);
    data-driven "Applicable standards" rail card (CO tagged Residents / AG);
    results render the "Suppressed — harm determination" group with per-row
    verbatim standards + citations, VA negated-duty-element framing, and the
    admonition footer; the NY/MA still-computing explainer card (dashed
    advisory idiom) renders once above the first NY/MA block,
    determined_unlikely only; memo mirrors the screen (Analysis Inputs
    Risk/Harm rows, harm-suppressed cards with standards, the explainer in
    the counsel-note idiom; no new Ember). Display composition centralized
    in results-grouping.js (HARM_ASSESSMENT_LABELS / RISK_LEVEL_LABELS /
    harmAssessmentSummary / harmNonGateDisplay / harmMechanismOf). Verified
    headlessly: build, both suites (111 + 73), and the extended memo gate
    (scripts/render-gate-memo.mjs — five fixtures; the harm fixture asserts
    both CO strings distinct, VA framing, § 3(b), the Analysis Inputs row,
    and ""-vs-"harm_likely" text parity except that row).
- **Primary-source review cycle for all shipped jurisdictions — DONE
  2026-08-01** (JDC + Claude). All ten jurisdictions verified against
  official statute publications or regulatory authorities. ZERO substantive
  errors — no deadline, threshold, comparator, citation, or duration change
  anywhere. Amendments landed 2026-08-01: verification records +
  phrase/condition refinements (CA), one new advisory (CO § 6-1-716(2)(a.3)),
  source upgrades (CO/CT/DE official sources; Justia retired), § 18.2-186.6(C)
  conform (VA), verbatim § 1 captures (MA, intake-record-only), UK PECR/DUAA
  counsel note, and verbatim harm-standard capture for the harm-gate design.

---

## Backlog — UI polish (queued 2026-07-16)

- Rail shows live Respond/Incidents links to an org-less user (gated,
  harmless, but consider dimming pre-org).
- Home heading "Welcome back" shows for brand-new users on first visit;
  consider a first-visit variant.

---

## Horizon watch — legal landscape (queued 2026-08-01)

Monitoring items from the 2026-08-01 primary-source review cycle. Nothing
here is law yet; nothing changes any encoded rule.

- **EU Digital Omnibus PROPOSAL** — floats GDPR amendments including
  breach-notification changes. Not law; monitor. If enacted, re-run the
  EU/UK intake against the amended text.
- **NY Department of State / Division of State Police source upgrades**
  `[task]` — the two `source_url`s in `data.js` remain agency homepages
  (`dos.ny.gov`, `troopers.ny.gov`). Locate each agency's actual
  breach-reporting page (live web research at implementation — deliberately
  NOT done in the 2026-08-01 documentation pass); if no reporting page
  exists, retain the homepage with a note in intake §7.11.

---

## Deferred — revisit when membership revocation / role management lands

- **Widened `organizations` SELECT policy trade-off.** The
  `organizations_select_member` policy was widened (migration
  20260622204148) to `is_org_member(id) or created_by = (select auth.uid())`
  so a creator can read back a just-created org before the AFTER INSERT
  trigger's membership row is visible (fixes the insert().select() 42501).
  Consequence: a user removed from an org they originally created could still
  read that org's row via the `created_by` branch. Harmless until membership
  revocation or role management exists; revisit the SELECT policy at that
  point. Full context in the migration file and CLAUDE.md.

- **Working-tree noise needs a .gitignore decision.** `.claude/*`,
  `scripts/*`, and `sample-incident-memo.pdf` sit untracked and clutter every
  `git status`. Decide per item whether it belongs in `.gitignore` or in the
  repo, so the tree reads clean. `scripts/_dump-pdf-text.mjs` added
  2026-07-26 as an untracked scratch utility (PDF text dump via pdfjs-dist) —
  joins the known scratch pile.

---

## Completed

### 2026-07-16

- Cross-tenant RLS verification — **done** (2026-07-16). Verified in both
  directions via authenticated REST under each user's own session (reads bare +
  explicitly cross-filtered, org_members, profiles, cross-tenant insert
  rejected 42501, own-org insert OK). Policies introspected from pg_policies,
  not assumed.
- Onboarding-in-shell check — **done** (2026-07-16). Org-less user lands on
  onboarding inside AppShell; top bar title slot empty-safe; AccountMenu falls
  back to email; RequireOrg bounces /breach-clock back to /app; org creation
  adopts in place without reload.

### 2026-06-21

- Review-page artifact controls in a rail — **done**, reconciling the follow-up
  queued 2026-06-08 (now removed from the risk-assessment block above).
  **Download memo** / **Edit answers** live in a sticky right-hand actions rail
  on the review page (wide layout), pinned via `position: sticky` inside the
  right grid column (the same pattern as the form's section index); below the
  `md` breakpoint they collapse to a row at the top of the review content.
  Shipped 2026-06-13 in commit `13b846d` ("feat(review): sticky right-hand
  actions rail on the review screen"); this entry is the doc reconciliation
  only — no code change. File: `src/breach-clock/BreachClock.jsx`
  (`renderReviewActionsRail`).

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
