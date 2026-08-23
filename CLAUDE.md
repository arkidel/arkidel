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

**Protected files — explicit sign-off required.** Four files may not be edited
without surfacing the change and getting explicit confirmation first:
`src/breach-clock/data.js`, `src/breach-clock/engine.js`,
`src/breach-clock/facts.js` (protected as of 2026-08-22 — it decides the
instant the engine receives), and `docs/intake-forms.md`. Every other file in
the repo is ordinary engineering — edit it as normal. The per-file notes below
give the specific process for each.

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

**`RULESET_VERSION` (serverless bundle, JDC 2026-08-22).** `data.js` exports
`RULESET_VERSION`, a date-based string (`"2026-08-22"` at introduction). It
is bumped on **every** substance commit to this file — a `data.js` substance
diff without a `RULESET_VERSION` bump fails review. The engine carries it on
every computed result as `ruleset_version` (refusals included) and the memo
prints it in the generation footer ("Generated … · Ruleset 2026-08-22 ·
arkidel.com"), so any future API response identifies the rules it was
computed under. The `JURISDICTIONS` and `SENSITIVITY_OPTIONS` exports are
**deep-frozen** at module load; a runtime write throws.

### Citation standards (house rules, locked 2026-08-09)

**Bluebook T1 is the house citation standard** for all structured citation
fields (`statute`, `citation`, harmGate `citation`) across every surface.
One citation string set — screen and memo render the same strings; never
surface-condition or runtime-rewrite a citation. Reference forms:

- `Colo. Rev. Stat. § 6-1-716(2)(a)`
- `Conn. Gen. Stat. § 36a-701b(b)(1)`
- `Mass. Gen. Laws ch. 93H, § 3(b)` (note the comma; replaces `M.G.L.` style)
- `Del. Code Ann. tit. 6, § 12B-102(a)` (replaces `6 Del. C.` style)
- `N.Y. Gen. Bus. Law § 899-aa(2)(a)`
- `Cal. Civ. Code § 1798.82(a)` / `Cal. Health & Safety Code § 1280.15`
- `Tex. Bus. & Com. Code Ann. § 521.053(b)` (add `Ann.`)
- `Va. Code Ann. § 18.2-186.6(A)` (add `Ann.`)
- `23 N.Y.C.R.R. § 500.17(a)` (replaces `23 NYCRR`)
- `15 U.S.C. § 1681a(p)`
- `GDPR art. 33` / `UK GDPR art. 33` (order and case; instrument name
  distinguishes EU from UK — never a bare `Art. 33`)

Only Colorado is conformed and verified as of 2026-08-09; the remaining
forms above are the TARGET for each jurisdiction's own primary-source
conformance pass and must not be applied in bulk ahead of verification.

**First reference is per rendered surface, carried structurally**: the
jurisdiction-level `statute` field and per-obligation `citation` slots are
the full citations on every surface; prose (counsel notes, conditions,
deadline phrases) may then use short forms. In prose, bare `§` short forms
are permitted only in single-code jurisdictions. NY (Gen. Bus. Law /
23 N.Y.C.R.R.), CA (Civ. Code / Health & Safety), and VA (§ 18.2-186.6 /
§ 32.1-127.1:05) span two codes: retain the code name in prose there. EU/UK
prose must always carry the instrument name with the article.

**Pin precision**: cite the subsection that states the covered entity's
duty, not the parent (e.g., the CO AG duty pins § 6-1-716(2)(f)(I), not
(2)(f) — (f)(II) binds the AG, not the covered entity). Umbrella cites are
correct only where the statute itself cross-references at that level
(e.g., the § 6-1-716(3) safe harbors preserving notice "pursuant to
subsection (2)(f)").

**Hard constraint — no `" — "` in citation strings.** The memo render path
(memo-pdf-core.js) composes and re-splits basis lines as
`{citation} — {deadline_phrase}` on the `" — "` sequence. A citation string
containing that sequence silently corrupts basis-line parsing. Em-dashes in
prose fields are fine; in `statute`/`citation`/harmGate `citation` they are
forbidden.

### `src/breach-clock/engine.js` — rules engine

Pure JavaScript, no React. Contains `computeDeadlines(facts)`, `isHighRisk`,
`runTests`, and 121 test cases as of the serverless bundle (120 as of the
unknown-count pass, 111 as of the harm-gate pass, 96 as of the
category-conditioned pass, 60 as of the risk-assessment addition; every EU/UK
case carries an explicit `riskLevel`). After any engine change, the test
harness must pass — check the in-app Tests view (footer link in the rendered
component) or run programmatically, plus
`node scripts/adversarial-engine-tests.mjs` (91 cases).

**The engine is zone-free and refuses incomplete facts (serverless bundle,
JDC 2026-08-22) — durable decisions.** `computeDeadlines` receives
`awarenessDate` as one epoch instant, already resolved at the facts boundary
(`facts.js`, below) from the payload's `awareness` string and its declared
`awarenessTz`; the engine does **no** timezone math, ever — deadline
arithmetic stays millisecond offsets from that instant. Given incomplete
facts — `awarenessDate` not a valid `Date`, or no selected *modeled*
jurisdiction — it returns the **structured refusal**
`{ error: "incomplete_facts", missing: ["awarenessDate" | "jurisdictions"],
ruleset_version }` and **never** an empty obligation set: an empty result only
ever means "evaluated, nothing applies", and a malformed facts object can
never produce an empty-but-valid result (pinned by the `L. Refusal`
adversarial group). The form's completeness gate keeps the refusal off the
UI; the results page (`renderObligations` returns null and the component
logs), the memo core (throws rather than render), and the incidents list
(em-dash) all handle the shape defensively — none may render a green "no
obligations" state from it. The engine's number formatting (`threshold` /
`residentCount` phrases) is locale-pinned to `"en-US"`; it formats no dates.
Pass-2 dependent-clock association uses a side table (`internals` Map keyed
by entry identity) — output entries carry no `_jurId` / `_deadline*` fields,
pending entries included.

The engine is the correctness instrument for the substantive layer. If a
test fails after a `data.js` edit, the substantive change is wrong, not the
test.

**Guard convention (JDC, 2026-08-02): enumerate every suite by name.** Any
pre-push, gate, or "suites green" claim runs EVERY suite the repository has,
listed by name with each count — today: (1) the engine in-file harness
(`runTests`, 121), (2) `scripts/adversarial-engine-tests.mjs` (91), (3) the
vitest suite (`npm test`, 17 files / 151 tests), (4)
`scripts/render-gate-memo.mjs` (8 fixtures). Never "both suites"
or "the tests" — an unenumerated guard once let the vitest suite sit red for
nine days. When a new suite is added, add it to this enumeration.

**Risk assessment gates the EU/UK obligations (live as of `cdcd93d`).** Risk is
an explicit *user* input — `riskLevel`, one of `"unlikely" | "risk" | "high"`,
default unset (`""`) — **not** inferred from the data categories.
`isHighRisk(sensitivity)` **no longer gates anything**; it survives only to drive
the UI's non-binding "Suggested" hint on the high-risk option (see the UI
section). In `data.js`, the EU/UK Art. 33 authority notification declares
`gating.riskRequired` and the Art. 34 individual notification declares
`gating.highRiskRequired` (now satisfied by `riskLevel === "high"`), each paired
with a `riskSuppression` field. `computeDeadlines` evaluates risk gating
**before** the encryption check and returns the **`pending`** bucket alongside
`deadlines` and `suppressed` — and, since the encryption decomposition, a fourth
**`review`** bucket (see the quad-state invariant below). The three states, per
`riskLevel`:

- **unset (`""`)** → both GDPR obligations are **pending** — neither fired nor
  suppressed; the engine is waiting on the controller's assessment.
- **`"unlikely"`** → Art. 33 suppressed (basis Art. 33(5)) and Art. 34 suppressed
  (high-risk threshold not met), both via the new `suppression_type:
  "risk_assessment"`.
- **`"risk"`** → Art. 33 fires (72h from awareness); Art. 34 risk-suppressed.
- **`"high"`** → both fire (Art. 34 has no fixed-hour deadline). Because risk
  gating runs first, a not-`"high"` Art. 34 is risk-suppressed, never
  encryption-suppressed; an Art. 34 that *does* fire is still subject to the
  Art. 34(3)(a) unintelligibility exemption — now driven by the explicit
  `gdprUnintelligibility` input (see the encryption model below).

US-state obligations gate on `residentThreshold` only and are untouched by risk
— which is exactly what makes mixed results correct (next paragraph).

**Encryption is modeled per obligation, not by a global switch (live as of the
encryption decomposition; build-of-record: the "Encryption gate build plan"
addendum in `docs/todo.md`).** The former global `encryptionApplied` boolean is
gone. Each obligation declares its safe harbor as data — a `conditionalGates`
entry the engine interprets — so encryption routing differs by jurisdiction and
**intentionally produces mixed results on one page**: e.g. CA suppressed / CO
fired / MA counsel-review / EU-UK Art. 34 exempt, all in the same incident. This
**supersedes the old global-switch "no mixed states" rule** — that rule was a
property of the single switch, which no longer exists. (The separate
GDPR-pending-while-US-fires carve-out from risk gating still stands; mixed
*encryption* outcomes are now also correct and expected.)

Per-jurisdiction encryption routing, as encoded in `data.js`:

- **CA / TX / CO / NY** — suppress when the data was encrypted and the
  key/credential was not also acquired (`safeHarbor`, `defeatedBy: keyAcquired`).
  Unencrypted, or key-acquired, → fires.
- **VA** — two harbors per obligation: encryption (`defeatedBy: keyAcquired`)
  **and** redaction (`input: redacted`, `defeatedBy: reidentificationAcquired`);
  either satisfied → suppress (mirrors § 18.2-186.6(A)'s "unencrypted or
  unredacted" scope).
- **MA** — routes to **counsel review, not suppression** (`onSatisfied: "review"`,
  `requiresStrength: "ge_128"`): the § 1 encryption harbor needs 128-bit-or-higher
  with the key uncompromised, but § 3(b)'s second trigger has no encryption
  qualifier and must be independently assessed, so encryption can never *silently*
  excuse MA. Anything short of the harbor (unencrypted, below-128, unknown/unset
  strength, key acquired) → fires.
- **EU / UK** — Art. 34 individual notification is exempted via the explicit
  `gdprUnintelligibility` input (Art. 34(3)(a); no 128-bit floor). Art. 33
  supervisory-authority notification is **never** encryption-exempt.

**The generic conditional-gate seam.** Encryption is the first full consumer of a
general per-obligation seam: each obligation carries `conditionalGates` with
`role: "fireCondition"` (a precondition; an unset input → `pending`) or
`role: "safeHarbor"` (an affirmative excuse; `onSatisfied: "suppress" | "review"`).
The engine evaluates them per obligation — fireConditions before the
resident-threshold check, safeHarbors after — and is maximally conservative: any
unset/partial value along a harbor chain leaves the harbor unsatisfied, so the
obligation fires rather than being silently excused. The EU/UK risk gate is
re-expressed through this seam (behavior-preserved); the harm gate and the NY
inadvertent-disclosure exception are designed-for future consumers. Full design
and staging is the addendum in `docs/todo.md`.

**`riskLevel` fails safe to pending (live as of the riskLevel-hardening
commit).** The engine treats `riskLevel` as valid only when it is exactly one of
`VALID_RISK_LEVELS` (`"unlikely" | "risk" | "high"`). Anything else — unset
(`""`), or an invalid value that could survive a serialization round-trip
(`undefined`, `null`, `0`, `false`, `"High"`, `" risk "`, any unknown string) —
routes to **pending**, identical to unset, never to suppression. This is a
deliberate fail-safe: suppressing a GDPR obligation tells the user no
notification is required, and that determination must never rest on an
unrecognized value. The UI only ever emits the three sentinels or `""`, but the
engine does not assume that. Do not "tidy" the gate back to an unset-only check
(`riskLevel === ""`) — the `VALID_RISK_LEVELS.includes(...)` form is the
safety property. Covered by the `E. riskLevel` group in
`scripts/adversarial-engine-tests.mjs`.

**Harm-assessment gate (live as of harm-gate commit 1, 2026-08-02) — durable
decisions, do not "fix".** `harmAssessment` is an explicit user input —
`"" | "determined_unlikely" | "harm_likely"`, default unset — with
**attestation semantics**: the answer attests that a documented determination
under the applicable statutory standards exists; the tool never draws a harm
conclusion, and **harm and risk never prefill each other**. `harmGate` is
**per-obligation** data in `data.js` (`{ standard, citation, character }`),
standards **verbatim per statute** — Colorado deliberately encodes TWO
different standards (residents/CRA § 6-1-716(2)(a) vs AG § 6-1-716(2)(f)(I));
never share one string. An **absent `harmGate` means the answer is inert** for
that obligation (CA/TX/NY/MA/EU/UK) — enforced by field absence, no engine
special-casing; NY and MA instead carry a jurisdiction-level
`harmNonGateExplainer` (rendered when a harm determination is recorded; the
MA explainer cites **M.G.L. c. 93H §§ 1, 3(b)** per JDC ruling 2026-08-02 —
the trigger-two bypass lives in the owner/licensor duty at § 3(b), not
§ 3(a)). `"determined_unlikely"` is the **only** suppressing value — `""`,
`"harm_likely"`, and any invalid value change nothing in computation (the
fail-safe direction is the opposite of `riskLevel`'s pending: computing is the
conservative outcome here). Harm suppression joins the existing `suppressed`
bucket with mechanism `{ type: "harm", standard, citation, character }` in the
additive `suppression_reasons` array; an obligation suppressed by both
encryption and harm stays **one** entry with both reasons (flat fields mirror
the first, encryption). VA's `character` is `"duty_element"` — rendering must
present a **negated duty element, not an exemption**. Harm-excused CT/DE
service obligations land in `suppressed` with their own gate's mechanism (CT
cascades via the resident (b)(1) standard; DE carries the express
§ 12B-102(e) carve-out) — deliberately unlike the silent encryption-harbor
treatment of services. Covered by the "Harm gate" in-file group and the
`J. Harm` adversarial group.

**Unknown resident counts and the `contingent` bucket (live as of the
2026-08-15 intake phase 2 pass; JDC sign-off).** `residentCountUnknown` is an
explicit user input — a sparse `{ [jurId]: true }` map written by the form's
per-jurisdiction "Count not yet known" toggle, absent key meaning nothing
claimed (old payloads need no migration). A threshold-gated obligation whose
jurisdiction carries the flag and has **no numeric count** is held as
**contingent** instead of being dropped: live but for a count that has not been
established. Three ordering rules, all pinned by tests:

- **Suppression and review outrank contingency.** The harbors, the harm gate,
  and the conditional gates are evaluated first; an obligation affirmatively
  excused lands in `suppressed` (or `review`) exactly as it would on a known
  above-threshold count — never in `contingent`. An excused obligation is not
  merely uncertain.
- **A numeric count always beats the flag.** The UI clears one when the other is
  set; the engine enforces it anyway so a stale flag riding a saved payload can
  never override a real count. `0` is an established count, not an unknown one.
- **A known below-threshold count is unchanged** — silently absent, in no
  bucket.

Each entry is `{ jurisdiction, authority, threshold, comparator,
conditional_deadline, condition, citation, source_url, statute }`.
`conditional_deadline` is the obligation's own clock math run **as if** the
threshold were met, including pass-2 dependent clocks (CA AG = the conditional
resident deadline + 15 days), and is `null` where the obligation has no fixed
clock. `condition` is composed in counsel register from the threshold and its
**exact** comparator — `"Notice is required if {more than N | N or more}
{jurisdiction} residents are affected."` — never approximated. The sentence is
deliberately authority-less (Phase 2.1, JDC 2026-08-16): the authority already
titles the card on both surfaces, so naming it in the sentence duplicated the
heading and would have required per-authority article data. Both
surfaces render the group in one fixed within-block position — active deadline
cards → **Contingent Deadlines** → counsel review → suppressed → notes — under
the shared `CONTINGENT_LABEL` / `CONTINGENT_EXPLAINER` strings exported from
`results-grouping.js`. The memo's contingent right slot is qualified ("If
required, due …") and never routed through the unconditional-Ember deadline
rule: it renders Mist while the conditional date is not yet past and Ember
once it is (Phase 2.1; pastness is judged at `generatedAt`), because nothing
in the group is firm. On screen, dated contingent cards carry a "Contingent
on resident count" badge and the same qualified due line — see the Mist
contingent-state semantic in the brand palette section. On the Respond home
list the Next-deadline
column is about firm deadlines; a contingent nearest date renders
"≤ {date} · contingent" and never takes the overdue treatment.

**Three deliberate engine assumptions — durable decisions, do not "fix".**

- **Awareness-anchor for determination-states.** Texas and Colorado statutes run
  their notification clocks from "determination that a breach occurred," but the
  engine anchors *all* deadlines to `awarenessDate`. This is a deliberate
  conservative choice — awareness is at-or-before determination, so the computed
  deadline is never later than the statute allows. The per-obligation
  `deadline_trigger` strings (e.g. "determination of breach", "discovery of
  breach") are descriptive labels only; they do **not** feed the date math. The
  one structural exception is California's AG obligation, which is a dependent
  deadline (`deadline_relative_to`) resolving to awareness + 45d — still
  transitively awareness-anchored.
- **Millisecond-arithmetic conservatism.** Deadlines are computed as
  epoch-millisecond offsets (`awarenessDate.getTime() + hours * 3600 * 1000`),
  which is DST-, leap-year-, and month-boundary-proof and lands at-or-before the
  end of the statutory final day — conservative versus calendar-day counting.
  Deliberate; the adversarial harness's `D. Time` group pins this (spring-forward,
  fall-back, end-of-month, leap February, sub-second).
- **Quint-state invariant** (was quad-state until the 2026-08-15 unknown-count
  pass). `computeDeadlines` returns **five** outcome buckets — `deadlines`,
  `suppressed`, `pending`, `review`, and `contingent` — and every obligation that
  is evaluated lands in **exactly one**. A threshold failure on a **known** count
  is still outside all five (silently absent), and `services` / `advisories`
  remain additive output outside the invariant. `review` means the obligation's
  outcome turns on a substantive legal judgment the engine does not make
  (currently only MA's § 3(b) second trigger; the harm gate and the NY
  inadvertent-disclosure exception will also produce it). The earlier
  "unreachable tri-state" no longer holds: because encryption is routed *per
  obligation*, combinations once impossible **do** co-occur in one result — e.g.
  firing + suppressed + review (a US state fires, EU/UK Art. 34 is exempt, MA is
  in review), or firing + pending (a US state fires while EU/UK await a risk
  assessment). The results page and PDF memo must render any combination of the
  five; do not assume mutual exclusivity. (All five at once is currently
  unreachable — `review` arises only through MA's encryption harbor, and those
  same facts suppress every other US state — but that is a property of the data,
  not of the invariant; the adversarial `K. Contingent` group spans the five
  across two scenarios.)

**Notification-record durable decisions (2026-07-24).** Notification records
are non-evaluative: dates only, no computed lateness deltas, on screen or in
PDF. Moss is reserved exclusively for obligations with a computed due date
where notified_on is at-or-before it; a recorded notification on a
no-fixed-deadline obligation ("without unreasonable delay" and kin) renders
the neutral Mist/Ink treatment — Moss there would assert timeliness under a
substantive standard the tool does not evaluate. Memo due dates are always
Ember regardless of status. Memo incident-log filtering is silent. Memo
section order: the Notification Record (Authority/Due/Notified table) renders
after the deadline analysis; the Incident Log renders after the incident
report — on screen the Incident Log likewise sits after the incident-report
recap, before Further Considerations. notifications/incident_log JSONB never
enters facts or the engine. **Stripe semantics (corrected 2026-07-26;
documentation-only — no code change, the app was always right).** An earlier
reading of this entry overstated "live = Ember." The shipped semantics: the
base (live) deadline card carries the **Midnight** stripe; `.urgent`
(deadline within 24h) is the Ember stripe on the cream `#FBF5EE` surface;
`.missed` (overdue) is the Midnight surface with the Ember stripe; recorded
cards are **Moss** (notified at-or-before a computed due date) or **Mist**
(notified after due, or no computed due date); closed incidents render Mist
static treatments throughout. Ember on live cards is an **urgency signal**,
never the live default.

**Due-label durable decision (2026-07-25).** Deadline right slots (UI countdown
secondary + memo card slots) carry an inline "Due " label; memo right slots are
uniformly Ember for dates and phrases; composition is "Due {statutory phrase}"
so the queued phrase repair swaps under the prefix. Recorded/closed Mist due
lines stay demoted and unlabeled beyond their existing "Due" text.

**Category-conditioned durable decisions (2026-07-25 review; landed
2026-07-26, commit 1 of 2 — data/engine/tests/intake only; service/advisory
rendering is commit 2).** Data categories: standalone `ssn` element (SSN /
ITIN / other taxpayer IDs); `gov_id` excludes SSN (relabelled "Government IDs
(passport, driver's license, state ID)"). The canonical category list is
`SENSITIVITY_OPTIONS` in `data.js`; the UI adopts it in commit 2.
`gating.categories` is an `{ anyOf: [...] }` array-membership gate (object
form reserves allOf/noneOf), AND-composed with resident thresholds.
Statutory deadline phrases live per-obligation in `data.js`
(`deadline_phrase`); the engine composes the basis as
`{citation} — {deadline_phrase}` — no hardcoded phrases in `engine.js`
(pinned by the adversarial harness's source-grep case). Service obligations
(`kind: "service"`) display statutory duration units — "2 years" CT, "1 year"
DE, "18 months" MA — and land in the additive `services` output array;
declared advisories (`kind: "advisory"`) and the auto-generated conditional
advisories land in the additive `advisories` array; neither ever enters
deadlines/suppressed/pending/review (a service whose encryption harbor is
satisfied simply does not compute — the jurisdiction's notification cards
carry the explanation). Entity-type conditions (e.g. MA's 42-month
consumer-reporting-agency variant) stay in conditional language, never
inputs. User-facing terminology: **computed**, not fired ("fires" survives in
engine internals/tests only). Advisory state: category-gated obligations
render advisories (reason `ssn_unconfirmed`) when `gov_id` is present without
`ssn`; no advisory when neither is present. Connecticut's § 36a-701b(a)
encryption exclusion has NO statutory key-compromise proviso, but the gate
deliberately keeps the canonical `defeatedBy: keyAcquired` shape
(conservative — an acquired key computes rather than silently excusing);
the `ct-no-key-proviso-36a-701b-a` counsel note documents the difference —
do not "fix" the gate to match the literal statute without JDC sign-off.

**Service / advisory rendering durable decisions (2026-07-26, commit 2 —
mocks ratified by JDC).** Service cards: Midnight stripe (the deadline-card
idiom), a "Service period" right slot, statutory duration units spelled out
verbatim from `service_duration_display` ("2 years", "1 year", "18 months" —
never abbreviated), a Mist "minimum · runs with notice" sub-line, **no**
record-notification affordance, **no** countdown, **no** Ember anywhere, and
no dark variant (services have no overdue concept); closed incidents render
them unchanged. Advisory cards: white with a 1px dashed border and Parchment
stripe, alert-triangle glyph; auto-advisories (reason `ssn_unconfirmed`)
carry the "Edit data categories" jump **on screen only** — declared
advisories are guidance and carry no link. Auto-advisory title/body copy is
composed once, in `results-grouping.js` (`advisoryDisplay`), shared by both
surfaces. Memo: service right slots render Ink "{duration} (minimum)" and
are **never** routed through `formatDeadline` (no "Due " prefix) — the
2026-07-25 uniform-Ember rule is scoped to deadline slots; advisories print
in the counsel-note idiom (title, body, citation; the edit link never
prints). The memo's no-fixed-clock deadline slot composes "Due {statutory
phrase}" recovered from the basis line (`basisPhrase`) — do not reintroduce
a hardcoded phrase there. The Q1 category checkboxes render from the
canonical `SENSITIVITY_OPTIONS` export in `data.js`; the former local copy
in `BreachClock.jsx` is deleted — do not reintroduce it.

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
  `sensitivity`; encryption → the per-obligation cluster (`encrypted` /
  `encryptionStrength` / `redacted` / `keyAcquired` / `reidentificationAcquired`)
  plus the GDPR `gdprUnintelligibility` input (the former single
  `encryptionApplied` boolean is retired — see the encryption model above). They're grouped under
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
  counsel notes (awareness, Q1, encryption, and — when an EU/UK jurisdiction is
  selected — risk assessment). The notes **flow in normal document
  order** — nothing pinned, nothing sticky, and no JS-measured anchoring (the
  earlier `useLayoutEffect` + `ResizeObserver` positioning was removed). This is
  by design: do not re-pin or re-anchor the rail. Each note is titled with a bare
  **topical header naming its field** — "Awareness", "Data categories",
  "Encryption", "Risk assessment" — in sentence case; the visible title deliberately carries **no**
  "counsel" / "counsel's note" wording, which can imply legal advice is being
  given (the internal `.counsel-note` class and `counselNotes` identifiers may
  stay). A hairline vertical rule divides the columns. Below the `md` (768px)
  breakpoint the layout collapses to one column: notes render inline beneath
  their fields. **One rail note is not field-anchored:** the "Incident vs.
  Breach" note (`renderIncidentVsBreachNote`) is rendered inside `railControls`,
  directly below the "Breach Clock" deadlines-only toggle and above the
  field-anchored notes — so on narrow screens it stays with the controls rather
  than flowing inline. It was relocated there from a former full-width
  top-of-page parchment banner; its body is substantive legal copy (the
  incident-vs-personal-data-breach distinction) and must be preserved verbatim.
  Its header is deliberately **Title Case** ("Incident vs. Breach"), unlike the
  sentence-case field headers above — it names a legal distinction, not a field,
  so the sentence-case rail-title convention does not apply; do not "correct" it.
  The masthead above the form ends in a **single hairline rule** (the former
  on-ramp disclaimer sentence — "For preliminary triage purposes only…" — was
  removed; the "PRELIMINARY — NOT LEGAL ADVICE" eyebrow on the descriptor row and
  the global footer disclaimer in `Layout.jsx` now carry that function).
- **Checkbox-row selection idiom.** Every selection control — jurisdictions, Q1,
  type-of-incident, the CIA data-security principles, the data-element
  checklists, the tri-state encryption-cluster / risk / unintelligibility rows,
  and the boolean toggles (quick mode, "not available")
  — uses one `.check-row`: a prominent always-visible square checkbox + a
  clickable, hover-lit, keyboard-operable (`role="checkbox"`, space/enter) row.
  Dropdowns, text, textarea, and number inputs keep their plain styling (for
  the select, that is its closed box; its open pane is themed separately via
  base-select — see the next bullet).
- **Select dropdown theming (`appearance: base-select`, progressive
  enhancement).** `.form-select` is built in **two deliberate layers — do not
  collapse them**. (1) **Fallback baseline** — every browser's closed box, and
  the complete control in browsers without base-select (stable Safari and
  Firefox as of mid-2026): `appearance: none` with all three vendor prefixes
  (`-webkit-`, `-moz-`, standard) plus the custom CSS chevron
  (`background-image`). Do **not** remove this as redundant — it *is* the
  fallback; the three prefixes have been present since `06cc7ec`, which resolved
  the Safari double-caret concern. (2) **Enhancement**, wrapped in `@supports
  (appearance: base-select)` so non-supporting browsers skip it entirely:
  `appearance: base-select` on `.form-select` and `::picker(select)`, then
  themed `::picker(select)` (the pane), `option` (with `:hover` + `:checked`),
  `::checkmark`, and `::picker-icon`. Two details inside the `@supports` block
  are **intentional, not bugs to "fix"**: the fallback `background-image`
  chevron is removed and `padding-right` restored, with `::picker-icon` taking
  over the caret — that is what prevents a *double* caret in base-select mode;
  and there is **no** `<button>`/`<selectedcontent>` markup — a plain
  `<select>`/`<option>` is used because no custom closed-state content is needed
  (don't add it unless rich closed-state content is actually required). Every
  pane/option value is pulled from existing form tokens (the input `#fff`
  surface, the inputs' `rgba(27,42,63,0.25)` hairline, `8px` radius, the
  tooltip-popover shadow, Inter, ink `#2C2418`, the `.check-row` hover tint
  `0.05`, a stronger `:checked` `0.10`, a Midnight `#1B2A3F` checkmark) — keep
  any future values token-derived, don't invent. Why progressive enhancement:
  base-select is stable in Chrome/Edge, but Safari has it only in Technology
  Preview and Firefox behind a flag (mid-2026), so supporting browsers get the
  themed pane and the rest fall back to the native one.
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
- **Compute/persist unification (JDC rulings 2026-08-02) — durable
  decisions.** Submit & compute persists atomically (payload + transition,
  one call — `updateIncident` takes an optional `status` for the single
  PATCH; a never-saved form is created active in one insert, quick mode
  included) and never renders results on failed save — the failure path
  stays on the form with the save-error treatment; results render only
  after confirmed persistence. Memos always compute fresh from current
  facts at generation time (`handleDownloadMemo` re-runs the engine; never
  a cached results state). A quiet Parchment staleness banner renders on
  results when facts have changed since the displayed compute
  (dirty-since-compute, implemented as a facts-signature comparison so a
  Back-to-results that reverts to the exact computed facts never
  false-alarms); it never renders immediately post-submit. Back-to-results
  (ghost affordance beside Save, both modes) discards unsaved in-memory
  edits — revert to last-saved payload — without save or status
  transition, and renders only when a computed results state exists.
  Closed-resubmit reactivates without prompt (Back is the non-mutating
  exit). Save alone is unchanged — it parks a draft without computing and
  never transitions status. OPERATIONAL NOTE FOR GATE-RENDERS: memory-only
  fixture edits no longer survive Submit — gate-render fact patterns must
  use disposable incidents or revert edits explicitly; the pre-2026-08-02
  technique of submit-without-save is gone by design.
- **Quick mode** is a focusing view over one shared state, not a separate
  workflow — it shows only the operative fields; entered record data persists
  across toggles.
- **Q1 renders all eleven sensitivity options with their exact IDs** (ten
  original plus the standalone `ssn` added 2026-07-25), from the canonical
  `SENSITIVITY_OPTIONS` export in `data.js`. `location` and `communications`
  are kept (they are not high-risk, so `isHighRisk` classifies them out and
  they never raise the "Suggested" hint) rather than dropped — removing
  user-facing data categories would be a substantive reduction, and the IDs
  must match the set `isHighRisk` treats as high-risk.
  Note Q1/`sensitivity` no longer feeds any deadline gating directly — the EU/UK
  obligations gate on the explicit `riskLevel` input, not on the categories (see
  the engine section); `sensitivity` drives only the UI hint and the
  element→Q1 cross-check.
- **Harm-assessment question + rendering (harm-gate commit 2, 2026-08-02) —
  durable decisions.** The harm question renders **conditionally on harm-gated
  jurisdiction selection** (any selected jurisdiction with an obligation
  carrying `harmGate` — via `harmGatedJurisdictions` in
  `results-grouping.js`), as its own conditional section after the EU/UK risk
  section (number slides 07/08 depending on whether Risk renders; anchor
  `#form-harm`). Three single-select check-rows persist `harmAssessment`
  ("Not assessed" is the `""` default); **risk and harm never prefill each
  other**. The rail "Applicable standards" card is **data-driven from
  `harmGate`** (never hardcoded): one entry per distinct standard per selected
  jurisdiction, verbatim in quotes with its citation — Colorado renders two
  entries tagged Residents / AG. Results: harm-suppressed obligations render
  in the suppression idiom under the group label **"Suppressed — harm
  determination"** with per-row verbatim standards (3-line clamp) and the harm
  citation in the right slot; rows whose mechanism `character` is
  `"duty_element"` (VA) take the **"Duty element not established:"** framing
  instead of the exemption framing; the group closes with the admonition
  footer ("Document the determination contemporaneously…"). Mechanisms are
  read from `suppression_reasons` (never by index — encryption owns the flat
  fields on double-suppressed rows, whose encryption line stays above the
  standard). The **NY/MA still-computing explainer card renders once**
  (dashed advisory idiom), only under `determined_unlikely` with NY/MA
  selected, directly above the first NY/MA block; composition is shared with
  the memo via `harmNonGateDisplay` (lead order NY before MA per the ratified
  mock). The **memo mirrors the screen** including the standards: Analysis
  Inputs gains conditional Risk/Harm rows (labels from the shared
  `RISK_LEVEL_LABELS` / `HARM_ASSESSMENT_LABELS` maps), the harm-suppressed
  cards print standard + citation + framing + footer, and the explainer prints
  in the counsel-note idiom — **no new Ember anywhere; suppression stays
  quiet**. `""` and `"harm_likely"` change no card rendering (pinned by the
  memo gate's text-parity fixture).
- **EU/UK risk-assessment section (conditional, `renderRiskAssessment`).** A "07
  Risk Assessment" section renders **only when an EU/UK jurisdiction is
  selected** — appended at the end in full mode (after Measures, so the six fixed
  sections keep their numbers; Measures stays 06) and placed right after the
  encryption question in quick mode. Both anchor `#form-risk`. The control is
  three **mutually-exclusive `checkRow`s used as radios** (there is no separate
  radio idiom in this form): clicking one sets `riskLevel` and clears the others;
  selected = `riskLevel === value`; `""` = none selected, and an unset assessment
  deliberately does **not** block Submit (it surfaces post-submit as the pending
  card). When `isHighRisk(sensitivity)` is true, the "high" option carries a
  quiet, non-selecting "SUGGESTED" mono tag (parchment chip) and the rail/inline
  risk note names the triggering categories — a hint only; the determination is
  the user's. The conditional section is wired into the left section index and
  the IntersectionObserver via a **derived `indexSections`** (the six fixed
  `FORM_SECTIONS` plus the "Risk" entry when eu/uk is selected); the positional
  `FORM_SECTIONS[n].id` references on the fixed sections are left untouched.
  Result side: the `pending` bucket renders as **one consolidated "Risk
  assessment required" action card** at the top of the obligations (not one per
  obligation), with a "Complete risk assessment" button that returns to the form
  and scrolls to `#form-risk`; while pending, both zero-state banners are
  suppressed. The green "no obligations fire" banner and the suppressed-card
  copy are reason-aware (risk-assessment vs. encryption vs. mixed), and the
  review's Analysis-inputs recap gains a "Risk assessment" row.
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
- **Results page (JDC rulings 2026-08-23): the deadline queue carries dated
  rows only (firm and contingent-with-date); no-fixed-deadline obligations
  compress to a counsel-register summary line at the queue foot. Analysis
  Inputs renders in the sidebar; the queue is the first main-column element.
  Countdown precision degrades with magnitude (d / d+h / h+m / live m+s under
  1h) on a shared 60-second interval, per-second only under 1 hour.
  Contingent counters are Ink always; only the If-required qualifier line and
  the queue date cell take Ember once the conditional date passes.
  Auto-expand is capped at the single most urgent block above the
  3-jurisdiction threshold (replaces the firm-overdue exception); persisted
  expansion wins, and resubmit clears persisted expansion while keeping the
  block-order choice.** The memo is untouched by these rules (it has no
  deadline table). Pure helpers: `buildDeadlineQueue` / `noClockSummaryLine`
  in `results-grouping.js`; `countdownTier` / `formatCountdown` in
  `countdown.js` (pinned at the tier boundaries by `countdown.test.js`); the
  per-element `Countdown` component in `BreachClock.jsx` owns the only
  per-second interval. Persisted expansion lives in
  `incidents.view_state.expanded` (a sparse `{ [jurId]: boolean }` overrides
  map beside `blockOrder` — no schema change, the column is jsonb), written
  through on every expand/collapse and cleared by Submit & compute only.
  - **Block-order toggle (A–Z | Urgency; Urgency is the DEFAULT on both
    surfaces — JDC amendment 2026-08-21).** A segmented control in the review
    actions rail (above Download memo; with the top controls on narrow).
    Urgency: blocks with active obligations by earliest fixed-clock deadline
    (all-undated active blocks after the dated ones), then contingent-only
    blocks by earliest conditional date, then blocks with neither; ties
    alphabetical throughout. That order is **one shared comparator**,
    `compareBlocksByUrgency` in `results-grouping.js`: `groupResultsByJurisdiction`
    sorts its output with it (so the memo prints it — the
    `CROSS_BLOCK_URGENCY_FIRST` knob now routes through it), and the screen's
    default view re-applies it via `orderBlocks` — **screen-default/memo
    parity is structural, not conventional; do not fork the comparator per
    surface** (pinned by the parity test in `results-grouping.test.js`). The
    default applies at every load and in the ≤3-jurisdiction expanded regime
    alike. A–Z (jurisdiction name) is the screen's SECONDARY view and the
    only way the two surfaces diverge. The comparators read only deadline
    timestamps and names — NEVER `now` — so the order can change only on
    toggle or on a fresh compute, never on a countdown tick. The toggle is
    **persisted per incident in `incidents.view_state`** (jsonb, migration
    `supabase/migrations/20260822120000_add_view_state.sql`, applied
    2026-08-22 — this closes the results-at-scale rider that had left the
    choice session-local pending a schema change). `view_state` sits
    **beside the payload, never in it**: payload is facts only and must stay
    byte-identical whether the toggle was ever touched (pinned by test —
    the assertion now also checks that `view_state` changed while payload
    did not); notifications / incident_log are legally meaningful records
    and keep their own shapes. Shape: `{ blockOrder: "az" | "urgency",
    expanded?: { [jurId]: boolean } }` (the persisted vocabulary; the component's in-memory value stays
    `"alpha" | "urgency"` for `orderBlocks`, translated only at the
    `BLOCK_ORDER_TO_VIEW_STATE` / `blockOrderFromViewState` boundary in
    `BreachClock.jsx`). **An empty object means the default** — the column's
    `'{}'` default IS the Urgency semantics, so `createIncident` never
    threads `view_state` through and no backfill was run. Writes go through
    `updateIncidentViewState` (`src/data/incidents.js`) on the
    incident-log write-through pattern — optimistic, rolled back on failure,
    surfaced in the existing `saveError` slot — **on change only, never on
    load**; load applies a present `blockOrder` and falls to Urgency on an
    empty or unrecognized value. Per-incident isolation, load-apply,
    empty-default, and write-on-toggle are pinned in
    `BreachClock.resultsScale.test.jsx`. **View-only writes do not bump
    `updated_at`** (JDC ruling 2026-08-22): the same migration replaces the
    `incidents_set_updated_at` trigger with a `WHEN` clause that compares
    the row minus `view_state` (and `updated_at`), so a `view_state`-only
    UPDATE leaves `updated_at` untouched while any other column change —
    including every future column, substantive by default — still bumps
    it. Trigger-enforced, not client-enforced; the vitest suites mock the
    Supabase client, so this is verified by SQL against the linked project
    (see the commit), not by a client-side test.
  - Covered by `results-grouping.test.js` (pure ordering/queue contracts) and
    `BreachClock.resultsScale.test.jsx` (render-level behavior).

### `src/breach-clock/facts.js` — shared facts mapping and completeness gate

Protected as of the serverless bundle (JDC 2026-08-22): changes to it decide
what instant the engine receives, so it takes the same surface-and-confirm
process as `engine.js`. It is the single source for (a) resolving the
awareness datetime-local string **and its declared zone** to an instant
(`resolveAwareness`; `parseAwareness` survives as the legacy viewer-zone
parse), (b) the completeness gate (`computableGate` — awareness resolved and
non-future, ≥1 jurisdiction, ≥1 Q1 type → `canCompute`; plus
`canSubmit` = `canCompute` AND a declared zone whenever awareness is set —
`canSubmit` IS the editor's Submit gate, `canCompute` drives the silent
rehydrate auto-compute and the list column), and (c) the payload→engine-facts
mapping (`factsFromPayload`, over the exact shape `buildPayload` writes). Both
the editor (`BreachClock.jsx`) and the Respond home list's Next-deadline
column consume these — do not reintroduce local copies of any of the three;
that divergence is what this file exists to prevent. Pure functions, no
React, no engine imports (it imports the zone primitives from `timezone.js`).

**Awareness semantics (serverless bundle, JDC 2026-08-22) — durable
decisions.** The payload carries `awareness` (the datetime-local string) and
its sibling `awarenessTz` (an IANA id, e.g. `"America/Chicago"`); both are
stored, neither is derived at read time. The **user specifies the zone** —
the form's selector (adjacent to the awareness input; common US zones grouped
first, full IANA list below) prefills the reading device's zone only as a
visible, editable suggestion — and awareness is **never interpreted from the
reading device**. The pair resolves to one epoch instant **once, at this
boundary**; the engine is zone-free. Resolution lives in
`src/breach-clock/timezone.js` (`zonedWallClockToInstant`: the Intl
`formatToParts` round-trip, no runtime dependency, deterministic across
hosts). **DST rule — earliest instant wins, both directions:** a fall-back
ambiguous wall time resolves to its first occurrence (daylight offset; e.g.
01:30 on 2026-11-01 in Chicago → 06:30Z, not 07:30Z); a spring-forward
nonexistent wall time resolves to the earlier of the two offset candidates
(02:30 on 2026-03-08 in Chicago → 07:30Z, i.e. 01:30 CST, not 08:30Z). Why:
every deadline is awareness + N hours, so an earlier awareness can only make a
computed deadline earlier — the conservative direction, consistent with the
engine's awareness-anchor assumption. Pinned by `timezone.test.js` and
`facts.test.js`. **Display rule (ruling B):** every rendered deadline time —
screen cards, the deadline queue, contingent qualifiers, the collapsed-block
date line, the Notification Record due text, the memo — shows in the
**incident's declared zone with a zone label** ("Due 9/30/2026, 10:00 AM CT"
on screen; "Due September 30, 2026 at 10:00 AM CT" in the memo), through the
`timezone.js` formatters (`formatDateTimeInZone`, `formatDateInZone`,
`formatLongDateTimeInZone`; the label is the en-US generic short form where
compact — CT/ET/PT/MST/HST/AKT — else the offset form, e.g. GMT+1, with UTC
pinned). No viewer-zone times anywhere in incident output. **Legacy (ruling
C):** a payload without a usable `awarenessTz` remains readable and is
interpreted in the viewer's zone exactly as before; both surfaces render the
caveat `AWARENESS_TZ_CAVEAT` ("Awareness timezone not recorded — times shown
in the viewing device's timezone.") in Analysis Inputs, keyed off the
**saved** payload (`lastSavedPayloadRef`) — the selector's device-zone
suggestion never clears it; a save or resubmit writes the zone and does. No
backfill, no guessed zones. `awarenessTz` is part of the facts signature that
drives the staleness banner.

### Respond routing and information architecture (shipped 2026-07-19)

- **`/breach-clock` is Respond's home: the saved-incidents list** (top-bar
  title "Respond"; rendered by `src/pages/Incidents.jsx`). Layout: a filled
  Midnight "+ New incident" primary action (left-aligned), a "Saved Incidents"
  spaced-caps eyebrow, then a white card (1px Parchment border, 12px radius)
  with columns Title / Jurisdictions / Status / Next deadline / Last updated /
  Delete. Sorted last-updated descending — deliberately NOT deadline-sorted
  (JDC ruling 2026-07-19).
- **The Next deadline column is computed per row, never stored.** The list
  fetches each incident's payload (`listIncidents` selects it now) and runs
  the shared gate + engine client-side via `src/breach-clock/facts.js`;
  the soonest fired obligation deadline renders as a plain date ("Feb 21,
  2026"), an overdue one as static whole-days "Nd overdue" in semibold Ember
  JetBrains Mono (the table-scale echo of the results page's ticking overdue
  countdown — the list figure does not tick), and an incomplete draft as a
  Mist em-dash. Jurisdictions render postal-style ("DE · MA · CA +2") from a
  UI-side abbreviation map in `Incidents.jsx` — deliberately NOT in `data.js`.
- **`/breach-clock/new` is the fresh intake form.** A static route segment, so
  "new" is never captured as an `:id` param. `/new` and `/:id` render the same
  element tree at the same route position, so the first save's
  `navigate(/breach-clock/new → /breach-clock/<id>)` reconciles the form in
  place — no remount, no loss of just-entered state or the "Saved"
  confirmation. Do not restructure these routes in a way that breaks that
  reconciliation.
- **`/breach-clock/:id` is the saved-incident editor**, which auto-computes to
  the results view when the saved answers pass the completeness gate (silent
  submit on rehydrate completion; incomplete drafts open at the form with no
  validation errors shown).
- **`/incidents` is a route-level redirect to `/breach-clock`** (old links and
  bookmarks keep working). There is no standalone Incidents page anymore.
- **The rail is Respond + Map** — the former Incidents rail entry is removed
  (the list IS Respond's home). `ModuleItem`'s lucide-`icon` mechanism for
  non-module page entries is kept for future use.
- **Incident status lifecycle (shipped 2026-07-21): `draft` / `active` /
  `closed`**, enforced by a DB CHECK constraint (migration `20260721195745`).
  An incident stays Draft until the user explicitly clicks "Submit & compute
  deadlines" → Active (idempotent if already active; re-submitting a Closed
  incident reactivates it). The **silent auto-compute on rehydrate shares the
  compute path but never transitions status** — merely opening a complete
  saved incident cannot activate it; the transition is bound to
  `handleSubmit` alone. The manual control is the editor's top-bar eyebrow —
  a quiet native `<select>` wearing the small-caps eyebrow treatment
  (memoized, since the eyebrow node is a `useTopBarHeader` effect
  dependency). Status writes **immediately**, not behind Save: saved
  incidents persist through `updateIncidentStatus(id, status)` in
  `src/data/incidents.js` (optimistic control, reverted on a failed write);
  the unsaved form holds status in memory and the first save writes it via
  `createIncident`'s status argument. On the Respond home list, Active chips
  render in Moss and Closed in Mist (same chip anatomy, 6px radius), and
  Closed rows mute the Next-deadline cell — plain Mist due date, never the
  Ember overdue treatment. No edit-locking yet: Active and Closed incidents
  remain fully editable (locking/audit-trail on finalization is recorded
  future work in `docs/todo.md`).

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
"Incident summary" narrative group, which is distinct and unchanged. As of
harm-gate commit 2 it also carries conditional "Risk assessment" (EU/UK
selected) and "Harm assessment" (harm-gated jurisdiction selected) rows,
mirroring the screen recap via the shared label maps in
`results-grouping.js`.

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

### Change monitoring (stage 1, shipped 2026-08-23)

Change monitoring (JDC rulings 2026-08-23): registry architecture C —
registry.json is generated from data.js (static truth: citations, URLs,
rule-field mapping, verified dates, RULESET_VERSION) with a CI drift
check; dynamic fetch state lives in Supabase monitor_source_state, synced
one-way, keyed by registry id. Detection is deterministic
fetch-normalize-hash-diff with no model calls; the monitor is
incremental, stalest-first, time-budgeted, and idempotent, triggered by
Vercel Cron nightly on the production deployment (Pro plan; CRON_SECRET
verified in the route; Vercel cron invocations pass Deployment
Protection). Model triage, if adopted, is a later stage and never
proposes rule values or citation strings. Colorado sources are
fetch_mode=manual pending a fetchable source.

Files: `scripts/registry/generate.mjs` (generator; `npm run registry`,
`npm run registry:check`), `registry.json` (committed output — never
hand-edit; regenerate after any `data.js` change and commit both, or the
`registry-drift` GitHub Actions workflow fails), `scripts/monitor/`
(`normalize.mjs`, `store.mjs`, `run.mjs`; `npm run monitor` against
`MONITOR_DB_URL`, `--dry-run` for an in-memory pass), `api/monitor.mjs`
(the cron route, `maxDuration: 300`), migration
`supabase/migrations/20260823120000_monitor_source_state.sql` (table +
`monitor_bot` role). Attorney verification dates are transcribed into the
generator's `VERIFIED_DATES` table from the intake-form Sign-offs because
`data.js` carries no structured field for them — update both in the same
commit when a jurisdiction is re-verified.

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

### Gate-render history

- 2026-07-24: notification record + incident log (efbd4fd, 459386a)
  gate-rendered and PASSED — all recorded-card states at exact brand values
  incl. the neutral no-deadline ruling, conditional party both directions,
  Other→free-text swap, toggle persistence, orphan retention and
  re-attachment, memo section order, unconditional Ember due dates, silent
  log filtering. Deadline-phrase defects found and queued to the engine
  design pass; not caused by these commits.
- 2026-07-26: category-conditioned pass (f02f0ef, 15a2a85, b31b7ed)
  gate-rendered and PASSED — services (three statutory durations), advisories
  (declared + auto with composed titles), conditional party of the phrase
  repairs on live cards, memo service/advisory sections with silent
  screen-only affordances, jump fix verified live. Findings: compute/persist
  divergence (queued); no code defects in the shipped trio.

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

**Respond masthead — no pill (removed; was the 999px exception).** The Respond
masthead's `<h1>` lozenge in `BreachClock.jsx` is gone. The masthead is now
type-only — a descriptor line plus the "PRELIMINARY — NOT LEGAL ADVICE" eyebrow
over a single hairline rule, with no title, no chip, and no module glyph. So
`border-radius: 999px` is no longer used anywhere; do not reintroduce it. Chips
and badges use `border-radius: 6px` (ruled 2026-07-16). Radius scale: cards
12px, buttons/tiles 8px, chips/badges 6px. True circles (avatar) use 50% and
are exempt. (A
framed module glyph beside a serif title was briefly tried and pulled — two
framed marks, the glyph and the masthead Arkidel rune, read as duplicates;
module identity now lives in the nav and is slated for the module switcher.) The
asymmetric left-accent card above is now the only deliberate radius exception.

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

**Mist is the contingent-state color on result cards (Phase 2.1, JDC
2026-08-16).** On contingent-deadline cards — screen and memo — Mist carries
the not-yet-firm state: the card's left accent bar (dated and no-clock cards
alike) and the "If required, due …" qualifier line render Mist while the
conditional date is not yet past. The countdown numerals stay **Ink** — the
firm-card default — while not yet due (JDC contrast ruling (b), 2026-08-16:
Mist numerals at countdown size are illegible on the white surface). When the
conditional date is past, only the qualifier line flips to Ember (JDC ruling
2026-08-23 — the contingent counter is Ink at all times, past or not; Ember
never applies to it), and the card surface stays white with the Mist bar — the
Midnight overdue slab (and the cream urgent tint) remain exclusive to firm
deadlines.
The "Contingent on resident count" badge keeps the shared section-mark badge
idiom (currentColor border, per the ratified spec). Color is reinforcement
only: the badge and the "If required" wording carry the contingency, never
the color alone.

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

**Copy register rule (2026-08-09).** User-facing surfaces (screen, memo,
intake copy) speak in counsel's register: 'notice is required,' 'the
obligation applies,' 'the deadline runs from.' Engine vocabulary — 'fires,'
'gates,' 'suppression' as a bare term — stays in code, tests, and internal
docs. On-screen group headings use the established softened forms (e.g.
'Notification Likely Not Required'). Statutory quotations are never
rephrased under this rule.

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
- No autosave for in-progress Respond form input — unsaved changes are lost on
  refresh or HMR (deliberate; React state only). Explicit Save persists
  incidents to Supabase (shipped 2026-07-11); saved incidents rehydrate at
  /breach-clock/:id and auto-compute to results when complete.
- The Breach Clock UI is desktop-first; mobile responsiveness needs
  verification before public launch.
- The waitlist email form uses a placeholder submit handler that logs to
  console. A real backend (Buttondown, ConvertKit, or a Vercel-hosted
  endpoint) is pending.
- **RLS + `insert().select()` read-back (Supabase/Postgres).** A chained
  `.insert(...).select(...)` compiles to `INSERT … RETURNING`, and Postgres
  applies the table's **SELECT** policy to the returned row — surfacing a
  blocked read-back as a misleading `42501` ("new row violates row-level
  security policy") that looks like an insert rejection (the bare insert
  actually succeeds). This bit `organizations`: the owner-membership written by
  the `on_organization_created` AFTER INSERT trigger isn't visible to the
  read-back in time, so a membership-only SELECT policy failed. Fix (migration
  `20260622204148_widen_organizations_select_for_creator`): the SELECT policy is
  `is_org_member(id) OR created_by = (select auth.uid())`, so a creator can
  always read their own org row. **Convention:** when a table is written via
  `insert().select()`, its SELECT policy must admit the creator on a column
  available at insert time (e.g. `created_by`), not solely on membership a
  trigger backfills. Recorded trade-off: a user later removed from an org they
  created could still read that org's row via `created_by`; revisit when
  membership revocation / role management lands (`created_by` only ever matches
  the caller's own rows, so no other tenant's org is exposed).
- profiles, organizations, org_members, the own-row RLS policies, and the
  signup/org triggers (on_auth_user_created → handle_new_user;
  on_organization_created → handle_new_organization) all already exist from the
  foundation migration 20260621112854_multitenant_foundation.sql. Profile and
  org schema work is `alter`, never `create`. (on_organization_created is the
  trigger; handle_new_organization is the function it calls — not a naming
  conflict.)
- After creating an org, adopt the row the insert returns into OrgProvider
  state via adoptOrganization — do not re-select with getMyOrganizations to
  recognize it. Under the auth-state flux of a fresh sign-in, a re-select
  immediately after the write can return [] and strand the user on onboarding.
  Do not fire a background refresh() after adopt; it reintroduces that stall.
  createOrganization takes (name, userId) from the auth context — no
  supabase.auth.getUser() round-trip.
- Scratch test account (parked, do not delete): jacksonjcormier12@gmail.com,
  user id caa9adba-f284-4b22-9ebf-18a16fedcbab, org "Scratch Test Org" id
  92b7e5d7-0ac1-4606-8017-526ece131c54, contains one probe incident
  (6efcc804-6d75-4711-9533-be57604d4ff7). Used 2026-07-16 to verify
  cross-tenant RLS (both directions) and onboarding-in-shell. Reuse for
  invite-flow testing and RLS re-verification after schema changes. Its data
  must never appear in Arkidel, LLC queries — if it ever does, RLS is broken.
- docs/account-maintenance.md is the runbook for back-end account changes and
  deletions; follow it and append to its request log rather than improvising
  SQL against user or org data.
- Account-menu sign-out awaits signOut() completion, then navigates to
  /sign-in (ruled 2026-07-17). The old navigate('/') raced the signed-in
  forwarding and ended on /sign-in anyway via double redirect; awaiting the
  session clear first makes the destination deterministic. Do not navigate
  before the signOut promise resolves.
- Advisory/note card titles can wrap mid-citation on screen (e.g.
  `§ 6-` / `1-716(2)(a.3)`); a non-breaking treatment for citation tokens
  in headings is a future cosmetic fix (noted 2026-08-09).

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

**Supabase CLI auth comes from the `SUPABASE_ACCESS_TOKEN` env var** (set in
`~/.zshenv`) — never disable the bash sandbox and never run `supabase login` to
work around keychain access under the sandbox; the env var supplies auth with
the sandbox left on.
