# Arkidel — Jurisdiction Intake Forms

**Purpose.** This file documents every jurisdiction currently modeled in the
Arkidel Respond rules engine. Each form records the rules as encoded, the
sources relied on, and any model-fit considerations that arose. These forms are
the audit trail — when a law is amended, the existing form is the starting point
for the revision.

**Verification status.** All seven jurisdictions have now been drafted through
the formal intake process with contemporaneous primary-source verification via
web search. The Sign-off section of each form lists the sources confirmed and
notes any material changes from earlier drafts. Several early modelings had
errors — most notably California's pre-SB-446 deadlines and Texas's incorrect
30-day individual-notification deadline — that the formal intake surfaced and
corrected; those are documented in the relevant Counsel Notes sections.

**Encryption-suppression taxonomy** (April 26, 2026 update). The earlier
unified term "encryption safe harbor" has been retired in favour of two
distinct mechanisms reflecting the actual legal structure: (i)
**`breachDefinitionExcludesEncrypted`** — for U.S. state statutes (CA, TX, CO,
MA) whose definition of "breach" excludes encrypted data with uncompromised
key as a per-se rule; and (ii) a per-obligation **`conditionalGates`**
safe-harbor gate keyed to the **`gdprUnintelligibility`** input
(`suppressionType: "unintelligibility_exemption"`) — for the EU/UK GDPR
Art. 34(3)(a) provision, which is a conditional exemption
from the duty to communicate to data subjects, contingent on appropriate
technical and organisational measures having been applied to the affected
data, with the supervisory authority retaining override power under Art. 34(4).
Same UI behavior across both; the data taxonomy is now legally honest. See
Appendix: Model features used.

**Source of truth for U.S. state rules** (April 28, 2026 update). Going
forward, the IAPP US State Breach Notification Chart is the source of truth
for U.S. state breach notification rules — what rules exist, what thresholds
apply, what deadlines run. Web search remains the source for primary-source
citations, statutory text, regulator guidance, and timestamps. Where the chart
and a web source appear to disagree, the disagreement is surfaced explicitly
in the form's Counsel Notes rather than silently resolved. The chart does NOT
cover non-U.S. jurisdictions; for EU/UK GDPR (and any future non-U.S.
additions), primary sources cross-referenced via web search remain
authoritative. Each U.S. state form's Sign-off section now carries a dedicated
**IAPP chart consistency** line recording (i) the chart version checked,
(ii) the date of the check, and (iii) the consistency status — one of *fully
consistent*, *inconsistent (see notes)*, or *partially modeled (see notes)*.
If a state's rules are amended between IAPP chart updates and a primary-source
verification puts the form temporarily ahead of the chart, that deviation is
documented in the same line.

**Document version:** May 3, 2026 (eight jurisdictions verified — Virginia
added April 28, 2026 and backfilled into the repo May 3, 2026; encryption-
suppression taxonomy refactored; all six U.S. states cross-checked against
IAPP State Breach Notification Chart with standardized chart-consistency
sign-off line; counsel-notes infrastructure used for CA § 1280.15, MA § 3(b)
dual trigger, four NY substantive-judgment / sectoral / cross-link notes,
and four VA notes covering the harm-threshold gate, the § 32.1-127.1:05
medical-information regime, the subsection (M) employer/payroll tax-data
regime, and the good-faith employee/agent carve-out; IAPP chart is the
source of truth for U.S. state rules going forward).

**Label reconciliation** (June 20, 2026 update). Following the prior-commit
EU/UK §1.5 / §2.5 reconciliation, this pass reconciled the GDPR
unintelligibility mechanism name in the preamble encryption-suppression
taxonomy and the appendices (Model features used, Intake form template,
Adaptation for non-U.S. jurisdictions) to the current `data.js` gate — the
per-obligation `conditionalGates` safe-harbor gate keyed to the
`gdprUnintelligibility` input (`suppressionType: "unintelligibility_exemption"`,
citation Art. 34(3)(a) GDPR / UK GDPR) — replacing the retired
`obligationExemptedByUnintelligibility` field name. Label/field-name
reconciliation only — no change to any rule, threshold, citation, deadline,
conditional language, or the substance of the exemption. U.S.-state mechanism
names were outside this pass's scope and are unchanged.

---

# 1. European Union — GDPR

## 1.1 Identifier & display

- **Internal ID:** `eu`
- **Display name:** European Union
- **Short form:** EU GDPR
- **Statute name (subtitle):** Regulation (EU) 2016/679 (GDPR)

## 1.2 Resident-count input

- **Does this jurisdiction have any rule that depends on resident count?** **No.**
  Notification under GDPR turns on risk to data subjects and on whether any
  personal data is involved, not on numeric thresholds. No resident-count input
  is rendered.

## 1.3 Resident notification (notice to data subjects — Art. 34)

- **Required?** **Conditional.** Required only where the breach is "likely to
  result in a high risk to the rights and freedoms of natural persons" (Art. 34(1)).
- **Deadline:** "Without undue delay" — no fixed clock.
- **Trigger event:** Awareness ("a reasonable degree of certainty that a
  security incident has compromised personal data" — EDPB Guidelines 9/2022).
- **Authority name:** Affected Data Subjects
- **Citation:** Art. 34 GDPR
- **Source URL:** `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679#d1e3220-1-1`
- **Conditional / exception language:** Required where the breach is likely to
  result in a high risk. Respond currently uses certain sensitivity
  categories (gov_id, financial, health, biometric, children, special, credentials)
  as a proxy for the high-risk threshold via the `highRiskRequired` gating flag.

## 1.4 Regulator notification — Lead Supervisory Authority (Art. 33)

- **Required?** Yes, unless the breach is unlikely to result in a risk to the
  rights and freedoms of natural persons (Art. 33(1)).
- **Authority name:** Lead Supervisory Authority
- **Threshold:** None.
- **Deadline:** **72 hours** from awareness ("where feasible"; if missed,
  notification must include reasons for delay).
- **Trigger event:** Awareness.
- **Citation:** Art. 33 GDPR
- **Source URL:** `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679#d1e3185-1-1`
- **Conditional language:** Unless the breach is unlikely to result in a risk
  to the rights and freedoms of natural persons. Phased reporting permitted
  under Art. 33(4).

## 1.5 Article 34(3)(a) exemption — unintelligibility of data

**Note on terminology.** Respond previously labelled this an
"encryption safe harbor." That language has been retired for EU/UK GDPR
because it is misleading. GDPR does not contain a per-se rule that encrypted
data is outside the breach definition or that encryption automatically
excuses notification. What it contains is a conditional exemption from the
duty to communicate to data subjects under Art. 34(1) — and even that
exemption is subject to Art. 34(4), which lets the supervisory authority
require notification anyway.

The deeper question of whether encrypted data is "personal data" within the
meaning of Art. 4(1) at all remains unsettled in EU case law (see *Breyer*,
C-582/14; the *SRB* line of cases including *EDPS v SRB*, C-413/23 P, 2025).
Respond does not take a position on that question; it treats the
data as personal data and applies Art. 34(3)(a) as an obligation-level
exemption.

- **Applies?** **Yes — to Art. 34 individual notification only.**
- **Mechanism in the data model:** a per-obligation `conditionalGates`
  safe-harbor gate driven by the `gdprUnintelligibility` input
  (distinct from the U.S. states' `breachDefinitionExcludesEncrypted`, which
  is a definitional exclusion).
- **Citation:** Art. 34(3)(a) GDPR
- **Statutory text:** Communication to the data subject is not required if
  *"the controller has implemented appropriate technical and organisational
  protection measures, and those measures were applied to the personal data
  affected by the personal data breach, in particular those that render the
  personal data unintelligible to any person who is not authorised to access
  it, such as encryption."*
- **What this means in practice:** Encryption is the canonical example of a
  measure that satisfies (3)(a), but it is not the only one (pseudonymisation,
  tokenisation, and other unintelligibility-rendering measures may qualify).
  The exemption is conditional on the measures being *appropriate* and having
  been *applied to the affected data*. Art. 34(4) preserves the SA's power to
  override.

**Important: Article 33 supervisory-authority notification has NO discrete
exemption analogous to 34(3)(a).** Art. 33 is gated on "unlikely to result in
a risk to the rights and freedoms of natural persons." Properly encrypted
data with uncompromised key is, per EDPB Guidelines 9/2022 and Examples
Guidelines 01/2021, a strong indicator that the breach is unlikely to result
in such a risk — but this is a substantive risk assessment the controller
must perform and document under Art. 33(5), not a per-se rule. The Breach
Clock takes the conservative stance: when encryption is reported, Art. 34 is
suppressed under (3)(a), but Art. 33 still appears. The user is expected to
make the Art. 33(1) risk assessment themselves.

## 1.6 Other Article 34 exemptions (not modelled)

Article 34(3) actually contains **three exemptions**, not just the encryption
one. Respond currently models only (a):

- **(a) Encryption / unintelligibility** — modelled.
- **(b) Subsequent measures eliminating the high risk** — the controller has
  taken measures after the breach that ensure the high risk is no longer likely
  to materialise. Substantive judgment; not modelled.
- **(c) Disproportionate effort** — direct individual notification would
  involve disproportionate effort, in which case there must instead be a
  public communication or similar measure of equally effective character.
  Substantive judgment; not modelled.

Worth surfacing in a Counsel's Note that (b) and (c) exist and may further
excuse individual notification in specific circumstances.

## 1.7 Other obligations not modelled

- **Art. 33(5) documentation requirement** — controller must document any
  personal data breach (including those not notified) with facts, effects, and
  remedial action taken. Not a notification deadline; worth a Counsel's Note.
- **Article 34(4) supervisory-authority intervention power** — SA may require
  the controller to inform data subjects directly, or may decide that an
  exemption applies. Out of scope for triage.

## 1.8 Sensitivity rules

The current model treats certain sensitivity categories as proxies for the
high-risk threshold under Art. 34. This is a simplification — Art. 34
high-risk analysis is a multi-factor test (severity × likelihood), and category
alone does not determine the outcome. The conditional language on the deadline
card explicitly flags the simplification ("Sensitivity indicators suggest this
threshold may be met").

## 1.9 Trigger nuances

- **Different triggers for SA and individual notification?** No — both run from
  awareness.
- **Awareness defined?** EDPB Guidelines 9/2022 (margin no. 22): "a reasonable
  degree of certainty that a security incident has occurred that has led to
  personal data being compromised." A short period of investigation is
  permitted to confirm the breach occurred and assess risk; the 72-hour clock
  starts when reasonable certainty is established.
- **Processor awareness imputed?** Per WP29 / EDPB guidance, the controller is
  deemed aware as soon as the processor informs it.
- **Phased reporting permitted** under Art. 33(4) when full information cannot
  be provided within 72 hours.

## 1.10 Model fit

- [x] Different deadlines for different obligations (used)
- [x] Per-obligation `conditionalGates` safe-harbor gate on the `gdprUnintelligibility` input (used)
- [ ] No model gaps surfaced for this jurisdiction.

## 1.11 Counsel notes

- The high-risk classifier is a simplification. The deadline card and memo
  explicitly note that "sensitivity indicators suggest this threshold may be met."
- **Art. 33 supervisory-authority notification is NOT discretely excused by
  encryption.** Even when the user reports encryption applied, Art. 33 will
  still appear as a deadline — this is correct conservative behavior.
  Consider adding an in-app counsel's note explaining that the controller may
  conclude under Art. 33(5) that the breach is "unlikely to result in a risk"
  and need not notify the SA, but that this is a substantive judgment requiring
  contemporaneous documentation.
- Art. 34(3)(b) and (c) exist as additional exemptions; users should be aware
  these may apply.
- Art. 33(5) documentation obligations apply even when no notification is
  required.

## 1.12 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| EU selected, low-risk data only | Art. 33 SA fires (72h); Art. 34 does NOT fire |
| EU selected, high-risk data | Both Art. 33 (72h) and Art. 34 (no clock) fire |
| EU selected, high-risk data, encryption applied | Art. 33 still fires; Art. 34 suppressed under Art. 34(3)(a) |

## 1.13 Sign-off

- **Rules verification:** Drafted through formal intake on April 26, 2026,
  with primary-source verification of Articles 33 and 34 GDPR (text and
  exemptions).
- **Sources confirmed via web search:** EUR-Lex consolidated text of Regulation
  (EU) 2016/679; EDPB Guidelines 9/2022 on personal data breach notification
  (Version 2.0, March 2023); GDPRhub and gdpr-info.eu mirrors of Articles 33
  and 34.
- **Material change since prior draft:** Form upgraded to flag Art. 34(3)(b)
  and (c) exemptions (previously not noted), to make explicit that Art. 33
  has no discrete exemption analogous to 34(3)(a) (only a risk-based gate),
  and to retire the misleading "encryption safe harbor" terminology. The data
  model now distinguishes `obligationExemptedByUnintelligibility` (used here
  for Art. 34(3)(a)) from `breachDefinitionExcludesEncrypted` (used for U.S.
  state statutes that definitionally exclude encrypted data from the breach
  definition). Same engine behavior; more honest legal taxonomy.
- **Encryption modeling (2026-06-14):** The Art. 34(3)(a) individual-notification
  exemption is now driven by an explicit `gdprUnintelligibility` input (tri-state)
  on a per-obligation `conditionalGates` safe-harbor gate, replacing the former
  derived `encryptionApplied` boolean and superseding the
  `obligationExemptedByUnintelligibility` data field noted above (its citation and
  description were relocated verbatim into the gate). No 128-bit floor —
  Art. 34(3)(a) is a qualitative standard; Art. 33 is unaffected (never
  encryption-exempt). No change to any deadline, citation, or prose; the exemption
  outcome is unchanged. Build-of-record: the "Encryption gate build plan" addendum
  in `docs/todo.md`.
- **Documentation reconciliation (2026-06-20):** The §1.5 encryption-subsection
  labels were reconciled to the current `data.js` mechanism. The present-tense
  `obligationExemptedByUnintelligibility` field name — in the §1.5 "Mechanism in
  the data model" line and the §1.10 model-fit checklist — was updated to name
  the per-obligation `conditionalGates` safe-harbor gate driven by the
  `gdprUnintelligibility` input now in force, catching the documentation up to
  the S5/S6 code change. Label/field-name reconciliation only — no change to any
  rule, threshold, citation, deadline, conditional language, or the substance of
  the Art. 34(3)(a) exemption. The supersession history recorded in the
  2026-06-14 entry above is unchanged.
- **Reviewer:** *(pending)*

---

# 2. United Kingdom — UK GDPR

## 2.1 Identifier & display

- **Internal ID:** `uk`
- **Display name:** United Kingdom
- **Short form:** UK GDPR
- **Statute name (subtitle):** UK GDPR & Data Protection Act 2018

## 2.2 Resident-count input

- **Does this jurisdiction have any rule that depends on resident count?** **No.**

## 2.3 Resident notification (notice to data subjects — Art. 34)

- **Required?** **Conditional** — high-risk breach.
- **Deadline:** "Without undue delay" — no fixed clock.
- **Trigger event:** Awareness.
- **Authority name:** Affected Data Subjects
- **Citation:** Art. 34 UK GDPR
- **Source URL:** `https://www.legislation.gov.uk/eur/2016/679/article/34`
- **Conditional language:** Required where the breach is likely to result in a
  high risk to the rights and freedoms of data subjects. Same three-exemption
  structure as EU GDPR (Art. 34(3)(a), (b), (c)).

## 2.4 Regulator notification — Information Commissioner (Art. 33)

- **Required?** Yes, unless unlikely to result in a risk to rights and freedoms.
- **Authority name:** Information Commissioner's Office (ICO)
- **Threshold:** None.
- **Deadline:** **72 hours** from awareness, where feasible. If missed,
  reasons for delay must accompany the notification.
- **Trigger event:** Awareness.
- **Citation:** Art. 33 UK GDPR
- **Source URL:** `https://www.legislation.gov.uk/eur/2016/679/article/33`
- **Conditional language:** Unless unlikely to result in a risk to rights and
  freedoms. Phased reporting permitted under Art. 33(4) UK GDPR.

## 2.5 Article 34(3)(a) exemption — unintelligibility of data

- **Applies?** **Yes — to Art. 34 individual notification only.** Same legal
  structure as EU GDPR (the UK retained Art. 34 unchanged on Brexit).
- **Mechanism in the data model:** a per-obligation `conditionalGates`
  safe-harbor gate driven by the `gdprUnintelligibility` input.
- **Citation:** Art. 34(3)(a) UK GDPR
- **Statutory text:** Identical to EU GDPR's Art. 34(3)(a) (the UK GDPR
  retains the same wording, with "the Commissioner" substituted for "the
  supervisory authority" in (4)).
- **Notes:** See EU section 1.5 for the full discussion. Art. 33 ICO
  notification has no discrete exemption analogous to (3)(a); the same
  conservative modeling stance applies (Art. 33 fires under encryption; user
  performs the Art. 33(1) risk assessment themselves). The encrypted-data /
  personal-data definitional question is also unsettled in UK law (the ICO
  has not issued a definitive position).

## 2.6 Other Article 34 exemptions (not modelled)

Same as EU GDPR: (b) subsequent measures eliminating high risk; (c)
disproportionate effort + public communication. Both substantive judgments.

## 2.7 Recent legislative context (Data (Use and Access) Act 2025)

The DUAA received Royal Assent on **19 June 2025**. It amends the UK GDPR in
several respects, but **Articles 33 and 34 are NOT among the amended
provisions.** The DUAA changes affect:
- Articles 12–15 (data subject rights and information obligations)
- Article 4 (definitions, particularly research)
- PECR breach notification timescales (24h → 72h, aligning with UK GDPR)
- Cookie consent exceptions and PECR penalty levels

The 72-hour clock to the ICO under Art. 33 and the high-risk threshold under
Art. 34 are unchanged from the post-Brexit retained version of the GDPR.
Source: ICO guidance on personal data breaches (updated 20 August 2025);
Data (Use and Access) Act 2025 factsheet at gov.uk.

## 2.8 Other obligations not modelled

- **Art. 33(5) documentation requirement** — same as EU.
- **Section 67A DPA 2018** — the ICO has additional powers and procedures for
  PECR breaches, which are out of scope for Respond.

## 2.9 Trigger nuances

Same as EU GDPR. ICO guidance closely tracks WP29 / EDPB awareness guidance.

## 2.10 Model fit

- [ ] No model gaps surfaced.

## 2.11 Counsel notes

- Same as EU: Art. 33 still appears under encryption (conservative stance);
  consider in-app counsel's note explaining this.
- Source URL now points to legislation.gov.uk (the UK official consolidated
  text) rather than ICO guidance — corrected from earlier draft. Practitioners
  preferring ICO guidance can supplement with
  `https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/`.
- DUAA 2025 amendments do NOT touch Arts. 33/34. Earlier drafts didn't address
  this; the verification confirmed it.

## 2.12 Recommended test cases

Same shape as EU GDPR; tests share the structure (the harness covers EU and
UK in parallel).

## 2.13 Sign-off

- **Rules verification:** Drafted through formal intake on April 26, 2026,
  with primary-source verification of Articles 33/34 UK GDPR via
  legislation.gov.uk and ICO guidance.
- **Sources confirmed via web search:** legislation.gov.uk consolidated text of
  Articles 33 and 34 (current to 22 April 2026); ICO "Personal data breaches:
  a guide" (updated 20 August 2025); Data (Use and Access) Act 2025 factsheet
  at gov.uk confirming Arts. 33/34 not in scope of amendments.
- **Material change since prior draft:** Source URL updated from ICO guidance
  to legislation.gov.uk for the primary statutory text. DUAA 2025 amendments
  reviewed and confirmed not to affect Arts. 33/34. Art. 34(3)(b) and (c)
  exemptions flagged (parallel to EU).
- **Source-URL refresh (2026-06-14):** The Art. 33 and Art. 34 obligation
  `source_url`s in `data.js` — formerly the ICO "Personal data breaches: a
  guide" page, which now returns 404 — were repointed to the current canonical
  ICO breach-reporting page,
  `https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/`.
  Non-substantive link update only: no change to any rule, threshold, citation,
  deadline, or prose. All three target URLs in this refresh (UK ICO, TX AG, NY
  DFS) verified live (HTTP 200) on 2026-06-14. (Commit 9143531.)
- **Encryption modeling (2026-06-14):** The Art. 34(3)(a) individual-notification
  exemption is now driven by an explicit `gdprUnintelligibility` input (tri-state)
  on a per-obligation `conditionalGates` safe-harbor gate, replacing the former
  derived `encryptionApplied` boolean and superseding the
  `obligationExemptedByUnintelligibility` data field (its citation and description
  were relocated verbatim into the gate). No 128-bit floor — Art. 34(3)(a) UK GDPR
  is a qualitative standard; Art. 33 is unaffected (never encryption-exempt). No
  change to any deadline, citation, or prose; the exemption outcome is unchanged.
  Build-of-record: the "Encryption gate build plan" addendum in `docs/todo.md`.
- **Documentation reconciliation (2026-06-20):** The §2.5 encryption-subsection
  label was reconciled to the current `data.js` mechanism. The present-tense
  `obligationExemptedByUnintelligibility` field name — in the §2.5 "Mechanism in
  the data model" line — was updated to name the per-obligation `conditionalGates`
  safe-harbor gate driven by the `gdprUnintelligibility` input now in force,
  catching the documentation up to the S5/S6 code change. Label/field-name
  reconciliation only — no change to any rule, threshold, citation, deadline,
  conditional language, or the substance of the Art. 34(3)(a) UK GDPR exemption.
  The supersession history recorded in the 2026-06-14 entry above is unchanged.
- **Reviewer:** *(pending)*

---


# 3. California — Cal. Civ. Code § 1798.82 (post-SB-446)

## 3.1 Identifier & display

- **Internal ID:** `ca`
- **Display name:** California
- **Short form:** California
- **Statute name (subtitle):** Cal. Civ. Code § 1798.82 et seq.

## 3.2 Resident-count input

- **Required?** Yes — the AG-notification obligation depends on count.
- **Label:** "California residents affected"
- **Placeholder:** "e.g. 750"

## 3.3 Resident notification (Cal. Civ. Code § 1798.82(a))

- **Required?** Yes, where unencrypted personal information was acquired (or
  encrypted data was acquired and the encryption key/security credential was
  also acquired and could render the data readable).
- **Deadline:** **30 calendar days** from discovery or notification of the
  breach.
- **Trigger event:** Discovery or notification of the breach.
- **Authority name:** Affected California Residents
- **Citation:** Cal. Civ. Code § 1798.82(a)
- **Source URL:** `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.82.&lawCode=CIV`
- **Conditional language:** Within 30 calendar days of discovery or notification.
  Delay permitted only to accommodate legitimate law-enforcement needs or as
  necessary to determine the scope of the breach and restore the reasonable
  integrity of the data system. The 30-day deadline was added by SB-446
  (chaptered October 3, 2025), effective January 1, 2026.

## 3.4 Regulator notification — California Attorney General (§ 1798.82(f))

- **Required?** Yes, where a single breach involves **more than 500** California
  residents (statute says "more than 500," not "500 or more" — comparator is `gt`).
- **Authority name:** California Attorney General
- **Threshold:** 500 (gt)
- **Deadline:** **15 calendar days** from notification of affected residents
  (cascading deadline — `deadline_relative_to: "Affected California Residents"`).
- **Trigger event:** Notification of California residents (parent obligation).
- **Citation:** Cal. Civ. Code § 1798.82(f)
- **Source URL:** `https://oag.ca.gov/privacy/databreach/reporting`
- **Conditional language:** Submit a sample copy of the consumer notice via the
  California AG's electronic breach reporting portal within 15 calendar days of
  notifying affected California residents. The 15-day deadline was added by
  SB-446 (chaptered October 3, 2025), effective January 1, 2026.
- **Practical effect:** AG notice falls due 30 + 15 = **45 calendar days from
  awareness** at the latest.

## 3.5 Breach-definition exclusion — encrypted data

- **Applies?** **Yes** — the statute definitionally excludes properly-encrypted data with uncompromised key from the breach definition.
- **Mechanism in the data model:** `breachDefinitionExcludesEncrypted`.
- **Citation:** Cal. Civ. Code § 1798.82(a)
- **Description:** Notification is required only where unencrypted personal
  information was acquired, OR where encrypted data was acquired AND the
  encryption key/security credential was also acquired and could render the
  data readable. If only encrypted data was acquired and the key was not
  compromised, no notification obligation arises — and because the AG
  obligation is dependent on resident notification, it also does not arise.

## 3.6 Other obligations not modelled

- **Notice content & format requirements** (§ 1798.82(d)) — five mandatory
  headings, plain language, 10-point type minimum. Out of scope for
  Respond.
- **Identity-theft mitigation services** — for breaches involving SSN/driver's
  license/CA ID number, the entity must offer at least 12 months of free
  identity theft prevention and mitigation services. Not modelled.
- **Cal. Health & Safety Code § 1280.15 — healthcare facility reporting.**
  Clinics, health facilities, home health agencies, and hospices licensed
  under California law must report unauthorized access to, or use or
  disclosure of, a patient's medical information to the California Department
  of Public Health no later than 15 business days after detection. This is a
  separate sectoral regime running parallel to § 1798.82, identified in the
  IAPP State Breach Notification Chart's California row. Not modelled as a
  discrete obligation in the engine (would open the door to many sectoral
  regimes), but **surfaced as an in-app counsel note** via the
  `counselNotes` field on the California jurisdiction (id:
  `ca-health-safety-code-1280-15`). See Section 3.9.

## 3.7 Trigger nuances

- **"Discovery or notification"**: this is the trigger for both the individual
  and (cascading) AG deadlines. Respond's user input is awareness;
  for CA purposes, "discovery" maps cleanly to that. "Notification" applies to
  data maintainers receiving notice from owners — out of scope.
- **Law-enforcement delay**: explicit in the statute. Permits delay until
  clearance, then notification "without unreasonable delay."

## 3.8 Model fit

- [x] **Dependent / cascading deadlines** — used here for the first time
  (`deadline_relative_to`). The AG clock starts when the resident-notification
  deadline is reached, not when awareness occurs.
- [x] `breachDefinitionExcludesEncrypted` (used)
- [x] Comparator precision — `gt` (more than 500), not `gte`.
- [ ] No additional gaps surfaced.

## 3.9 Counsel notes

- **The 30-day individual clock is new** (effective January 1, 2026). Earlier
  modeling treated CA as having no fixed deadline; that was correct prior to
  SB-446 but is now wrong.
- **The AG threshold is "more than 500", not "500 or more".** Earlier modeling
  used the wrong comparator. Now corrected to `gt`.
- **AG clock is dependent on resident notification** under SB-446. The Breach
  Clock surfaces this in the basis text ("15 days from notification of
  Affected California Residents") and the conditional language in the deadline
  card. The actual computed deadline reflects the cascade (45 days from awareness).
- **In-app counsel note: Cal. Health & Safety Code § 1280.15.** A
  jurisdiction-level counsel note is rendered in the results page and the
  downloadable memo whenever California is selected, flagging the separate
  healthcare-facility breach-notification regime under § 1280.15 (15 business
  days from detection to the California Department of Public Health). This is
  the first use of the `counselNotes` field on a jurisdiction; the same
  pattern can be reused for substantive judgments and sectoral overlays in
  other jurisdictions (Massachusetts dual-trigger, Colorado misuse gate, EU
  Art. 33 risk-gate, etc.).

## 3.10 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| 500 CA residents, identifiers | Resident notification fires; AG does NOT fire (500 = gt 500 false) |
| 501 CA residents, identifiers | Resident + AG both fire; AG due 45 days from awareness |
| 100 CA residents, identifiers | Only resident notification fires; AG below threshold |
| 1,000 CA residents, encryption | Both obligations suppressed (breach-definition exclusion) |

## 3.11 Sign-off

- **Rules verification:** Drafted through formal intake on April 26, 2026,
  with primary-source verification of SB-446 (Chapter 319, 2025) and
  Cal. Civ. Code § 1798.82(a)–(f) as amended.
- **IAPP chart consistency:** Cross-checked against the IAPP US State Breach
  Notification Chart (version: February 2026 update, dated March 23, 2026) on
  April 26, 2026. **Status: fully consistent** on statute, trigger, individual
  30-day deadline, AG `gt 500`-resident threshold, AG 15-day cascading deadline
  from resident notification, and encryption treatment. The cross-check
  additionally surfaced Cal. Health & Safety Code § 1280.15 as a sectoral
  healthcare regime, now reflected as an in-app counsel note (see Sections
  3.6 and 3.9).
- **Sources confirmed via web search:** SB-446 enrolled text; California
  Legislative Information; multiple law-firm analyses confirming effective date
  and threshold language.
- **Sources confirmed via project knowledge base:** IAPP US State Breach
  Notification Chart, February 2026 update.
- **Encryption modeling (2026-06-14):** The global `encryptionApplied` switch was
  replaced by a per-obligation `conditionalGates` safe-harbor gate: each modeled
  obligation suppresses when the data was encrypted and the encryption
  key/security credential was not also acquired (`safeHarbor`, `defeatedBy:
  keyAcquired`). The encryption *outcome* — suppression when encrypted with an
  uncompromised key — is unchanged; only the modeling moved from a global boolean
  to per-obligation data. No change to any deadline, threshold, citation, or
  prose. Build-of-record: the "Encryption gate build plan" addendum in
  `docs/todo.md`.
- **Reviewer:** *(pending)*

---

# 4. Texas — Tex. Bus. & Com. Code § 521.053

## 4.1 Identifier & display

- **Internal ID:** `tx`
- **Display name:** Texas
- **Short form:** Texas
- **Statute name (subtitle):** Tex. Bus. & Com. Code § 521.053

## 4.2 Resident-count input

- **Required?** Yes — both AG and CRA notifications depend on count.
- **Label:** "Texas residents affected"
- **Placeholder:** "e.g. 300"

## 4.3 Resident notification (§ 521.053(b))

- **Required?** Yes.
- **Deadline:** **60 calendar days** after the date the entity determines that
  the breach occurred. (Note: the AG-notification deadline is shorter at 30 days,
  but the individual-notification ceiling is 60 days.)
- **Trigger event:** Determination of breach.
- **Authority name:** Affected Texas Residents
- **Citation:** Tex. Bus. & Com. Code § 521.053(b)
- **Source URL:** `https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm`
- **Conditional language:** Without unreasonable delay and no later than the
  60th day after determination. Delay permitted only as necessary to determine
  scope/restore integrity or for legitimate law-enforcement needs.

## 4.4 Regulator notification — Texas Attorney General (§ 521.053(i))

- **Required?** Yes, where the breach involves **at least 250** Texas residents.
- **Authority name:** Texas Attorney General
- **Threshold:** 250 (gte — "at least 250")
- **Deadline:** **30 days** after determination of the breach (S.B. 768, eff.
  September 1, 2023; was 60 days previously).
- **Trigger event:** Determination of breach.
- **Citation:** Tex. Bus. & Com. Code § 521.053(i)
- **Source URL:** `https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/report-data-breach`
- **Conditional language:** As soon as practicable and no later than 30 days
  after determination. Electronic submission via the Texas AG's online breach
  reporting form.

## 4.5 Consumer Reporting Agency notification (§ 521.053(h))

- **Required?** Yes, where notification is required to **more than 10,000**
  persons at one time. Comparator: `gt`.
- **Authority name:** Nationwide Consumer Reporting Agencies
- **Threshold:** 10,000 (gt — "more than 10,000")
- **Deadline:** No fixed clock — "without unreasonable delay."
- **Trigger event:** Determination of breach.
- **Citation:** Tex. Bus. & Com. Code § 521.053(h)
- **Source URL:** `https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm`
- **Conditional language:** Notify each nationwide consumer reporting agency
  (as defined in 15 U.S.C. § 1681a) of the timing, distribution, and content
  of the notices, without unreasonable delay.

## 4.6 Breach-definition exclusion — encrypted data

- **Applies?** **Yes** — the statute definitionally excludes properly-encrypted data with uncompromised key from the breach definition.
- **Mechanism in the data model:** `breachDefinitionExcludesEncrypted`.
- **Citation:** Tex. Bus. & Com. Code § 521.053(a)
- **Description:** The statutory definition of "breach of system security"
  covers encrypted data only when the person accessing it has the key required
  to decrypt the data. Encryption with uncompromised key falls outside the
  breach definition.

## 4.7 Other obligations not modelled

- **Reciprocity provision (§ 521.053(b-1))** — if the affected individual is a
  resident of a state with its own breach-notification law, the entity may
  comply with that state's law in lieu of the Texas notice. Not modelled.
- **Owner-licensee notification (§ 521.053(c))** — entities that maintain but
  do not own the data must notify the owner immediately. Out of scope for
  Respond (this is a B2B obligation, not a notification to individuals or
  regulators).

## 4.8 Trigger nuances

- **"Determination" trigger** — § 521.053 uses "determines that the breach
  occurred" rather than awareness. In practice these are similar moments;
  Respond collects awareness as input.
- **Different deadlines for AG vs. residents (30 vs. 60 days).** Already
  supported by the existing model (each obligation has its own deadline).

## 4.9 Model fit

- [x] Multiple obligations per jurisdiction with different deadlines (used)
- [x] `breachDefinitionExcludesEncrypted` (used)
- [x] CRA notification with `gt` comparator at 10,000 — used
- [ ] No additional gaps surfaced.

## 4.10 Counsel notes

- **Earlier modeling had the individual-notification deadline at 30 days; this
  was wrong.** § 521.053(b) sets a 60-day ceiling for individual notice. The
  30-day clock applies only to AG notification under § 521.053(i). Now corrected.
- **Earlier modeling omitted the CRA notification entirely.** § 521.053(h)
  requires CRA notification when the entity must notify more than 10,000
  persons at one time. Now added.
- The reciprocity provision in § 521.053(b-1) is worth surfacing in a Counsel's
  Note: a Texas resident's notice may be satisfied by complying with that
  resident's home-state law if the resident lives elsewhere.

## 4.11 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| 249 TX residents | Only resident notification fires (60d); AG does NOT |
| 250 TX residents | Resident (60d) + AG (30d) fire; CRA does NOT |
| 10,000 TX residents | Resident + AG fire; CRA does NOT (gt 10,000 false) |
| 10,001 TX residents | All three fire (resident, AG, CRA) |
| Any count, encryption | All obligations suppressed |

## 4.12 Sign-off

- **Rules verification:** Drafted through formal intake on April 26, 2026,
  with primary-source verification of § 521.053 as amended through S.B. 768
  (effective September 1, 2023).
- **IAPP chart consistency:** Cross-checked against the IAPP US State Breach
  Notification Chart (version: February 2026 update, dated March 23, 2026) on
  April 26, 2026. **Status: fully consistent** on statute, trigger, individual
  60-day deadline, AG 250-resident threshold and 30-day deadline, and CRA
  10,000-resident threshold and undefined-clock CRA notification.
- **Sources confirmed via web search:** Tex. Bus. & Com. Code § 521.053 on
  Texas Constitution and Statutes; multiple law-firm analyses confirming
  60-day individual / 30-day AG / 10,000+ CRA structure.
- **Sources confirmed via project knowledge base:** IAPP US State Breach
  Notification Chart, February 2026 update.
- **Source-URL refresh (2026-06-14):** The § 521.053(i) AG-notification
  obligation `source_url` in `data.js` — formerly
  `…/consumer-protection/file-consumer-complaint/report-data-breach`, which now
  returns 404 — was repointed to the current canonical Texas AG data-breach
  reporting page,
  `https://www.texasattorneygeneral.gov/consumer-protection/data-breach-reporting`.
  Non-substantive link update only: no change to any rule, threshold, citation,
  deadline, or prose. All three target URLs in this refresh (UK ICO, TX AG, NY
  DFS) verified live (HTTP 200) on 2026-06-14. (Commit 9143531.)
- **Encryption modeling (2026-06-14):** The global `encryptionApplied` switch was
  replaced by a per-obligation `conditionalGates` safe-harbor gate: each modeled
  obligation suppresses when the data was encrypted and the decryption key was not
  also acquired (`safeHarbor`, `defeatedBy: keyAcquired`) — tracking
  § 521.053(a)'s definition of "breach of system security." The encryption outcome
  is unchanged; only the modeling moved from a global boolean to per-obligation
  data. No change to any deadline, threshold, citation, or prose. Build-of-record:
  the "Encryption gate build plan" addendum in `docs/todo.md`.
- **Reviewer:** *(pending)*

---

# 5. Colorado — Colo. Rev. Stat. § 6-1-716

## 5.1 Identifier & display

- **Internal ID:** `co`
- **Display name:** Colorado
- **Short form:** Colorado
- **Statute name (subtitle):** Colo. Rev. Stat. § 6-1-716

## 5.2 Resident-count input

- **Required?** Yes — both AG and CRA notifications depend on count.
- **Label:** "Colorado residents affected"
- **Placeholder:** "e.g. 600"

## 5.3 Resident notification (§ 6-1-716(2)(a))

- **Required?** Yes, unless a prompt good-faith investigation determines that
  misuse has not occurred and is not reasonably likely to occur.
- **Deadline:** **30 calendar days** after determination of the breach.
- **Trigger event:** Determination of breach.
- **Authority name:** Affected Colorado Residents
- **Citation:** Colo. Rev. Stat. § 6-1-716(2)(a)
- **Source URL:** `https://law.justia.com/codes/colorado/title-6/fair-trade-and-restraint-of-trade/article-1/part-7/section-6-1-716/`
- **Conditional language:** In the most expedient time possible and without
  unreasonable delay, but not later than 30 days. Notification not required if
  a prompt good-faith investigation determines misuse has not occurred and is
  not reasonably likely to occur.

## 5.4 Regulator notification — Colorado Attorney General (§ 6-1-716(2)(f))

- **Required?** Yes, where 500 or more Colorado residents are reasonably
  believed to have been affected.
- **Threshold:** 500 (gte)
- **Deadline:** **30 days** after determination of the breach.
- **Trigger event:** Determination of breach.
- **Citation:** Colo. Rev. Stat. § 6-1-716(2)(f)
- **Source URL:** `https://coag.gov/resources/data-protection-laws/`

## 5.5 Consumer Reporting Agency notification (§ 6-1-716(2)(d))

- **Required?** Yes, where the entity must notify **more than 1,000** Colorado
  residents. Comparator: `gt`.
- **Threshold:** 1,000 (gt)
- **Deadline:** Without unreasonable delay (no fixed clock).
- **Trigger event:** Determination of breach.
- **Citation:** Colo. Rev. Stat. § 6-1-716(2)(d)
- **Source URL:** `https://law.justia.com/codes/colorado/title-6/fair-trade-and-restraint-of-trade/article-1/part-7/section-6-1-716/`
- **Conditional language:** Where more than 1,000 Colorado residents must be
  notified, the entity must also notify all nationwide consumer reporting
  agencies of the anticipated date of notification and approximate number of
  residents to be notified, without unreasonable delay. Does not apply to
  entities subject to GLBA Title V.

## 5.6 Breach-definition exclusion — encrypted data

- **Applies?** **Yes** — the statute definitionally excludes properly-encrypted data with uncompromised key from the breach definition.
- **Mechanism in the data model:** `breachDefinitionExcludesEncrypted`.
- **Citation:** Colo. Rev. Stat. § 6-1-716(1)(h)
- **Description:** Colorado defines "security breach" as the unauthorized
  acquisition of UNENCRYPTED computerized data. Encrypted data with an
  uncompromised key falls outside the breach definition. Note that
  § 6-1-716(2)(a.4) requires disclosure if the encryption key or other means
  to decipher the data was also acquired in the breach.

## 5.7 Other obligations not modelled

- **Misuse-investigation gate** — § 6-1-716(2)(a) excuses notification entirely
  if the entity determines that misuse has not occurred and is not reasonably
  likely to occur. This is a substantive judgment, not a clean fact, and is not
  modelled. Worth surfacing in a Counsel's Note.
- **GLBA carve-out for CRA notification** — entities subject to GLBA Title V
  are exempt from the CRA-notification requirement only. Surfaced in the
  conditional language but not modelled as gating.

## 5.8 Trigger nuances

- **"Determination" trigger** — § 6-1-716(1)(c) defines this as "the point in
  time at which there is sufficient evidence to conclude that a security breach
  has taken place." Conceptually similar to GDPR awareness.
- **Substitute notice provisions** — available where cost > $250,000 or affected
  class > 250,000 residents. Out of scope for Respond.

## 5.9 Model fit

- [x] CRA notification with `gt` comparator (used)
- [x] `breachDefinitionExcludesEncrypted` (used)
- [x] Multiple obligations per jurisdiction with different deadlines/triggers (used)
- [ ] Misuse-investigation gate not modelled — substantive judgment, not data-driven.

## 5.10 Counsel notes

- The "misuse" gate is meaningful: in close cases, an entity may conclude after
  prompt investigation that misuse is not reasonably likely. Respond
  does not model this — its outputs assume notification is required. Surface
  in a Counsel's Note.
- Breach-definition exclusion for encrypted data was not modelled in earlier versions; now added.
- The CRA notification's `gt` comparator (not `gte`) was the bug that motivated
  the comparator field generally.

## 5.11 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| 499 CO residents | Only resident notification fires |
| 500 CO residents | Resident + AG fire; CRA does NOT |
| 1,000 CO residents | Resident + AG fire; CRA does NOT (gt 1,000 false) |
| 1,001 CO residents | All three fire |
| Any count, encryption | All obligations suppressed |

## 5.12 Sign-off

- **Rules verification:** Drafted through formal intake on April 26, 2026,
  with primary-source verification of § 6-1-716 as amended through HB 18-1128.
- **IAPP chart consistency:** Cross-checked against the IAPP US State Breach
  Notification Chart (version: February 2026 update, dated March 23, 2026) on
  April 26, 2026. **Status: fully consistent** on statute, trigger,
  individual 30-day deadline, AG 500-resident threshold and 30-day deadline,
  CRA 1,000-resident `gt` threshold, and encryption treatment.
- **Sources confirmed via web search:** Colo. Rev. Stat. § 6-1-716 (2024
  edition); Colorado AG breach reporting page; FindLaw and Justia mirrors of
  the statute.
- **Sources confirmed via project knowledge base:** IAPP US State Breach
  Notification Chart, February 2026 update.
- **Source-URL liveness verified (2026-06-14):** All source URLs for this
  jurisdiction confirmed live. Earlier non-reachability during the link-liveness
  audit was Prague-origin geofencing (US-only state sites refusing non-US
  traffic), NOT dead links — confirmed via US-routed access and Wayback Machine
  200 captures. No URL change. Covers: coag.gov/resources/data-protection-laws/.
- **Encryption modeling (2026-06-14):** The global `encryptionApplied` switch was
  replaced by a per-obligation `conditionalGates` safe-harbor gate: each modeled
  obligation suppresses when the data was encrypted and the key/means to decrypt
  was not also acquired (`safeHarbor`, `defeatedBy: keyAcquired`). This captures
  § 6-1-716(1)(h)'s "unencrypted" breach definition together with the
  § 6-1-716(2)(a.4) re-trigger (key acquired defeats the harbor → fires). The
  encryption outcome is unchanged; only the modeling moved from a global boolean
  to per-obligation data. No change to any deadline, threshold, citation, or
  prose. Build-of-record: the "Encryption gate build plan" addendum in
  `docs/todo.md`.
- **Reviewer:** *(pending)*

---

# 6. Massachusetts — M.G.L. c. 93H

## 6.1 Identifier & display

- **Internal ID:** `ma`
- **Display name:** Massachusetts
- **Short form:** Massachusetts
- **Statute name (subtitle):** M.G.L. c. 93H

## 6.2 Resident-count input

- **Required?** **No.** All Massachusetts notification obligations apply
  regardless of the number of residents affected. No resident-count input is
  rendered.
- **Note worth flagging in the UI:** Even a single Massachusetts resident
  affected creates AG/OCABR/individual notification obligations. This differs
  from CA (>500), TX (250+ for AG), and CO (500+ for AG), and is easy for
  users to miss.

## 6.3 Resident notification (§ 3)

- **Required?** Yes, regardless of resident count.
- **Deadline:** "As soon as practicable and without unreasonable delay" — no
  fixed clock.
- **Trigger event:** Awareness ("knows or has reason to know").
- **Authority name:** Affected Massachusetts Residents
- **Citation:** M.G.L. c. 93H § 3
- **Source URL:** `https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93h/Section3`
- **Conditional language:** Notice must include the resident's right to obtain
  a police report and security-freeze information; it must NOT include the
  nature of the breach or the number of residents affected (those go only to
  the AG and OCABR).

## 6.4 Regulator notifications — TWO authorities (§ 3)

Massachusetts requires simultaneous notification to two regulators with the
same content. Modelled as two separate obligations (Option A from the intake
form). When New York is added (3 authorities), reconsider whether to extend
the model to support an `authorities[]` array on a single obligation.

### 6.4a Massachusetts Attorney General

- **Required?** Yes, regardless of resident count.
- **Deadline:** No fixed clock.
- **Trigger event:** Awareness.
- **Citation:** M.G.L. c. 93H § 3
- **Source URL:** `https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93h/Section3`
- **Conditional language:** Notice must include nature of the breach, number of
  MA residents affected, entity details, type of personal information
  compromised, whether the entity maintains a Written Information Security
  Program, and steps taken or planned. Cannot be delayed because the affected
  resident count is not yet ascertained.

### 6.4b Office of Consumer Affairs and Business Regulation (OCABR)

- **Required?** Yes, regardless of resident count.
- **Deadline:** No fixed clock.
- **Trigger event:** Awareness.
- **Citation:** M.G.L. c. 93H § 3
- **Source URL:** `https://www.mass.gov/info-details/requirements-for-data-breach-notifications`
- **Conditional language:** Required in parallel with AG notification. OCABR
  identifies any consumer reporting agencies or state agencies that should also
  receive notification, and forwards those identifications to the entity for
  follow-up notification.

## 6.5 Breach-definition exclusion — encrypted data

- **Applies?** **Yes** — the statute definitionally excludes properly-encrypted data with uncompromised key from the breach definition.
- **Mechanism in the data model:** `breachDefinitionExcludesEncrypted`.
- **Citation:** M.G.L. c. 93H § 1
- **Description:** If the data was encrypted with 128-bit-or-higher encryption
  and the encryption key was not also compromised, the incident does not meet
  the statutory definition of a "breach of security" — no notification
  obligation arises.

## 6.6 Other obligations not modelled

- **§ 3A credit-monitoring duty** — when SSN is involved, entity must offer 18
  months (42 months for CRAs) of free credit monitoring through a third-party
  vendor and file a separate certification with AG/OCABR. This is a substantive
  remedial duty rather than a notification deadline; not currently modelled.
  Worth surfacing in a Counsel's Note when SSN is among the sensitivity
  categories selected.
- **CRA / state-agency follow-up notification** — driven by OCABR's response
  identifying the relevant CRAs/agencies. Not deterministic from input facts;
  not modelled.
- **201 CMR 17.00 WISP requirement** — proactive data-security obligation, not
  breach-triggered. Out of scope for Respond.

## 6.7 Trigger nuances

- **Dual-trigger structure under § 3(b).** The notification duty fires on EITHER
  of two independent triggers, joined by "or": (1) the entity knows or has
  reason to know of a "breach of security" as defined in § 1, OR (2) the entity
  knows or has reason to know that personal information was acquired or used by
  an unauthorized person, or used for an unauthorized purpose. The two triggers
  do NOT have identical scope. The § 1 "breach of security" definition includes
  a substantial-risk-of-identity-theft-or-fraud requirement, a good-faith
  carve-out for employees/agents acting for lawful purposes, and the encryption
  qualifier (encrypted data only counts if the key was also acquired); the
  second trigger contains none of these elements. Substantive consequence: a
  controller could conclude "no breach of security under § 1 — no substantial
  risk" or "encrypted with uncompromised key, so outside § 1" yet still owe
  notification under the second trigger. Surfaced as an in-app counsel note
  (id: `ma-dual-trigger-section-3b`). Respond's encryption-suppression
  flag operates at the § 1 level only, so the suppressed-obligation cards may
  understate exposure when the second trigger could fire.
- **"Substantial risk of identity theft or fraud"** — part of the breach
  definition under § 1, not a separate threshold. In practice rarely a defense
  for incidents involving SSNs/financial accounts/government IDs. Captured by
  the dual-trigger counsel note above.
- **Different content requirements for AG/OCABR vs. residents** — already
  surfaced in the conditional language on the deadline cards.
- **Cannot delay for not-yet-ascertained count** — explicit in § 3.

## 6.8 Model fit

- [x] **Multi-authority notification** — handled as two adjacent obligations
  with the same trigger.
- [x] `breachDefinitionExcludesEncrypted` (used)
- [ ] § 3A remedial duty — substantive obligation, not a deadline; not
  modelled by design.
- [ ] Misuse / substantial-risk gate — substantive judgment, not modelled.

## 6.9 Counsel notes

- **In-app counsel note: dual-trigger structure under § 3(b).** Added April 26,
  2026, in response to the IAPP State Breach Notification Chart's footnote
  flagging the comparison between the § 1 "breach of security" definition and
  the unauthorized-acquisition-or-use trigger. Note id:
  `ma-dual-trigger-section-3b`. Surfaces the practical implication that
  encryption suppression and substantial-risk analysis under § 1 do not
  necessarily extinguish notification obligations that may arise under the
  second trigger.
- MA is unusual in not having a resident-count threshold for any notification.
  Surface this difference visibly to users. *(Candidate for an additional
  counsel note if user-testing surfaces confusion.)*
- The § 3A SSN credit-monitoring obligation is meaningful and substantive;
  consider adding a counsel note that fires when SSN is among the selected
  sensitivity categories. *(Currently not implemented; sensitivity-conditional
  counsel notes are a future model extension.)*
- 201 CMR 17.00 is a separate, proactive, ongoing security-program requirement
  worth mentioning in the memo's Further Considerations section.

## 6.10 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| MA selected, no encryption, any data | Three obligations fire (residents, AG, OCABR), all with no fixed deadline |
| MA selected, encryption applied | All three obligations suppressed (breach-definition exclusion) |
| MA + EU, encryption applied | MA fully suppressed; EU Art. 33 fires; EU Art. 34 suppressed |
| MA selected, no resident count entered | Three obligations still fire (no threshold) |

## 6.11 Sign-off

- **Rules verification:** Drafted through formal intake on April 26, 2026 —
  the pilot intake that established the form pattern.
- **IAPP chart consistency:** Cross-checked against the IAPP US State Breach
  Notification Chart (version: February 2026 update, dated March 23, 2026) on
  April 26, 2026. **Status: fully consistent** on statute, trigger,
  individual no-fixed-clock deadline, AG and OCABR notification (no threshold,
  no fixed clock), and encryption treatment. The cross-check additionally
  surfaced the dual-trigger nuance under § 3(b), now reflected as an in-app
  counsel note (id: `ma-dual-trigger-section-3b`); see Sections 6.7 and 6.9.
- **Sources confirmed via web search:** Mass. Legislature M.G.L. c. 93H §§ 1
  and 3; Mass.gov Requirements for Data Breach Notifications; FindLaw and
  Justia mirrors of c. 93H; Nutter privacy profile; multiple confirmations
  of the dual-trigger reading of § 3(b).
- **Sources confirmed via project knowledge base:** IAPP US State Breach
  Notification Chart, February 2026 update.
- **Source-URL liveness verified (2026-06-14):** All source URLs for this
  jurisdiction confirmed live. Earlier non-reachability during the link-liveness
  audit was Prague-origin geofencing (US-only state sites refusing non-US
  traffic), NOT dead links — confirmed via US-routed access and Wayback Machine
  200 captures. No URL change. Covers: malegislature.gov (M.G.L. c. 93H § 3).
- **Encryption modeling — treatment changed (2026-06-14):** The global
  `encryptionApplied` switch was replaced by a per-obligation `conditionalGates`
  gate, and MA's treatment **changed from suppression to counsel review**. Where
  the § 1 encryption harbor is met — encrypted with 128-bit-or-higher encryption
  (`requiresStrength: "ge_128"`) and the key not acquired — all three MA
  obligations now route to **counsel review (`onSatisfied: "review"`), not
  suppression**. Rationale: § 3(b)'s second trigger (unauthorized acquisition or
  use of personal information) has no encryption qualifier, so encryption can never
  *silently* excuse MA notification; the second trigger must be independently
  assessed (see the `ma-dual-trigger-section-3b` counsel note). Anything short of
  the harbor (unencrypted, below-128-bit, unknown/unset strength, or key acquired)
  → MA fires. No deadline, threshold, or citation changed. Build-of-record: the
  "Encryption gate build plan" addendum in `docs/todo.md`.
- **Reviewer:** *(pending)*

---

# 7. New York — N.Y. Gen. Bus. Law § 899-aa

## 7.1 Identifier & display

- **Internal ID:** `ny`
- **Display name:** New York
- **Short form:** New York
- **Statute name (subtitle):** N.Y. Gen. Bus. Law § 899-aa

## 7.2 Resident-count input

- **Required?** Yes — the CRA notification depends on count (and several
  counsel notes apply only above thresholds). The AG / Department of State /
  State Police obligations have no threshold and fire regardless of count.
- **Label:** "New York residents affected"
- **Placeholder:** "e.g. 800"

## 7.3 Resident notification (§ 899-aa(2))

- **Required?** Yes, where private information of a New York resident was, or
  is reasonably believed to have been, accessed or acquired without valid
  authorization. Notification is excused under § 899-aa(2)(a) where the
  exposure was inadvertent and the entity reasonably determines that misuse
  / financial harm / emotional harm is not reasonably likely (substantive
  judgment; surfaced as counsel note, not modelled as a gate).
- **Deadline:** **30 calendar days** from discovery (added by S2659B / A8872A,
  signed December 24, 2024, effective immediately on December 21, 2024).
- **Trigger event:** Discovery of breach.
- **Authority name:** Affected New York Residents
- **Citation:** N.Y. Gen. Bus. Law § 899-aa(2)
- **Source URL:** `https://www.nysenate.gov/legislation/laws/GBS/899-AA`
- **Conditional language:** In the most expedient time possible and without
  unreasonable delay, but within 30 days after discovery. Delay permitted only
  for the legitimate needs of law enforcement under § 899-aa(4). The 2024
  amendments removed the prior allowance for delay to determine scope or
  restore system integrity.

## 7.4 Regulator notifications — multi-authority (§ 899-aa(8)(a))

When notification is required to any New York resident, four additional
regulator notifications fire (with one of them gated by entity type — handled
as a counsel note rather than a discrete obligation). Modelled as adjacent
parallel obligations following the Massachusetts pattern (Option A), not as a
multi-authority array.

### 7.4a New York Attorney General

- **Required?** Yes, whenever any New York resident is notified. **No threshold.**
- **Authority name:** New York Attorney General
- **Threshold:** None.
- **Deadline:** No fixed clock — "without delaying notice to residents."
- **Trigger event:** Discovery of breach (parallel to resident notification).
- **Citation:** N.Y. Gen. Bus. Law § 899-aa(8)(a)
- **Source URL:** `https://formsnym.ag.ny.gov/OAGOnlineSubmissionForm/faces/OAGSBHome`
- **Conditional language:** The AG's online breach reporting portal serves as
  simultaneous notice to the AG, Department of State, and Division of State
  Police. NYDFS-regulated entities also notify NYDFS separately under 23 NYCRR
  § 500.17(a) (see counsel notes 7.9).

### 7.4b New York Department of State

- **Required?** Yes, in parallel with AG and State Police.
- **Threshold:** None.
- **Deadline:** No fixed clock.
- **Citation:** N.Y. Gen. Bus. Law § 899-aa(8)(a)
- **Source URL:** `https://dos.ny.gov/`

### 7.4c New York Division of State Police

- **Required?** Yes, in parallel with AG and Department of State.
- **Threshold:** None.
- **Deadline:** No fixed clock.
- **Citation:** N.Y. Gen. Bus. Law § 899-aa(8)(a)
- **Source URL:** `https://troopers.ny.gov/`

## 7.5 Consumer Reporting Agency notification (§ 899-aa(8)(b))

- **Required?** Yes, where **more than 5,000** New York residents are to be
  notified at one time. Comparator: `gt`.
- **Threshold:** 5,000 (gt — "more than 5,000")
- **Deadline:** No fixed clock — "without delaying notice to residents."
- **Citation:** N.Y. Gen. Bus. Law § 899-aa(8)(b)
- **Conditional language:** Notify all nationwide consumer reporting agencies
  of the timing, content, and distribution of the notices and the approximate
  number of affected residents.

## 7.6 Encryption suppression — breach-definition exclusion

- **Mechanism:** `breachDefinitionExcludesEncrypted`
- **Citation:** N.Y. Gen. Bus. Law § 899-aa(1)(b) (definition of "private
  information")
- **Description:** If the data was encrypted and the decryption key was not
  also compromised, the incident does not meet the statutory definition of
  "private information" acquired in a breach. Same per-se shape as CA, TX, CO,
  MA. Applies to all five obligations (individual, AG, Department of State,
  State Police, CRA) — when encryption is reported, all five are suppressed.

## 7.7 Other obligations not modelled (handled via counsel notes)

- **NYDFS sectoral notification** under 23 NYCRR § 500.17(a) — covered entities
  (per Part 500.1) must notify NYDFS within 72 hours of determining a
  cybersecurity event. Surfaced as counsel note (id:
  `ny-dfs-sectoral-overlay`). The February 14, 2025 chapter amendment (S804)
  clarified that the § 899-aa(8)(a)(ii) DFS-notification carve-out applies
  only to NYDFS-regulated entities; Respond follows that
  interpretation. Not modelled as a discrete obligation because it depends on
  entity-type characteristics outside the breach facts.
- **HIPAA / HITECH cross-link** under § 899-aa(9) — HIPAA-regulated entities
  that notify the HHS Secretary must also notify the New York AG within
  5 business days of HHS notification, even where the breach involves
  information that is not "private information" under § 899-aa. Surfaced as
  counsel note (id: `ny-hipaa-cross-link`).
- **No-harm determination report at >500 residents** under § 899-aa(2)(a) —
  where the misuse-investigation gate is invoked AND the inadvertent exposure
  affected more than 500 New York residents, the entity must provide the
  written determination to the AG within 10 days. Surfaced as counsel note
  (id: `ny-no-harm-determination-report`). **Superseded 2026-06-14** —
  consolidated into `ny-inadvertent-disclosure-exception-899aa-2a` (redundant;
  both described § 899-aa(2)(a)). Consolidation applied in the same commit as
  the data.js NY edits (Edits A & B).
- **Misuse-investigation gate** under § 899-aa(2)(a) — the substantive
  judgment that excuses notification entirely. Surfaced as counsel note
  (id: `ny-misuse-investigation-gate`). **Superseded 2026-06-14** —
  consolidated into `ny-inadvertent-disclosure-exception-899aa-2a` (redundant;
  both described § 899-aa(2)(a)). Consolidation applied in the same commit as
  the data.js NY edits (Edits A & B).
- **Inadvertent-disclosure exception (§ 899-aa(2)(a))** — New York's only
  carve-out from the notification duty: a narrow, fact-specific gate requiring
  BOTH an inadvertent disclosure by an authorized person AND a reasonable
  determination that misuse / financial harm / (for online-credential cases)
  emotional harm is not likely. Where invoked, the determination must be
  documented in writing and retained at least five years, and — above 500
  affected New York residents — the written determination must go to the AG
  within 10 days. Surfaced as counsel note (id:
  `ny-inadvertent-disclosure-exception-899aa-2a`), consolidating the two
  superseded entries above. Added 2026-06-14 in the same commit as the data.js
  NY edits (Edits A & B).
- **Notice content & format requirements** under § 899-aa(7) — required
  content elements for the notice to residents. Out of scope for the Breach
  Clock.
- **Maintainer-to-owner notification** under § 899-aa(3) — third-party data
  processors must notify the data owner of any breach. Out of scope for
  Respond (B2B obligation).

## 7.8 Trigger nuances

- **"Discovery or notification of breach"** — same shape as California. The
  clock runs from when the entity first becomes aware (or is notified by an
  upstream party). The 2024 amendments removed the prior allowance for delay
  to determine scope or restore integrity — only law-enforcement delay
  remains under § 899-aa(4).
- **Multi-authority parallel notification.** The AG portal serves as a
  one-stop submission for AG / Department of State / State Police;
  Respond represents these as three separate obligations to make the
  obligations visible in the deadline display, but practitioners should
  understand that a single portal submission satisfies all three.
- **Expanded definition of private information** (effective March 21, 2025)
  now includes medical information and health insurance information in
  addition to the prior categories. This expansion may bring HIPAA-covered
  entities within § 899-aa for breaches of non-ePHI even where federal
  notification is not triggered. Reflected in the sensitivity-category logic
  via the existing "health" category as a high-risk indicator.

## 7.9 Counsel notes

- **In-app counsel note: NYDFS sectoral overlay.** Note id:
  `ny-dfs-sectoral-overlay`. Flags the separate 72-hour NYDFS notification
  obligation under 23 NYCRR § 500.17(a) for covered entities. The Breach
  Clock does not model the 72-hour DFS clock because it depends on entity
  type rather than breach facts.
- **In-app counsel note: HIPAA / HITECH cross-link.** Note id:
  `ny-hipaa-cross-link`. Flags the 5-business-day clock to the AG following
  HHS notification under HIPAA / HITECH.
- **In-app counsel note: no-harm determination at >500 residents.** Note id:
  `ny-no-harm-determination-report`. Flags the 10-day AG report obligation
  that arises precisely when the no-harm gate excuses notification — an
  obligation that fires when the standard obligations don't, and would
  require negative-condition gating to model in the engine.
  **Superseded 2026-06-14** — consolidated into `ny-inadvertent-disclosure-exception-899aa-2a`
  (redundant; both described § 899-aa(2)(a)). Consolidation applied in the same
  commit as the data.js NY edits (Edits A & B).
- **In-app counsel note: misuse-investigation gate.** Note id:
  `ny-misuse-investigation-gate`. Flags the substantive judgment that
  excuses notification under § 899-aa(2)(a). **Superseded 2026-06-14** —
  consolidated into `ny-inadvertent-disclosure-exception-899aa-2a` (redundant;
  both described § 899-aa(2)(a)). Consolidation applied in the same commit as
  the data.js NY edits (Edits A & B).
- **In-app counsel note: inadvertent-disclosure exception (§ 899-aa(2)(a)).**
  Note id: `ny-inadvertent-disclosure-exception-899aa-2a`. The single
  consolidated note replacing the two superseded entries above: states that NY
  has no general harm-threshold exception, describes the narrow § 899-aa(2)(a)
  gate (inadvertent disclosure by an authorized person + reasonable
  no-likely-harm determination), and flags the written-determination five-year
  retention and the 10-day AG report above 500 affected residents. Added
  2026-06-14 in the same commit as the data.js NY edits (Edits A & B).

## 7.10 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| 1 NY resident, identifiers | Resident, AG, DOS, State Police all fire; CRA does NOT |
| 5,000 NY residents | Resident, AG, DOS, State Police fire; CRA does NOT (gt 5,000 false) |
| 5,001 NY residents | All five obligations fire |
| Any count, encryption | All five obligations suppressed (breach-definition exclusion) |
| NY + multi-state large incident | NY's 4 non-CRA obligations stack alongside other states' obligations |

## 7.11 Sign-off

- **Rules verification:** Drafted through formal intake on April 28, 2026,
  with primary-source verification of N.Y. Gen. Bus. Law § 899-aa as amended
  by S2659B / A8872A (December 24, 2024, eff. December 21, 2024) and the
  February 14, 2025 chapter amendment S804. Statutory text confirmed via
  FindLaw and NY Senate consolidated laws. NYDFS, HIPAA cross-link, and
  no-harm determination provisions confirmed via multiple law-firm advisories
  (Alston & Bird, Morrison Foerster, Ropes & Gray, Constangy, Bleakley Platt,
  Lawyers Alliance, Ogletree, Byte Back / Squire Patton Boggs).
- **IAPP chart consistency:** Cross-checked against the IAPP US State Breach
  Notification Chart (version: February 2026 update, dated March 23, 2026) on
  April 28, 2026. **Status: fully consistent** on statute, trigger, individual
  30-day deadline, AG (no threshold) / Department of State / State Police /
  NYDFS multi-authority structure, CRA `gt 5,000` threshold, encryption
  treatment, and the 10-day no-harm-determination report at over 500 residents.
- **Sources confirmed via web search:** N.Y. Gen. Bus. Law § 899-aa
  (FindLaw and NY Senate consolidated laws); multiple law-firm advisories
  on the December 2024 / February 2025 amendments; Lawyers Alliance SHIELD
  Act legal alert (August 2025).
- **Sources confirmed via project knowledge base:** IAPP US State Breach
  Notification Chart, February 2026 update.
- **Material change since prior draft:** First draft.
- **Source-URL refresh (2026-06-14):** The NYDFS sectoral-overlay counsel note's
  `source_url` in `data.js` — formerly `…/industry_guidance/cyber_filings`,
  which now returns 404 — was repointed to the current canonical NYDFS
  cybersecurity page, `https://www.dfs.ny.gov/industry_guidance/cybersecurity`.
  Non-substantive link update only: no change to any rule, threshold, citation,
  deadline, or prose. All three target URLs in this refresh (UK ICO, TX AG, NY
  DFS) verified live (HTTP 200) on 2026-06-14. (Commit 9143531.)
- **Citation correction (2026-06-14):** NYDFS 72-hour notice is 23 NYCRR
  § 500.17(a), not (c); corrected at all three references in this form
  (§7.4a conditional language, §7.7 obligations-not-modelled, §7.9 counsel
  notes) and in the `ny-dfs-sectoral-overlay` note's content and citation in
  `data.js`. Verified vs the DFS Cybersecurity Resource Center. Applied in the
  same commit as the data.js NY edits (Edits A & B).
- **Counsel-note consolidation (2026-06-14):** The two § 899-aa(2)(a) notes
  `ny-no-harm-determination-report` and `ny-misuse-investigation-gate` — both
  describing the same inadvertent-disclosure exception — were consolidated in
  `data.js` into a single note `ny-inadvertent-disclosure-exception-899aa-2a`;
  NY counsel-note count 4 → 3. The two prior §7.7 / §7.9 audit entries are
  retained and marked superseded, and a fresh entry for the consolidated note
  was added to each section. No change to any rule, threshold, deadline, or
  obligation. Applied in the same commit as the data.js NY edits (Edits A & B).
- **Encryption modeling (2026-06-14):** The global `encryptionApplied` switch was
  replaced by a per-obligation `conditionalGates` safe-harbor gate: each modeled
  obligation suppresses when the data was encrypted and the decryption key was not
  also compromised (`safeHarbor`, `defeatedBy: keyAcquired`) — tracking
  § 899-aa(1)(b)'s "private information" definition. The encryption outcome is
  unchanged; only the modeling moved from a global boolean to per-obligation data.
  No change to any deadline, threshold, citation, or prose. Build-of-record: the
  "Encryption gate build plan" addendum in `docs/todo.md`.
- **Reviewer:** *(pending)*

---

# 8. Virginia — Va. Code § 18.2-186.6

## 8.1 Identifier & display

- **Internal ID:** `va`
- **Display name:** Virginia
- **Short form:** Virginia
- **Statute name (subtitle):** Va. Code § 18.2-186.6

## 8.2 Resident-count input

- **Required?** Yes — the CRA notification depends on count. The individual
  and AG obligations have no threshold and fire regardless of count.
- **Label:** "Virginia residents affected"
- **Placeholder:** "e.g. 800"

## 8.3 Resident notification (§ 18.2-186.6(B))

- **Required?** Yes, where unencrypted or unredacted personal information
  was, or is reasonably believed to have been, accessed and acquired by an
  unauthorized person AND the breach has caused (or the entity reasonably
  believes has caused or will cause) identity theft or other fraud to a
  Virginia resident. The harm threshold is built into the breach definition
  itself — see counsel notes 8.9 — and is not modelled as a discrete gate.
- **Deadline:** No fixed clock — "without unreasonable delay."
- **Trigger event:** Discovery of breach.
- **Authority name:** Affected Virginia Residents
- **Citation:** Va. Code § 18.2-186.6(B)
- **Source URL:** `https://law.lis.virginia.gov/vacode/title18.2/chapter6/section18.2-186.6/`
- **Conditional language:** Without unreasonable delay following discovery.
  Notice may be reasonably delayed to allow the entity to determine the scope
  of the breach and restore the reasonable integrity of the system, or if a
  law-enforcement agency advises that notice will impede a criminal or civil
  investigation or homeland or national security.

## 8.4 Regulator notification — Virginia Attorney General (§ 18.2-186.6(B))

- **Required?** Yes, whenever any Virginia resident is notified. **No threshold.**
- **Authority name:** Virginia Attorney General
- **Threshold:** None.
- **Deadline:** No fixed clock — "without unreasonable delay."
- **Trigger event:** Discovery of breach (parallel to resident notification).
- **Citation:** Va. Code § 18.2-186.6(B)
- **Source URL:** `https://www.oag.state.va.us/programs-initiatives/computer-crime`
- **Conditional language:** Notification to the Computer Crime Section of the
  Office of the Attorney General. The same law-enforcement-delay provisions
  that apply to resident notification also apply to AG notification. Submission
  by mail per AG guidance, with specified content elements (cover letter,
  approximate breach date, cause, number of residents affected, remediation
  steps, FEIN if tax data was involved).

## 8.5 Consumer Reporting Agency notification (§ 18.2-186.6(E))

- **Required?** Yes, where the entity is required to notify **more than 1,000**
  persons at one time. Comparator: `gt`.
- **Threshold:** 1,000 (gt — "more than 1,000")
- **Deadline:** No fixed clock — "without unreasonable delay."
- **Citation:** Va. Code § 18.2-186.6(E)
- **Conditional language:** Notify all nationwide consumer reporting agencies
  of the timing, distribution, and content of the notice, without unreasonable
  delay.

## 8.6 Encryption suppression — breach-definition exclusion

- **Mechanism:** `breachDefinitionExcludesEncrypted`
- **Citation:** Va. Code § 18.2-186.6(A)
- **Description:** The statute applies only to unencrypted or unredacted
  personal information. If the data was encrypted or redacted and the
  encryption key was not accessed or acquired, the incident does not meet the
  statutory definition of a breach. Same per-se shape as CA, TX, CO, MA, NY.
  Applies to all three obligations (individual, AG, CRA).

## 8.7 Other obligations not modelled (handled via counsel notes or out of scope)

- **Substantive harm threshold under § 18.2-186.6(A), (B), and (M)** — both
  the main breach-notification regime and the subsection (M) employer/payroll
  regime require that the breach caused or be reasonably believed to cause
  identity theft or other fraud. Substantive judgment, not modelled. Surfaced
  as counsel note (id: `va-harm-threshold-186-6`).
- **Medical information regime under § 32.1-127.1:05** — separate sectoral
  statute for medical information breaches. Surfaced as counsel note (id:
  `va-medical-information-32-1-127-1-05`). Same modeling principle as CA
  § 1280.15.
- **Employer / payroll-service-provider tax-data breach notification under
  § 18.2-186.6(M)** — a separate, parallel AG-notification obligation that
  applies when the entity is an employer or payroll service provider and the
  breach involves a Virginia employee's TIN combined with the income tax
  withheld for that employee. Same trigger and "without unreasonable delay"
  deadline shape as the main AG provision. No resident-notification or CRA
  component. Subsection (M) applies only to employee data, not customer or
  non-employee data. Surfaced as counsel note (id:
  `va-employer-payroll-tax-data-186-6-m`). Not modelled as a discrete
  obligation because applicability depends on entity type, following the
  precedent set by the NYDFS sectoral overlay.
- **Good-faith employee/agent acquisition carve-out under § 18.2-186.6(A)** —
  carve-out for good-faith acquisition by employees/agents for entity's
  purposes, similar to MA c. 93H. Substantive judgment, surfaced as counsel
  note (id: `va-good-faith-employee-agent-carve-out`).
- **Substitute notice provisions** — available where cost > $50,000 or affected
  class > 100,000 residents. Out of scope.
- **Civil penalty cap of $150,000 per breach** — enforcement mechanism, not a
  notification deadline. Out of scope.

## 8.8 Trigger nuances

- **"Discovery or notification of breach"** — same shape as California, New
  York. The clock (such as it is, since there's no fixed deadline) runs from
  awareness or notification by an upstream party.
- **Harm threshold built into the breach definition.** Unlike Massachusetts
  (where the substantial-risk language is in the definition but is rarely a
  defense for incidents involving SSNs/financial accounts), Virginia's harm
  threshold is more textually explicit ("causes, or the entity reasonably
  believes has caused, or will cause, identity theft or other fraud"). This
  may give entities more room to conclude that no notification is required in
  cases of minor inadvertent exposure.
- **Law-enforcement delay provisions.** Both individual and AG notification
  may be delayed if law enforcement so advises. This is in addition to the
  scope-determination delay.

## 8.9 Counsel notes

- **In-app counsel note: substantive harm threshold.** Note id:
  `va-harm-threshold-186-6`. Flags the statutory harm requirement under
  subsections (A), (B), and (M), which may excuse notification in specific
  factual circumstances. This is the most important counsel note for Virginia
  because it can change the outcome of the analysis.
- **In-app counsel note: medical information regime.** Note id:
  `va-medical-information-32-1-127-1-05`. Flags the parallel sectoral
  regime under § 32.1-127.1:05.
- **In-app counsel note: employer / payroll-service-provider tax-data breach
  notification.** Note id: `va-employer-payroll-tax-data-186-6-m`. Flags the
  separate, parallel AG-notification obligation under § 18.2-186.6(M) for
  employer/payroll-provider breaches of employee TIN+withholding data. Framed
  as a parallel obligation rather than as an addition to the main AG
  notification, because that's what the statutory text actually says.
- **In-app counsel note: good-faith employee/agent carve-out.** Note id:
  `va-good-faith-employee-agent-carve-out`. Flags the carve-out for good-faith
  internal acquisition.

## 8.10 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| 1 VA resident, identifiers | Individual + AG fire; CRA does NOT |
| 1,000 VA residents | Individual + AG fire; CRA does NOT (gt 1,000 false) |
| 1,001 VA residents | All three fire |
| 5,000 VA residents | All three fire |
| Any count, encryption | All three obligations suppressed (breach-definition exclusion) |
| Missing resident count | Individual + AG fire; CRA does not (no count, no threshold met) |

## 8.11 Sign-off

- **Rules verification:** Drafted through formal intake on April 28, 2026,
  with primary-source verification of Va. Code § 18.2-186.6 as last amended
  by H.B. 2396 (effective July 1, 2019). Statutory text confirmed via Virginia
  Legislative Information System (LIS) and Justia. No 2024–2026 amendments
  identified. Subsection (M) text and scope (employer/payroll service
  provider; employee TIN + income tax withheld; harm threshold; employee-only
  applicability) verified via direct review of the LIS statutory text on
  April 28, 2026. Good-faith carve-out under § 18.2-186.6(A) confirmed via
  Perkins Coie security breach notification chart and Davis Wright Tremaine
  summary.
- **IAPP chart consistency:** Cross-checked against the IAPP US State Breach
  Notification Chart (version: February 2026 update, dated March 23, 2026) on
  April 28, 2026. **Status: fully consistent** on statute, trigger, harm-
  threshold language, individual notification (no fixed clock), AG notification
  (no threshold, no fixed clock), CRA `gt 1,000` threshold (no fixed clock),
  and encryption treatment. The IAPP chart does not surface subsection (M)'s
  separate employer/payroll regime in its main row; this was identified
  through primary-source review and is reflected as a counsel note.
- **Sources confirmed via web search:** Va. Code § 18.2-186.6 (LIS and Justia);
  Perkins Coie Virginia security breach notification chart; Davis Wright
  Tremaine Virginia summary; Constangy Cyber Team data privacy reference;
  Klinedinst Virginia data breach statutes summary.
- **Sources confirmed via project knowledge base:** IAPP US State Breach
  Notification Chart, February 2026 update (page 23).
- **Material change since prior draft:** First draft. Initial draft
  underspecified subsection (M) as a "tax-information additional requirements"
  add-on; corrected to reflect that subsection (M) is a separate, parallel
  AG-notification obligation with its own applicability gate (employer/payroll
  service provider) and data scope (employee TIN + tax withheld).
- **Material change 2026-05-23 (test-coverage only):** Added a dedicated
  single-jurisdiction test to `engine.js` (`"Virginia: 5,000 residents
  triggers all three obligations (individual + AG + CRA)"`) for § 8.10
  pattern 4. The pattern was previously covered only transitively by the
  all-eight-jurisdictions stacking test; this change closes a traceability
  gap identified in a coverage audit. No rule in `data.js` changed; this is
  test coverage only. Engine test count: 50 → 51, all passing.
- **Source-URL liveness verified (2026-06-14):** All source URLs for this
  jurisdiction confirmed live. Earlier non-reachability during the link-liveness
  audit was Prague-origin geofencing (US-only state sites refusing non-US
  traffic), NOT dead links — confirmed via US-routed access and Wayback Machine
  200 captures. No URL change. Covers: law.lis.virginia.gov § 18.2-186.6,
  law.lis.virginia.gov § 32.1-127.1:05, and
  oag.state.va.us/programs-initiatives/computer-crime.
- **Encryption modeling (2026-06-14):** The global `encryptionApplied` switch was
  replaced by per-obligation `conditionalGates` safe-harbor gates. Each VA
  obligation now carries TWO harbors — encryption (`defeatedBy: keyAcquired`)
  **and** redaction (`input: redacted`, `defeatedBy: reidentificationAcquired`) —
  reflecting § 18.2-186.6(A)'s "unencrypted or unredacted" scope; either harbor,
  when satisfied (key / re-identification info not acquired), suppresses. The
  encryption/redaction outcome is unchanged; only the modeling moved from a global
  boolean to per-obligation data. No change to any deadline, threshold, citation,
  or prose. Build-of-record: the "Encryption gate build plan" addendum in
  `docs/todo.md`.
- **Reviewer:** *(pending)*

---

# Appendix: Cross-jurisdiction summary

| Jurisdiction | Resident clock | Regulator clock | Threshold | Encryption suppression mechanism |
|---|---|---|---|---|
| EU GDPR | None (Art. 34, conditional on high risk) | 72h to SA | None | Art. 34(3)(a) exemption (Art. 34 only) |
| UK GDPR | None (Art. 34, conditional on high risk) | 72h to ICO | None | Art. 34(3)(a) exemption (Art. 34 only) |
| California | 30 days from discovery | 15 days from resident notice | >500 (gt) | Breach-definition exclusion |
| Texas | 60 days from determination | 30 days from determination (AG); no clock for CRA | 250+ (AG); >10,000 (CRA, gt) | Breach-definition exclusion |
| Colorado | 30 days from determination | 30 days from determination (AG); no clock for CRA | 500+ (AG); >1,000 (CRA, gt) | Breach-definition exclusion |
| Massachusetts | No clock | No clock (AG + OCABR) | None | Breach-definition exclusion |
| New York | 30 days from discovery | No clock (AG + Dept of State + State Police); no clock for CRA | None for AG/DOS/State Police; >5,000 (gt) for CRA | Breach-definition exclusion |
| Virginia | No clock | No clock (AG); no clock for CRA | None for AG; >1,000 (gt) for CRA | Breach-definition exclusion |

# Appendix: Model features used

- `deadline_hours: number | null` — fixed-clock or unfixed-clock deadlines
- `deadline_relative_to: { parent_authority }` — cascading deadlines (CA only so far)
- `gating: { highRiskRequired }` — gates obligations on sensitivity categories
- `gating: { residentThreshold, comparator }` — gates obligations on resident count, with `gt` / `gte` precision
- `breachDefinitionExcludesEncrypted: { applies, citation, description }` — for jurisdictions whose statutory definition of "breach" excludes encrypted data with uncompromised key (per-se rule). Used by CA, TX, CO, MA.
- Per-obligation `conditionalGates` safe-harbor gate keyed to the `gdprUnintelligibility` input (`role: "safeHarbor"`, `onSatisfied: "suppress"`, `suppressionType: "unintelligibility_exemption"`, with `citation` and `description`) — for jurisdictions where the obligation exists but is conditionally exempted when appropriate technical and organisational measures rendered the data unintelligible (judgment-based, with the supervisory authority retaining override power). Used by EU GDPR Art. 34(3)(a) and UK GDPR Art. 34(3)(a).
- `counselNotes: [{ id, title, content, citation, source_url }]` — jurisdiction-level prose flags rendered on the results page and in the downloadable memo. Used for substantive judgments, sectoral overlays, definitional nuances, and obligations that the engine cannot model. Currently used by CA (1 note: § 1280.15 healthcare regime), MA (1 note: § 3(b) dual trigger), NY (3 notes: NYDFS sectoral overlay, HIPAA / HITECH cross-link, inadvertent-disclosure exception (§ 899-aa(2)(a))), and VA (4 notes: substantive harm threshold under § 18.2-186.6, § 32.1-127.1:05 medical-information regime, § 18.2-186.6(M) employer/payroll tax-data regime, good-faith employee/agent carve-out). Pattern available for other substantive judgments and sectoral overlays.

# Appendix: Model gaps (not yet hit by current jurisdictions)

- **Multi-authority obligations** — currently handled by stacking adjacent
  obligations. Reconsider when New York or similar jurisdiction is added.
- **Sectoral exemption gating** — entity-type-driven exemptions (HIPAA, GLBA)
  not currently modelled. Sectoral overlays (e.g., Cal. Health & Safety Code
  § 1280.15) are surfaced via `counselNotes` rather than as discrete engine
  obligations — a deliberate scoping choice to avoid opening the full
  sectoral-regimes door.
- **Substantive-judgment gates** — "misuse not reasonably likely" (CO),
  "substantial risk of identity theft or fraud" (MA) — not modelled because
  they require legal judgment, not data inputs. Candidates for `counselNotes`.
- **Extension provisions** — "good cause" extensions in some statutes are not
  modelled.
---

# Appendix: Intake form template

The following template is the canonical structure for all new jurisdiction
intakes. Copy from `## N.1 Identifier & display` through `## N.M Sign-off`,
renumber the section prefixes to the next jurisdiction number, fill in all
fields, and mark unused fields *(none)* rather than deleting them. Do not
remove sections without recording the deletion in the Sign-off's Material
change line.

The template assumes a U.S. state intake. For non-U.S. jurisdictions, see
the **Adaptation for non-U.S. jurisdictions** note at the end.

---

# N. [Jurisdiction Name] — [Statutory citation]

## N.1 Identifier & display

- **Internal ID:** `xx` (two-letter, lowercase, ISO-style where applicable)
- **Display name:** [as users will see it]
- **Short form:** [as it appears in deadline cards and the memo]
- **Statute name (subtitle):** [full citation as it appears in the rules engine `statute` field]

## N.2 Resident-count input

- **Does this jurisdiction have any rule that depends on resident count?** **[Yes / No.]**
  [If yes, state which obligations and what thresholds. If no, confirm that no resident-count input is rendered for this jurisdiction.]
- **Label:** [text shown to the user, e.g., "California residents affected"]
- **Placeholder:** [example value shown in the empty input]

## N.3 Resident notification

- **Required?** [Yes / No / Conditional — describe the gate]
- **Deadline:** [hours, days, or "no fixed clock — without unreasonable delay"]
- **Trigger event:** [awareness / discovery / determination of breach / other — match the IAPP chart's "Notification trigger" language where possible]
- **Authority name:** [as it appears in the rules engine, e.g., "Affected California Residents"]
- **Citation:** [statutory subsection]
- **Source URL:** [primary source — legislation site, regulator guidance, or comparable]
- **Conditional / exception language:** [text from the rules engine `condition` field; verbatim or paraphrase as appropriate]

## N.4 Regulator notification — [Authority]

- **Required?** [Yes / No / Conditional]
- **Authority name:** [exact display string]
- **Threshold:** [number and comparator — `gt N` for "more than N"; `gte N` for "N or more"]
- **Deadline:** [hours, days, or no fixed clock; or `deadline_relative_to: { parent_authority: "..." }` for cascading]
- **Trigger event:** [match the parent obligation, or specify the dependent trigger if cascading]
- **Citation:** [statutory subsection]
- **Source URL:** [regulator portal where possible]
- **Conditional language:** [from rules engine]

[Repeat N.4 sub-section for each additional authority — CRA, OCABR, sectoral regulators, etc. Number them N.4a, N.4b, etc., or split into separate top-level sections N.5, N.6 as the jurisdiction's structure requires.]

## N.5 [or next] Encryption suppression

- **Mechanism:** Choose ONE of:
  - **`breachDefinitionExcludesEncrypted`** — for jurisdictions whose statute *definitionally* excludes encrypted data with uncompromised key from the breach definition (most U.S. states).
  - **Per-obligation `conditionalGates` safe-harbor gate keyed to the `gdprUnintelligibility` input** (`suppressionType: "unintelligibility_exemption"`) — for jurisdictions where the obligation exists but is conditionally exempted when appropriate measures rendered the data unintelligible (EU/UK GDPR Art. 34(3)(a) and analogues).
  - **None** — explicitly state that this jurisdiction has no encryption-related suppression mechanism modeled, and explain why (e.g., not present in statute; substantive-judgment gate not modeled; sectoral regime not modeled).
- **Citation:** [statutory subsection or article — for U.S. states this is typically the definitions section]
- **Description:** [the verbatim or near-verbatim text that appears in the rules-engine `description` field]
- **Specific encryption standard, if any:** [e.g., "Massachusetts requires 128-bit or higher" — note here, surface in UI copy where useful]

## N.6 Other obligations not modelled

- [List sectoral obligations, content/format requirements, identity-theft mitigation services, owner-licensee notification, substitute-notice provisions, etc., that exist in the statute but are out of scope for the rules engine.]
- [For each, indicate whether it should be surfaced via a `counselNotes` entry.]

## N.7 Trigger nuances

- [Note any unusual aspects of the trigger that might trap users: definitional differences between awareness / discovery / determination; dual triggers; processor-awareness imputation; law-enforcement delay provisions; phased reporting allowances; "without unreasonable delay" interpretations.]

## N.8 Model fit

A checklist of which model features the jurisdiction exercises. Mark each with `[x]` (used) or `[ ]` (not applicable) and add a brief note. New features needed to model this jurisdiction get a separate sub-bullet listing the change required.

- [ ] `deadline_hours: number | null` — fixed-clock or unfixed-clock deadlines
- [ ] `deadline_relative_to: { parent_authority }` — cascading deadlines
- [ ] `gating: { highRiskRequired }` — sensitivity-based gating
- [ ] `gating: { residentThreshold, comparator }` — resident-count-based gating
- [ ] `breachDefinitionExcludesEncrypted` — per-se encryption exclusion
- [ ] Per-obligation `conditionalGates` safe-harbor gate on the `gdprUnintelligibility` input — judgment-based encryption exemption
- [ ] `counselNotes` — jurisdiction-level prose flag(s)
- **New features needed (if any):** [list]

## N.9 Counsel notes

Each in-app counsel note added for this jurisdiction must be documented here with its `id`, title, and the substantive concern it surfaces. Use a separate bullet for each note. If a substantive issue is identified but not yet implemented as a counsel note, record it here as a candidate for future addition.

- **In-app counsel note: [title].** Note id: `[id]`. [Substantive description of what the note flags and why.]
- **Candidate for future counsel note: [title].** [Why it might be worth surfacing.]

## N.10 Recommended test cases

| Fact pattern | Expected outcome |
|---|---|
| [boundary case at threshold] | [which obligations fire / don't] |
| [encryption applied + jurisdiction selected] | [suppression status of each obligation] |
| [missing resident count] | [behavior — typically threshold-gated obligations don't fire] |

[Aim for 3–6 cases per jurisdiction covering: each threshold boundary; encryption interaction; high-risk vs. standard sensitivity; cascading-deadline drop-when-parent-doesn't-fire if applicable; multi-authority parallel firing if applicable.]

## N.11 Sign-off

- **Rules verification:** [Drafted through formal intake on YYYY-MM-DD, with primary-source verification of [statute(s) and amendment(s) cited].]
- **IAPP chart consistency:** [Cross-checked against the IAPP US State Breach Notification Chart (version: [chart version], dated [chart date]) on YYYY-MM-DD. **Status: [fully consistent / inconsistent (see notes) / partially modeled (see notes)]** on [list the dimensions checked: statute, trigger, individual deadline, AG threshold and deadline, CRA threshold and deadline if applicable, encryption treatment]. [If status is not "fully consistent," explain the inconsistency or partial-modeling note here, with a pointer to the relevant Counsel Notes section.] [If a primary-source verification puts the form temporarily ahead of the chart, document that deviation here.]]
- **Sources confirmed via web search:** [list — primary statutes, regulator pages, recent amendments, law-firm analyses where they corroborated novel interpretations]
- **Sources confirmed via project knowledge base:** IAPP US State Breach Notification Chart, [version].
- **Material change since prior draft:** [If this is a revision rather than a first draft: what changed and why. If first draft, write "First draft."]
- **Reviewer:** *(pending — name / role / date when reviewed)*

---

## Adaptation for non-U.S. jurisdictions

For non-U.S. jurisdictions (EU GDPR, UK GDPR, and any future non-U.S.
additions), the template above applies with the following modifications:

- **Section N.1 Statute name (subtitle)** uses the regulation/directive title rather than a U.S. state code citation.
- **Section N.2 Resident-count input** is typically *None* for jurisdictions like GDPR where notification turns on risk rather than count. State this explicitly.
- **Section N.3 / N.4 / N.5 Authority names and citations** use the relevant articles (e.g., Art. 33 for GDPR supervisory authority notification; Art. 34 for individual notification).
- **Encryption-suppression mechanism** for EU/UK is the per-obligation `conditionalGates` safe-harbor gate keyed to the `gdprUnintelligibility` input (judgment-based, partial — exempts individual notification only). Not the per-se U.S. mechanism.
- **Section N.11 Sign-off** replaces the **IAPP chart consistency** line with **Primary-source consistency:** "Cross-checked against [primary source — e.g., EUR-Lex consolidated text, EDPB Guidelines, ICO guidance] on YYYY-MM-DD. Status: [...]." The IAPP chart does not cover non-U.S. jurisdictions; do not list it as a project knowledge base source.

