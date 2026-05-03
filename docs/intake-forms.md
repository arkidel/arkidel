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
- **Reviewer:** *(pending)*
