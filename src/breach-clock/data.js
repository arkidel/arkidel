// =============================================================================
// JURISDICTIONS — single source of truth for breach-notification rules.
//
// Each entry describes every rule the engine relies on for that jurisdiction.
// To add a jurisdiction: append a new object below. No other code changes
// should be required.
//
// This file is the legal-substance layer. Changes here should follow the
// formal intake process documented in docs/intake-forms.md (or the equivalent
// path in this project) — primary-source verification, IAPP chart cross-check
// for U.S. states, and an updated Sign-off line in the relevant intake form.
//
// Cross-checked against the IAPP US State Breach Notification Chart (February
// 2026 update, dated March 23, 2026) for all U.S. states modelled here on the
// dates noted in the intake forms. EU and UK GDPR rules verified against
// EUR-Lex consolidated text and ICO guidance respectively.
// =============================================================================

// Q1 personal-data categories — the canonical `sensitivity` input vocabulary.
// Category-conditioned pass (JDC review 2026-07-25): `ssn` is a standalone
// element (SSN / ITIN / other taxpayer IDs) positioned directly above
// `gov_id`, and `gov_id` no longer includes SSN. The ids are substantive:
// `ssn` gates the CT / DE / MA service obligations (gating.categories), and
// `gov_id` without `ssn` produces the "ssn_unconfirmed" advisory state.
// The UI (BreachClock.jsx) adopts this list in the follow-on rendering commit;
// until then its local copy predates the ssn split.
const SENSITIVITY_OPTIONS = [
  { id: "identifiers", label: "Identifiers (name, email, address)" },
  { id: "ssn", label: "Social Security numbers (or ITIN / other taxpayer IDs)" },
  { id: "gov_id", label: "Government IDs (passport, driver's license, state ID)" },
  { id: "financial", label: "Financial (account, card, credentials)" },
  { id: "health", label: "Health or medical information" },
  { id: "biometric", label: "Biometric or genetic data" },
  { id: "children", label: "Data concerning children" },
  { id: "special", label: "Other sensitive / special-category data", desc: "e.g., racial or ethnic origin, political opinions, religious or philosophical beliefs, trade-union membership, sex life or sexual orientation" },
  { id: "credentials", label: "Authentication credentials (passwords, tokens)" },
  { id: "location", label: "Precise geolocation" },
  { id: "communications", label: "Private communications content" },
];

// Harm-assessment gate (harm-gate pass, commit 1 of 2; JDC sign-off
// 2026-08-02). Obligations may carry
// `harmGate: { standard, citation, character }` — the per-obligation
// statutory harm standard, captured VERBATIM from the 2026-08-01
// primary-source review. `character` is "exemption" (the duty arises and is
// excused — CT, DE, CO) or "duty_element" (the duty never arises absent the
// harm element — VA; commit-2 rendering must present it as a negated duty
// element, never as an exemption). When `facts.harmAssessment` is exactly
// "determined_unlikely" — an attestation that a documented determination
// under the applicable standard exists, NOT a harm conclusion the tool draws
// — every obligation carrying a harmGate joins the `suppressed` output with
// the gate's mechanism; every other value computes everything. An ABSENT
// harmGate means the harm answer is inert for that obligation (CA, TX, NY,
// MA, EU, UK) — enforced by field absence, no engine special-casing. NY and
// MA instead carry a jurisdiction-level `harmNonGateExplainer` (rendered in
// commit 2 when a harm determination is recorded) explaining why the
// determination does not reach them. Colorado deliberately encodes TWO
// different standards — residents/CRA § 6-1-716(2)(a) vs AG
// § 6-1-716(2)(f)(I) — never share one string. Service obligations cascade
// through their own harmGate (CT via the resident (b)(1) standard; DE via
// the express § 12B-102(e) carve-out). Harm and risk (EU/UK riskLevel)
// never prefill each other.
const JURISDICTIONS = [
  {
    id: "eu",
    name: "European Union",
    short: "EU GDPR",
    statute: "Regulation (EU) 2016/679 (GDPR)",
    obligations: [
      {
        kind: "authority",
        authority: "Lead Supervisory Authority",
        deadline_hours: 72,
        deadline_trigger: "awareness",
        deadline_phrase: "72 hours from awareness",
        gating: { riskRequired: true },
        citation: "Art. 33 GDPR",
        source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679#d1e3185-1-1",
        condition: "Required within 72 hours of awareness unless the breach is assessed as unlikely to result in a risk to the rights and freedoms of natural persons.",
        riskSuppression: {
          citation: "Art. 33(5) GDPR",
          description: "Where the breach is assessed as unlikely to result in a risk to the rights and freedoms of natural persons, notification to the supervisory authority is not required. The controller must nonetheless document the breach, its effects, and the reasoning supporting that assessment (Art. 33(5)).",
        },
      },
      {
        kind: "individual",
        authority: "Affected Data Subjects",
        deadline_hours: null, // "without undue delay"
        deadline_trigger: "awareness",
        deadline_phrase: "without undue delay",
        gating: { highRiskRequired: true },
        citation: "Art. 34 GDPR",
        source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679#d1e3220-1-1",
        condition: "Required without undue delay where the breach is assessed as likely to result in a high risk to the rights and freedoms of data subjects.",
        riskSuppression: {
          citation: "Art. 34 GDPR",
          description: "Communication to data subjects is required only where the breach is likely to result in a high risk. Where the risk is assessed as lower than high, individual notification is not required; the assessment should be documented.",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "gdprUnintelligibility",
            equals: "yes",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "unintelligibility_exemption",
            citation: "Art. 34(3)(a) GDPR",
            description: "Individual notification is not required if the controller implemented appropriate technical and organisational protection measures, and those measures were applied to the personal data affected by the breach — in particular measures that render the data unintelligible to unauthorised persons. Encryption is the canonical example, but not the only such measure. The supervisory authority retains power under Art. 34(4) to require notification regardless. Art. 34(3) also provides two further exemptions not modelled here: (b) subsequent measures eliminating the high risk, and (c) disproportionate effort (with public communication required instead). This provision does NOT exempt the Art. 33 supervisory-authority notification.",
          },
        ],
      },
    ],
  },
  {
    id: "uk",
    name: "United Kingdom",
    short: "UK GDPR",
    statute: "UK GDPR & Data Protection Act 2018",
    obligations: [
      {
        kind: "authority",
        authority: "Information Commissioner's Office (ICO)",
        deadline_hours: 72,
        deadline_trigger: "awareness",
        deadline_phrase: "72 hours from awareness",
        gating: { riskRequired: true },
        citation: "Art. 33 UK GDPR",
        source_url: "https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/",
        condition: "Required within 72 hours of awareness unless the breach is assessed as unlikely to result in a risk to the rights and freedoms of natural persons.",
        riskSuppression: {
          citation: "Art. 33(5) UK GDPR",
          description: "Where the breach is assessed as unlikely to result in a risk to the rights and freedoms of natural persons, notification to the supervisory authority is not required. The controller must nonetheless document the breach, its effects, and the reasoning supporting that assessment (Art. 33(5) UK GDPR).",
        },
      },
      {
        kind: "individual",
        authority: "Affected Data Subjects",
        deadline_hours: null,
        deadline_trigger: "awareness",
        deadline_phrase: "without undue delay",
        gating: { highRiskRequired: true },
        citation: "Art. 34 UK GDPR",
        source_url: "https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/",
        condition: "Required without undue delay where the breach is assessed as likely to result in a high risk to the rights and freedoms of data subjects.",
        riskSuppression: {
          citation: "Art. 34 UK GDPR",
          description: "Communication to data subjects is required only where the breach is likely to result in a high risk. Where the risk is assessed as lower than high, individual notification is not required; the assessment should be documented.",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "gdprUnintelligibility",
            equals: "yes",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "unintelligibility_exemption",
            citation: "Art. 34(3)(a) UK GDPR",
            description: "Individual notification is not required if the controller implemented appropriate technical and organisational protection measures rendering the data unintelligible to unauthorised persons. Encryption is the canonical example. The ICO retains power under Art. 34(4) to require notification regardless. Art. 34(3) also provides two further exemptions not modelled here: (b) subsequent measures eliminating the high risk, and (c) disproportionate effort. This provision does NOT exempt the Art. 33 ICO notification.",
          },
        ],
      },
    ],
    counselNotes: [
      {
        id: "uk-pecr-breach-clock-duaa-2025",
        placement: "sectoral",
        title: "PECR sectoral overlay — 72-hour breach clock for public electronic communications providers (DUAA 2025)",
        content: "If the entity is a provider of a public electronic communications service, personal data breaches are additionally governed by the breach-notification regime in the Privacy and Electronic Communications Regulations 2003 (PECR), separate from UK GDPR Arts. 33 and 34. The Data (Use and Access) Act 2025 aligned the PECR breach-notification clock to 72 hours, matching the UK GDPR Art. 33 timescale (it was previously 24 hours under the EU-derived rules). This is a sectoral, entity-type-dependent regime that Respond does not model — applicability depends on the entity's status as a communications provider rather than on the breach facts (same treatment as the NYDFS sectoral overlay for New York). If the entity is in scope, treat the PECR notification as a separate parallel clock to the ICO. UK GDPR Arts. 33 and 34 themselves are unchanged by the DUAA.",
        citation: "Data (Use and Access) Act 2025; Privacy and Electronic Communications (EC Directive) Regulations 2003 (SI 2003/2426)",
        source_url: "https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/",
      },
    ],
  },
  {
    id: "ca",
    name: "California",
    short: "California",
    statute: "Cal. Civ. Code § 1798.82 et seq.",
    residentField: { stateLabel: "California residents affected", placeholder: "e.g. 750" },
    obligations: [
      {
        kind: "individual",
        authority: "Affected California Residents",
        deadline_hours: 30 * 24, // SB-446, eff. Jan. 1, 2026
        deadline_trigger: "discovery or notification of breach",
        deadline_phrase: "30 calendar days from discovery or notification of breach",
        citation: "Cal. Civ. Code § 1798.82(a)",
        source_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.82.&lawCode=CIV",
        condition: "Within 30 calendar days following discovery or notification of the breach (SB-446, effective January 1, 2026). Delay permitted only to accommodate the legitimate needs of law enforcement or as necessary to determine the scope of the breach and restore the reasonable integrity of the data system.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Cal. Civ. Code § 1798.82(a)",
            description: "Notification is required only where unencrypted personal information was acquired, OR where encrypted information was acquired AND the encryption key or security credential was also acquired (or is reasonably believed to have been acquired) AND the person has a reasonable belief that the key or credential could render the personal information readable or usable (Cal. Civ. Code § 1798.82(a)(1)). If only encrypted data was acquired and the key was not compromised, no notification obligation arises.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "California Attorney General",
        deadline_hours: 15 * 24, // 15 days from resident notification
        deadline_relative_to: { parent_authority: "Affected California Residents" },
        deadline_trigger: "resident notification",
        deadline_phrase: "15 calendar days from notice to residents",
        gating: { residentThreshold: 500, comparator: "gt" }, // SB-446 changed this to "more than 500"
        thresholdLabel: "AG notification",
        citation: "Cal. Civ. Code § 1798.82(f)",
        source_url: "https://oag.ca.gov/privacy/databreach/reporting",
        condition: "Within 15 calendar days of notifying affected California residents (SB-446, effective January 1, 2026). Required where a single breach involves more than 500 California residents. Electronically submit a single sample copy of the notification, excluding any personally identifiable information, via the California AG's breach reporting portal.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Cal. Civ. Code § 1798.82(a)",
            description: "AG notification is contingent on resident notification, which itself depends on the breach involving unencrypted data (or encrypted data with a compromised key). If encryption applies, no breach-notification obligation arises.",
          },
        ],
      },
    ],
    counselNotes: [
      {
        id: "ca-health-safety-code-1280-15",
        placement: "sectoral",
        title: "Healthcare facilities — separate state breach reporting under § 1280.15",
        content: "If the affected entity is a clinic, health facility, home health agency, or hospice licensed under California law, breach notification to the California Department of Public Health is required no later than 15 business days after detection of unauthorized access to, or use or disclosure of, a patient's medical information under Cal. Health & Safety Code § 1280.15. This is a sectoral regime separate from the general breach-notification statute and is not modeled by Respond — if applicable, the 15-business-day clock runs in parallel with the general obligations above.",
        citation: "Cal. Health & Safety Code § 1280.15",
        source_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1280.15.&lawCode=HSC",
      },
    ],
  },
  {
    id: "tx",
    name: "Texas",
    short: "Texas",
    statute: "Tex. Bus. & Com. Code § 521.053",
    residentField: { stateLabel: "Texas residents affected", placeholder: "e.g. 300" },
    obligations: [
      {
        kind: "individual",
        authority: "Affected Texas Residents",
        deadline_hours: 60 * 24, // 60 days — corrected from 30; § 521.053(b) sets 60-day ceiling for individual notice
        deadline_trigger: "determination of breach",
        deadline_phrase: "60 days from determination of breach",
        citation: "Tex. Bus. & Com. Code § 521.053(b)",
        source_url: "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm",
        condition: "Without unreasonable delay and no later than the 60th day after the date the entity determines that the breach occurred. Delay permitted only as necessary to determine scope/restore integrity of the data system or for legitimate law-enforcement needs.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Tex. Bus. & Com. Code § 521.053(a)",
            description: "The statutory definition of 'breach of system security' covers encrypted data only when the person accessing it has the key required to decrypt the data. If the data was encrypted and the key was not also acquired, no breach has occurred under the statute and no notification is required.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Texas Attorney General",
        deadline_hours: 30 * 24, // 30 days — confirmed (S.B. 768, eff. Sept. 1, 2023)
        deadline_trigger: "determination of breach",
        deadline_phrase: "30 days from determination of breach",
        gating: { residentThreshold: 250, comparator: "gte" },
        thresholdLabel: "AG notification",
        citation: "Tex. Bus. & Com. Code § 521.053(i)",
        source_url: "https://www.texasattorneygeneral.gov/consumer-protection/data-breach-reporting",
        condition: "As soon as practicable and no later than the 30th day after determination of the breach where 250 or more Texas residents are affected. Electronic submission via the Texas AG's online breach reporting form.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Tex. Bus. & Com. Code § 521.053(a)",
            description: "AG notification is contingent on a 'breach of system security' having occurred. Encrypted data with an uncompromised key falls outside the statutory breach definition.",
          },
        ],
      },
      {
        kind: "cra",
        authority: "Nationwide Consumer Reporting Agencies",
        deadline_hours: null, // "without unreasonable delay" — no fixed clock
        deadline_trigger: "determination of breach",
        deadline_phrase: "without unreasonable delay",
        gating: { residentThreshold: 10000, comparator: "gt" }, // "more than 10,000 persons"
        thresholdLabel: "CRA notification",
        citation: "Tex. Bus. & Com. Code § 521.053(h)",
        source_url: "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm",
        condition: "Where notification is required to more than 10,000 persons at one time, the entity must also notify each nationwide consumer reporting agency (as defined by 15 U.S.C. § 1681a) of the timing, distribution, and content of the notices, without unreasonable delay.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Tex. Bus. & Com. Code § 521.053(a)",
            description: "CRA notification is contingent on the entity being required to notify individuals, which depends on a 'breach of system security' having occurred. Encryption with uncompromised key removes the breach.",
          },
        ],
      },
    ],
  },
  {
    id: "co",
    name: "Colorado",
    short: "Colorado",
    statute: "Colo. Rev. Stat. § 6-1-716",
    residentField: { stateLabel: "Colorado residents affected", placeholder: "e.g. 600" },
    obligations: [
      {
        kind: "individual",
        authority: "Affected Colorado Residents",
        deadline_hours: 30 * 24,
        deadline_trigger: "determination of breach",
        deadline_phrase: "30 days from determination of breach",
        citation: "Colo. Rev. Stat. § 6-1-716(2)(a)",
        source_url: "https://content.leg.colorado.gov/sites/default/files/2018a_1128_signed.pdf",
        condition: "In the most expedient time possible and without unreasonable delay, but not later than 30 days after determination that a security breach occurred. Notification not required if a prompt good-faith investigation determines misuse has not occurred and is not reasonably likely to occur.",
        // Harm-gate pass (2026-08-02): the § 6-1-716(2)(a) resident standard.
        // Deliberately DIFFERENT from the AG's (2)(f)(I) standard below
        // ("reasonably likely" here; "likely" there) — encode both verbatim,
        // never share one string.
        harmGate: {
          standard: "the misuse of information about a Colorado resident has not occurred and is not reasonably likely to occur",
          citation: "Colo. Rev. Stat. § 6-1-716(2)(a)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Colo. Rev. Stat. § 6-1-716(1)(h)",
            description: "Colorado defines 'security breach' as the unauthorized acquisition of UNENCRYPTED computerized data. Encrypted data with an uncompromised key falls outside the breach definition. Note: § 6-1-716(2)(a.4) and (2)(g) require disclosure for encrypted or otherwise secured personal information if the confidential process, encryption key, or other means to decipher the secured information was also acquired in the breach or was reasonably believed to have been acquired.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Colorado Attorney General",
        deadline_hours: 30 * 24,
        deadline_trigger: "determination of breach",
        deadline_phrase: "30 days from determination of breach",
        gating: { residentThreshold: 500, comparator: "gte" },
        thresholdLabel: "AG notification",
        citation: "Colo. Rev. Stat. § 6-1-716(2)(f)(I)",
        source_url: "https://coag.gov/resources/data-protection-laws/",
        condition: "Required where 500 or more Colorado residents are reasonably believed to have been affected. Same 30-day ceiling applies. Online Data Breach Reporting Form available via the Colorado AG.",
        // Harm-gate pass (2026-08-02): the AG's OWN § 6-1-716(2)(f)(I)
        // standard — "not likely", without the resident standard's
        // "reasonably". The dual encoding is deliberate.
        harmGate: {
          standard: "the misuse of information about a Colorado resident has not occurred and is not likely to occur",
          citation: "Colo. Rev. Stat. § 6-1-716(2)(f)(I)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Colo. Rev. Stat. § 6-1-716(1)(h)",
            description: "AG notification is contingent on a security breach having occurred. Encrypted data with an uncompromised key falls outside the statutory breach definition.",
          },
        ],
      },
      {
        kind: "cra",
        authority: "Nationwide Consumer Reporting Agencies",
        deadline_hours: null,
        deadline_trigger: "determination of breach",
        deadline_phrase: "without unreasonable delay",
        gating: { residentThreshold: 1000, comparator: "gt" },
        thresholdLabel: "CRA notification",
        citation: "Colo. Rev. Stat. § 6-1-716(2)(d)",
        source_url: "https://content.leg.colorado.gov/sites/default/files/2018a_1128_signed.pdf",
        condition: "Where more than 1,000 Colorado residents must be notified, the covered entity must also notify all nationwide consumer reporting agencies of the anticipated date of notification and approximate number of residents to be notified, without unreasonable delay. Does not apply to entities subject to GLBA Title V.",
        // Harm-gate pass (2026-08-02): the CRA duty cascades on the RESIDENT
        // (2)(a) standard — it arises only from required resident notice.
        harmGate: {
          standard: "the misuse of information about a Colorado resident has not occurred and is not reasonably likely to occur",
          citation: "Colo. Rev. Stat. § 6-1-716(2)(a)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Colo. Rev. Stat. § 6-1-716(1)(h)",
            description: "CRA notification is contingent on the entity being required to notify residents, which itself depends on a security breach having occurred. Encrypted data with uncompromised key removes the breach.",
          },
        ],
      },
      {
        // Primary-source review cycle (2026-08-01, JDC + Claude): declared
        // advisory added. Unlike the DE § 12B-102(f) and CT § 36a-701b(f)
        // parallels, the Colorado provision is textually conditioned on a
        // misuse determination for credential-type personal information —
        // that condition is carried in the conditional language below, per
        // the house rule for conditions that are not clean inputs.
        kind: "advisory",
        authority: "Login-credential breaches — misuse-conditioned direction and notice method under § 6-1-716(2)(a.3)",
        gating: { categories: { anyOf: ["credentials"] } },
        citation: "Colo. Rev. Stat. § 6-1-716(2)(a.3)",
        source_url: "https://content.leg.colorado.gov/sites/default/files/2018a_1128_signed.pdf",
        condition: "Where the investigation determines that login credentials for an online account (§ 6-1-716(1)(g)(I)(B)) have been misused or are reasonably likely to be misused, direct the affected person to promptly change the person's password and security question or answer, as applicable, or to take other steps appropriate to protect the online account with the covered entity and all other online accounts for which the person uses the same username or email address and password or security question or answer. Where the breached credentials are login credentials of an email account furnished by the covered entity, notice to that email address does not comply — provide notice by another method permitted under § 6-1-716(1)(f), or by clear and conspicuous notice delivered to the affected person online when the person is connected to the online account from an Internet protocol address or online location from which the covered entity knows the person customarily accesses the account. The direction must be given in the most expedient time possible and without unreasonable delay, but not later than thirty days after the date of determination that a security breach occurred.",
      },
    ],
    counselNotes: [
      {
        // Added in the harm-note conformance pass (JDC 2026-08-02):
        // Colorado's misuse-determination language previously lived only in
        // the (2)(a) condition text with no standing counsel note; the
        // conformed note gives the modelled gate the same counsel-note
        // treatment as VA/DE/CT, naming BOTH standards.
        id: "co-harm-exemption-6-1-716",
        placement: "caveat",
        title: "Misuse-determination exemptions under § 6-1-716(2)(a) and (2)(f)(I) — modelled via the harm-assessment question",
        content: "Colorado's notification duties carry misuse-determination exemptions under two deliberately different standards: resident notification (and the CRA duty that arises from it) is excused where a prompt good-faith investigation determines that the misuse of information about a Colorado resident has not occurred and is not reasonably likely to occur (§ 6-1-716(2)(a)); Attorney General notification is excused where the investigation determines that the misuse of information about a Colorado resident has not occurred and is not likely to occur (§ 6-1-716(2)(f)(I)). Both are modelled via the harm-assessment question: recording a documented determination suppresses each obligation under its own standard. The misuse determination remains counsel's substantive judgment, made and documented outside the tool; absent that determination, Respond's deadlines reflect the default position that notification is required. Document the determination contemporaneously and consult counsel before relying on it. Note also the structural predicate of § 6-1-716(2)(f)(I): the Attorney General duty attaches to \"the covered entity that must notify Colorado residents\" — where the investigation excuses resident notification under § 6-1-716(2)(a), the predicate for the Attorney General duty is likewise absent. A documented determination should address both statutory phrasings.",
        citation: "Colo. Rev. Stat. § 6-1-716(2)(a), (2)(f)(I)",
        source_url: "https://content.leg.colorado.gov/sites/default/files/2018a_1128_signed.pdf",
      },
      {
        // Added in the Colorado primary-source conformance pass (JDC
        // 2026-08-09, verified against the codified C.R.S.): standing note
        // for the § 6-1-716(3) compliance-procedure safe harbors —
        // informational only, not modelled as gating.
        id: "co-safe-harbors-6-1-716-3",
        placement: "caveat",
        title: "Compliance-procedure safe harbors under § 6-1-716(3) — Attorney General notice preserved",
        content: "Colorado deems a covered entity in compliance with this section's notice requirements where it notifies affected residents under its own notification procedures maintained as part of an information security policy, consistent with this section's timing requirements (§ 6-1-716(3)(a)), or where it maintains security-breach procedures pursuant to the laws, rules, regulations, guidances, or guidelines established by its state or federal regulator (§ 6-1-716(3)(b)). Both paths expressly preserve Attorney General notification under § 6-1-716(2)(f). In a conflict between the individual-notice time period under subsection (3) and the applicable state or federal law or regulation, the law or regulation with the shortest time frame for notice to the individual controls (§ 6-1-716(3)(b)). Respond's deadlines reflect the statutory defaults; counsel relying on a safe harbor should confirm eligibility and document the applicable regulatory procedures.",
        citation: "Colo. Rev. Stat. § 6-1-716(3)(a), (3)(b)",
        source_url: "https://content.leg.colorado.gov/sites/default/files/2018a_1128_signed.pdf",
      },
    ],
  },
  {
    id: "ma",
    name: "Massachusetts",
    short: "Massachusetts",
    statute: "M.G.L. c. 93H",
    // No residentField — MA notification is required regardless of count.
    // Harm-gate pass (2026-08-02): Massachusetts carries NO harmGate — the
    // second notification trigger has no harm qualifier, so a harm
    // determination can inform the § 1 analysis but can never suppress the
    // duty. Commit 2 renders this explainer when a harm determination is
    // recorded. Citation corrected per JDC ruling 2026-08-02: the trigger-two
    // bypass lives in the owner/licensor duty at § 3(b) (§ 3(a) is the
    // maintainer duty).
    harmNonGateExplainer: "Massachusetts' second § 3(b) trigger operates on unauthorized acquisition or use regardless of the § 1 risk element. M.G.L. c. 93H §§ 1, 3(b).",
    obligations: [
      {
        kind: "individual",
        authority: "Affected Massachusetts Residents",
        deadline_hours: null, // "as soon as practicable and without unreasonable delay"
        deadline_trigger: "awareness",
        deadline_phrase: "as soon as practicable and without unreasonable delay",
        citation: "M.G.L. c. 93H § 3",
        source_url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93h/Section3",
        condition: "Required regardless of resident count. Notice must include the resident's right to obtain a police report and security-freeze information; it must NOT include the nature of the breach or the number of residents affected (those go only to the AG and OCABR).",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            requiresStrength: "ge_128",
            defeatedBy: "keyAcquired",
            onSatisfied: "review",
            whenUnset: "fires",
            citation: "M.G.L. c. 93H § 1",
            description: "The encryption safe harbor excuses § 3(b)'s breach-of-security trigger, but § 3(b)'s second trigger (unauthorized acquisition or use, which has no encryption qualifier) must be independently assessed by counsel.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Massachusetts Attorney General",
        deadline_hours: null,
        deadline_trigger: "awareness",
        deadline_phrase: "as soon as practicable and without unreasonable delay",
        citation: "M.G.L. c. 93H § 3",
        source_url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93h/Section3",
        condition: "Required regardless of resident count. Notice must include nature of the breach, number of MA residents affected, entity details, type of personal information compromised, whether the entity maintains a Written Information Security Program, and steps taken or planned. Cannot be delayed because the affected resident count is not yet ascertained.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            requiresStrength: "ge_128",
            defeatedBy: "keyAcquired",
            onSatisfied: "review",
            whenUnset: "fires",
            citation: "M.G.L. c. 93H § 1",
            description: "The encryption safe harbor excuses § 3(b)'s breach-of-security trigger, but § 3(b)'s second trigger (unauthorized acquisition or use, which has no encryption qualifier) must be independently assessed by counsel.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Massachusetts Office of Consumer Affairs and Business Regulation (OCABR)",
        deadline_hours: null,
        deadline_trigger: "awareness",
        deadline_phrase: "as soon as practicable and without unreasonable delay",
        citation: "M.G.L. c. 93H § 3",
        source_url: "https://www.mass.gov/info-details/requirements-for-data-breach-notifications",
        condition: "Required in parallel with AG notification. OCABR identifies any consumer reporting agencies or state agencies that should also receive notification, and forwards those identifications to the entity for follow-up notification.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            requiresStrength: "ge_128",
            defeatedBy: "keyAcquired",
            onSatisfied: "review",
            whenUnset: "fires",
            citation: "M.G.L. c. 93H § 1",
            description: "The encryption safe harbor excuses § 3(b)'s breach-of-security trigger, but § 3(b)'s second trigger (unauthorized acquisition or use, which has no encryption qualifier) must be independently assessed by counsel.",
          },
        ],
      },
      {
        // Category-conditioned pass (JDC review 2026-07-25): upgraded from the
        // former standing counsel note `ma-credit-monitoring-93h-3a` to a
        // computed, ssn-gated service obligation. Statutory unit is "18 months".
        // The consumer-reporting-agency variant (42 months) is an entity-type
        // condition carried in the conditional language, not as an input, per
        // the NYDFS house rule. The obligation is contingent on an incident
        // requiring notice under § 3, so the § 1 encryption harbor (and the
        // § 3(b) dual-trigger caveat it reflects) cascades to it.
        kind: "service",
        authority: "Credit Monitoring Services for Affected Massachusetts Residents",
        gating: { categories: { anyOf: ["ssn"] } },
        service_duration_display: "18 months",
        trigger_note: "Breach involving a resident's Social Security number.",
        citation: "M.G.L. c. 93H § 3A(a)",
        source_url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93h/Section3A",
        condition: "Contract with a third party to offer each affected resident credit monitoring services at no cost for a period of not less than 18 months — not less than 42 months where the breached entity is a consumer reporting agency — together with all information necessary to enroll and information on placing a security freeze. The contract may not include reciprocal agreements for services in lieu of payment or the exchange of fees, and the offer may not be conditioned on the resident waiving the right to a private action. A certification of compliance must be filed with the Attorney General and the director of consumer affairs and business regulation. The obligation is contingent on an incident requiring notice under § 3.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            requiresStrength: "ge_128",
            defeatedBy: "keyAcquired",
            onSatisfied: "review",
            whenUnset: "fires",
            citation: "M.G.L. c. 93H § 1",
            description: "The § 3A duty is contingent on an incident requiring notice under § 3. The encryption safe harbor excuses § 3(b)'s breach-of-security trigger, but § 3(b)'s second trigger (unauthorized acquisition or use, which has no encryption qualifier) must be independently assessed by counsel.",
          },
        ],
      },
    ],
    counselNotes: [
      {
        id: "ma-dual-trigger-section-3b",
        placement: "caveat",
        title: "Dual notification trigger under § 3(b) — assess both",
        content: "Massachusetts c. 93H § 3(b) imposes the notification duty under TWO independent triggers, joined by 'or': (1) the entity knows or has reason to know of a 'breach of security' as defined in § 1, OR (2) the entity knows or has reason to know that personal information was acquired or used by an unauthorized person, or used for an unauthorized purpose. The two triggers do not have identical scope. The § 1 'breach of security' definition includes a substantial-risk-of-identity-theft-or-fraud requirement, a good-faith-acquisition carve-out for employees/agents acting for lawful purposes, and the encryption qualifier (encrypted data only counts if the key was also acquired). The second trigger contains none of these elements — it captures any unauthorized acquisition or use of personal information. As a result, the encryption-suppression analysis above (which derives from the § 1 definition) may be incomplete: even where encrypted data with an uncompromised key falls outside § 1, the second trigger of § 3(b) could independently require notification on facts where personal information was acquired or used by an unauthorized person. Likewise, a 'no substantial risk of identity theft or fraud' conclusion under § 1 does not by itself excuse notification if the second trigger is met. Confirm both triggers against the facts before concluding that notification is not required.",
        citation: "M.G.L. c. 93H §§ 1, 3(b)",
        source_url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93h/Section3",
      },
    ],
  },
  {
    id: "ny",
    name: "New York",
    short: "New York",
    statute: "N.Y. Gen. Bus. Law § 899-aa",
    residentField: { stateLabel: "New York residents affected", placeholder: "e.g. 800" },
    // Harm-gate pass (2026-08-02): New York carries NO harmGate — the
    // § 899-aa(2)(a) exception is a narrow compound requiring an inadvertent
    // disclosure by an authorized person AND the no-likely-harm
    // determination; the generic harm question attests only the latter, so
    // it cannot honestly gate NY. Commit 2 renders this explainer when a
    // harm determination is recorded.
    harmNonGateExplainer: "New York's exception requires an inadvertent disclosure by an authorized person — an element this determination does not establish. N.Y. Gen. Bus. Law § 899-aa(2)(a).",
    obligations: [
      {
        kind: "individual",
        authority: "Affected New York Residents",
        deadline_hours: 30 * 24, // 30 days — added by S2659B/A8872A, eff. December 21, 2024
        deadline_trigger: "discovery of breach",
        deadline_phrase: "30 days from discovery of breach",
        citation: "N.Y. Gen. Bus. Law § 899-aa(2)",
        source_url: "https://www.nysenate.gov/legislation/laws/GBS/899-AA",
        condition: "In the most expedient time possible and without unreasonable delay, but within 30 days after discovery of the breach. Delay permitted only for the legitimate needs of law enforcement under § 899-aa(4). The 2024 amendments removed the prior allowance for delay to determine scope or restore system integrity.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "N.Y. Gen. Bus. Law § 899-aa(1)(b)",
            description: "If the data was encrypted and the decryption key was not also compromised, the incident does not meet the statutory definition of 'private information' acquired in a breach.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "New York Attorney General",
        deadline_hours: null, // no fixed clock — "without delaying notice to residents"
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without delaying notice to residents",
        citation: "N.Y. Gen. Bus. Law § 899-aa(8)(a)",
        source_url: "https://formsnym.ag.ny.gov/OAGOnlineSubmissionForm/faces/OAGSBHome",
        condition: "Required whenever any New York resident is notified. No threshold. Submission via the AG's online breach reporting portal serves as simultaneous notice to the AG, Department of State, and Division of State Police; entities regulated by NYDFS notify NYDFS separately (see counsel notes).",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "N.Y. Gen. Bus. Law § 899-aa(1)(b)",
            description: "AG notification is contingent on notification to residents being required, which itself depends on a 'breach of the security of the system' having occurred. Encrypted data with uncompromised key falls outside the statutory definition of 'private information' acquired in such a breach.",
          },
        ],
      },
      {
        kind: "agency",
        authority: "New York Department of State",
        deadline_hours: null,
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without delaying notice to residents",
        citation: "N.Y. Gen. Bus. Law § 899-aa(8)(a)",
        source_url: "https://dos.ny.gov/",
        condition: "Required whenever any New York resident is notified, in parallel with AG and State Police notification. The AG's online breach reporting portal is the standard route for simultaneous submission to all three.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "N.Y. Gen. Bus. Law § 899-aa(1)(b)",
            description: "Department of State notification is contingent on notification to residents being required. Encrypted data with uncompromised key removes the breach.",
          },
        ],
      },
      {
        kind: "agency",
        authority: "New York Division of State Police",
        deadline_hours: null,
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without delaying notice to residents",
        citation: "N.Y. Gen. Bus. Law § 899-aa(8)(a)",
        source_url: "https://troopers.ny.gov/",
        condition: "Required whenever any New York resident is notified, in parallel with AG and Department of State notification.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "N.Y. Gen. Bus. Law § 899-aa(1)(b)",
            description: "State Police notification is contingent on notification to residents being required. Encrypted data with uncompromised key removes the breach.",
          },
        ],
      },
      {
        kind: "cra",
        authority: "Nationwide Consumer Reporting Agencies",
        deadline_hours: null,
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without delaying notice to residents",
        gating: { residentThreshold: 5000, comparator: "gt" },
        thresholdLabel: "CRA notification",
        citation: "N.Y. Gen. Bus. Law § 899-aa(8)(b)",
        source_url: "https://www.nysenate.gov/legislation/laws/GBS/899-AA",
        condition: "Where more than 5,000 New York residents are to be notified at one time, the entity must also notify all nationwide consumer reporting agencies of the timing, content, and distribution of the notices, and approximate number of affected residents, without delaying notice to residents.",
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "N.Y. Gen. Bus. Law § 899-aa(1)(b)",
            description: "CRA notification is contingent on the entity being required to notify residents. Encrypted data with uncompromised key removes the breach.",
          },
        ],
      },
    ],
    counselNotes: [
      {
        id: "ny-dfs-sectoral-overlay",
        placement: "sectoral",
        title: "NYDFS sectoral overlay — covered entities have a separate 72-hour notification under 23 NYCRR Part 500",
        content: "If the entity is a 'covered entity' under 23 NYCRR Part 500.1 (i.e., regulated by the New York Department of Financial Services), the entity must additionally notify NYDFS within 72 hours of determining that a cybersecurity event has occurred, in accordance with 23 NYCRR § 500.17(a). This is in addition to the AG / Department of State / State Police notification above and is governed by the DFS cybersecurity regulations rather than § 899-aa. The February 14, 2025 chapter amendment to § 899-aa (S804) clarified that the DFS-notification carve-out applies only to NYDFS-regulated entities; non-regulated entities do NOT owe DFS notification under § 899-aa(8). Respond does not model the 72-hour DFS clock because it depends on entity-type characteristics outside the breach facts. If you are a NYDFS covered entity, treat the DFS deadline as the binding clock for DFS, separate from this analysis.",
        citation: "23 NYCRR § 500.17(a); N.Y. Gen. Bus. Law § 899-aa(8)(a)(ii)",
        source_url: "https://www.dfs.ny.gov/industry_guidance/cybersecurity",
      },
      {
        id: "ny-hipaa-cross-link",
        placement: "parallel",
        anchor: "ag",
        title: "HIPAA / HITECH cross-link — 5 business days to AG after HHS notification",
        content: "If the entity is a HIPAA covered entity or business associate that is also required to notify the U.S. Department of Health and Human Services Secretary under HIPAA or HITECH for the same incident, then notification to the New York Attorney General must be provided within 5 business days of notifying the HHS Secretary. This applies even where the breach involves information that is not 'private information' as defined in § 899-aa. Respond does not model HIPAA / HITECH notification thresholds, so this 5-business-day clock should be applied separately if HHS notification is required.",
        citation: "N.Y. Gen. Bus. Law § 899-aa(9)",
        source_url: "https://www.nysenate.gov/legislation/laws/GBS/899-AA",
      },
      {
        id: "ny-inadvertent-disclosure-exception-899aa-2a",
        placement: "caveat",
        title: "Inadvertent-disclosure exception (§ 899-aa(2)(a)) — narrow gate, plus 10-day AG report and 5-year retention",
        content: "New York has no general harm-threshold exception. The only carve-out from the notification duty is § 899-aa(2)(a), and it is narrow. Notice to affected persons is not required only if BOTH (1) the exposure of private information was an inadvertent disclosure by persons authorized to access that information, AND (2) the person or business reasonably determines the exposure will not likely result in misuse of the information, financial harm to the affected persons, or — for unknown disclosure of online credentials — emotional harm. This is a fact-specific judgment. Respond's deadlines reflect the default position that notification is required. If the exception is invoked, two obligations attach: the determination must be documented in writing (such as in the Respond memo) and retained at least five years; and if the incident affects more than 500 New York residents, the written determination must be provided to the NY Attorney General within 10 days of the determination. The exception is unavailable where the disclosure was not inadvertent or involved access by an unauthorized person — the standard obligations then apply.",
        citation: "N.Y. Gen. Bus. Law § 899-aa(2)(a)",
        source_url: "https://www.nysenate.gov/legislation/laws/GBS/899-AA",
      },
    ],
  },
  {
    id: "va",
    name: "Virginia",
    short: "Virginia",
    statute: "Va. Code § 18.2-186.6",
    residentField: { stateLabel: "Virginia residents affected", placeholder: "e.g. 800" },
    obligations: [
      {
        kind: "individual",
        authority: "Affected Virginia Residents",
        deadline_hours: null, // "without unreasonable delay" — no fixed clock
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without unreasonable delay",
        citation: "Va. Code § 18.2-186.6(B)",
        source_url: "https://law.lis.virginia.gov/vacode/title18.2/chapter6/section18.2-186.6/",
        condition: "Notice required without unreasonable delay following discovery or notification of the breach. Notice may be reasonably delayed to allow the entity to determine the scope of the breach and restore the reasonable integrity of the system, or if a law-enforcement agency advises that notice will impede a criminal or civil investigation or homeland or national security. The breach must have caused, or the entity must reasonably believe has caused or will cause, identity theft or other fraud to a Virginia resident — see counsel note on the harm threshold.",
        // Harm-gate pass (2026-08-02): Virginia's harm language is a DUTY
        // ELEMENT, not an exemption — the § 18.2-186.6(B) duty never arises
        // absent the element. Commit-2 rendering must present suppression as
        // a negated duty element.
        harmGate: {
          standard: "causes, or the individual or entity reasonably believes has caused or will cause, identity theft or another fraud to any resident of the Commonwealth",
          citation: "Va. Code § 18.2-186.6(B)",
          character: "duty_element",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Va. Code § 18.2-186.6(A)",
            description: "The statute applies only to unencrypted or unredacted personal information. If the data was encrypted or redacted and the encryption key was not accessed or acquired, the incident does not meet the statutory definition of a breach. Section 18.2-186.6(C) makes the encryption boundary explicit: notification is required where encrypted information is accessed and acquired in an unencrypted form, or where the breach involves a person with access to the encryption key.",
          },
          {
            role: "safeHarbor",
            input: "redacted",
            equals: "yes",
            defeatedBy: "reidentificationAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Va. Code § 18.2-186.6(A)",
            description: "The statute applies only to unencrypted or unredacted personal information. If the data was encrypted or redacted and the encryption key was not accessed or acquired, the incident does not meet the statutory definition of a breach.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Virginia Attorney General",
        deadline_hours: null,
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without unreasonable delay",
        citation: "Va. Code § 18.2-186.6(B)",
        source_url: "https://www.oag.state.va.us/programs-initiatives/computer-crime",
        condition: "Required whenever any Virginia resident is notified. No threshold. Notice without unreasonable delay; the same law-enforcement-delay provisions that apply to resident notification also apply to AG notification. Notification is sent to the Computer Crime Section of the Office of the Attorney General by mail (or follow current AG guidance on submission method).",
        harmGate: {
          standard: "causes, or the individual or entity reasonably believes has caused or will cause, identity theft or another fraud to any resident of the Commonwealth",
          citation: "Va. Code § 18.2-186.6(B)",
          character: "duty_element",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Va. Code § 18.2-186.6(A)",
            description: "AG notification is contingent on resident notification being required. Encrypted or redacted data with uncompromised key falls outside the statutory breach definition.",
          },
          {
            role: "safeHarbor",
            input: "redacted",
            equals: "yes",
            defeatedBy: "reidentificationAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Va. Code § 18.2-186.6(A)",
            description: "AG notification is contingent on resident notification being required. Encrypted or redacted data with uncompromised key falls outside the statutory breach definition.",
          },
        ],
      },
      {
        kind: "cra",
        authority: "Nationwide Consumer Reporting Agencies",
        deadline_hours: null,
        deadline_trigger: "discovery of breach",
        deadline_phrase: "without unreasonable delay",
        gating: { residentThreshold: 1000, comparator: "gt" }, // "more than 1,000 persons at one time"
        thresholdLabel: "CRA notification",
        citation: "Va. Code § 18.2-186.6(E)",
        source_url: "https://law.lis.virginia.gov/vacode/title18.2/chapter6/section18.2-186.6/",
        condition: "Where notification is provided to more than 1,000 persons at one time, the entity must also notify all nationwide consumer reporting agencies of the timing, distribution, and content of the notice, without unreasonable delay.",
        // The CRA duty (§ 18.2-186.6(E)) is reached via its dependency on
        // individual notice, so it carries the (B) duty element.
        harmGate: {
          standard: "causes, or the individual or entity reasonably believes has caused or will cause, identity theft or another fraud to any resident of the Commonwealth",
          citation: "Va. Code § 18.2-186.6(B)",
          character: "duty_element",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Va. Code § 18.2-186.6(A)",
            description: "CRA notification is contingent on the entity being required to notify residents. Encrypted or redacted data with uncompromised key removes the breach.",
          },
          {
            role: "safeHarbor",
            input: "redacted",
            equals: "yes",
            defeatedBy: "reidentificationAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Va. Code § 18.2-186.6(A)",
            description: "CRA notification is contingent on the entity being required to notify residents. Encrypted or redacted data with uncompromised key removes the breach.",
          },
        ],
      },
    ],
    counselNotes: [
      {
        id: "va-harm-threshold-186-6",
        placement: "caveat",
        // Conformed to the modelled harm gate (JDC 2026-08-02): the former
        // "substantive judgment, not modelled" framing contradicted the live
        // harm-assessment question.
        title: "Substantive harm threshold under § 18.2-186.6 — modelled via the harm-assessment question",
        content: "Virginia's breach definition incorporates a substantive harm element: notification under § 18.2-186.6(B) is required only where the breach has caused, or the entity reasonably believes has caused or will cause, identity theft or other fraud to a Virginia resident. The same harm-threshold language appears in subsection (M) for the employer / payroll-service-provider tax-data regime. This element is modelled via the harm-assessment question: recording a documented determination suppresses the Virginia obligations as a negated duty element. The determination whether identity theft or another fraud has been or will be caused remains counsel's substantive judgment, made and documented outside the tool; absent that determination, Respond's deadlines reflect the default position that notification is required. Document the determination contemporaneously and consult counsel before relying on it.",
        citation: "Va. Code § 18.2-186.6(A), (B), (M)",
        source_url: "https://law.lis.virginia.gov/vacode/title18.2/chapter6/section18.2-186.6/",
      },
      {
        id: "va-medical-information-32-1-127-1-05",
        placement: "sectoral",
        title: "Medical information — separate breach notification regime under § 32.1-127.1:05",
        content: "Virginia has a separate breach notification statute for medical information, Va. Code § 32.1-127.1:05, applicable to certain entities holding medical information. Where the breach involves medical or health information, the requirements of § 32.1-127.1:05 may apply in addition to or instead of § 18.2-186.6, with different scope, timing, and content requirements. HIPAA covered entities and business associates may also have federal notification obligations under HIPAA/HITECH that interact with the Virginia regime. Respond does not model § 32.1-127.1:05 because it is a sectoral regime with applicability that depends on entity type rather than breach facts.",
        citation: "Va. Code § 32.1-127.1:05",
        source_url: "https://law.lis.virginia.gov/vacode/title32.1/chapter5/section32.1-127.1:05/",
      },
      {
        id: "va-employer-payroll-tax-data-186-6-m",
        placement: "parallel",
        anchor: "ag",
        title: "Employer / payroll-service-provider tax-data breaches — separate AG notification obligation under § 18.2-186.6(M)",
        content: "If the entity is an employer or payroll service provider, and the breach involves a Virginia employee's taxpayer identification number in combination with the income tax withheld for that employee, a separate notification obligation applies under § 18.2-186.6(M). This obligation runs in parallel to (not in place of) the main § 18.2-186.6 analysis above and requires notification to the Virginia Attorney General without unreasonable delay following discovery, with no resident-notification component and no CRA component. The harm threshold from the main statute applies — notification is required only where the breach has caused, or the entity reasonably believes has caused or will cause, identity theft or other fraud. Respond does not model this as a discrete obligation because applicability depends on entity type (employer or payroll service provider) and data type (TIN combined with income tax withheld) rather than on the breach facts themselves. If the entity is in scope, treat the subsection (M) AG notification as a separate parallel obligation. Note: subsection (M) applies only to information regarding the employer's own employees, not customers or other non-employees.",
        citation: "Va. Code § 18.2-186.6(M)",
        source_url: "https://law.lis.virginia.gov/vacode/title18.2/chapter6/section18.2-186.6/",
      },
      {
        id: "va-good-faith-employee-agent-carve-out",
        placement: "caveat",
        title: "Good-faith acquisition by employees or agents — not a breach under the statute",
        content: "Section 18.2-186.6(A) excludes from the breach definition the good-faith acquisition of personal information by an employee or agent of the entity for purposes of the entity, provided that the personal information is not used for a purpose other than a lawful purpose of the entity and is not subject to further unauthorized disclosure. This is a fact-specific carve-out; if the relevant unauthorized acquisition was by an employee or agent acting in good faith for the entity's purposes, no breach has occurred under the statute and notification is not required. Respond does not gate on this because it requires substantive judgment about employee intent and use of the data.",
        citation: "Va. Code § 18.2-186.6(A)",
        source_url: "https://law.lis.virginia.gov/vacode/title18.2/chapter6/section18.2-186.6/",
      },
    ],
  },
  {
    id: "de",
    name: "Delaware",
    short: "Delaware",
    statute: "6 Del. C. ch. 12B",
    residentField: { stateLabel: "Delaware residents affected", placeholder: "e.g. 600" },
    obligations: [
      {
        kind: "individual",
        authority: "Affected Delaware Residents",
        deadline_hours: 60 * 24,
        deadline_trigger: "determination of breach",
        deadline_phrase: "60 days from determination of the breach",
        citation: "6 Del. C. § 12B-102(c)",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
        condition: "Without unreasonable delay but not later than 60 days after determination of the breach of security. If a shorter notification timeframe applies under federal law, the shorter federal timeframe controls. Delay permitted at the request of a law-enforcement agency if notice would impede a criminal investigation — notice is then due after the agency determines that it will no longer impede the investigation. If the affected residents cannot be identified within the 60-day period despite reasonable diligence, notice is due as soon as practicable after identification, unless substitute notice was provided under § 12B-101(5)d.",
        // Harm-gate pass (2026-08-02): § 12B-102(a) risk-of-harm exception
        // (determination after an appropriate investigation).
        harmGate: {
          standard: "unlikely to result in harm to the individuals whose personal information has been breached",
          citation: "6 Del. C. § 12B-102(a)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "6 Del. C. § 12B-101(1)",
            description: "Delaware defines 'breach of security' as the unauthorized acquisition of computerized data that compromises the security, confidentiality, or integrity of personal information. Unauthorized acquisition of encrypted data is not a breach of security unless the unauthorized person also acquired, or is reasonably believed to have acquired, the encryption key and there is a reasonable belief that the key could render the personal information readable or usable. Encrypted data with an uncompromised key falls outside the breach definition.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Delaware Attorney General",
        deadline_hours: 0, // "not later than the time when notice is provided to the resident" — same date as the resident-notification deadline
        deadline_relative_to: { parent_authority: "Affected Delaware Residents" },
        deadline_trigger: "resident notification",
        deadline_phrase: "no later than notice to residents",
        gating: { residentThreshold: 500, comparator: "gt" }, // § 12B-102(d): "exceeds 500 residents" — gt, not gte
        thresholdLabel: "AG notification",
        citation: "6 Del. C. § 12B-102(d)",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
        condition: "Required where the number of affected Delaware residents to be notified exceeds 500. Notice to the Delaware Attorney General not later than the time when notice is provided to the resident.",
        harmGate: {
          standard: "unlikely to result in harm to the individuals whose personal information has been breached",
          citation: "6 Del. C. § 12B-102(a)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "6 Del. C. § 12B-101(1)",
            description: "AG notification is contingent on notice to residents being required. Encrypted data with an uncompromised key falls outside the statutory breach definition.",
          },
        ],
      },
      {
        // Category-conditioned pass (JDC review 2026-07-25): upgraded from the
        // former standing counsel note `de-credit-monitoring-12b-102-e` to a
        // computed, ssn-gated service obligation. Statutory unit is "1 year",
        // not "12 months".
        kind: "service",
        authority: "Credit Monitoring Services for Affected Delaware Residents",
        gating: { categories: { anyOf: ["ssn"] } },
        service_duration_display: "1 year",
        trigger_note: "Breach including a resident's Social Security number.",
        citation: "6 Del. C. § 12B-102(e)",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
        condition: "Credit monitoring services at no cost for a period of 1 year to each resident whose personal information, including Social Security number, was breached or is reasonably believed to have been breached. Provide all information necessary to enroll in the services and information on how the resident can place a credit freeze on the resident's credit file. Services are not required if, after an appropriate investigation, the person reasonably determines the breach of security is unlikely to result in harm to the affected individuals — the same risk-of-harm determination that excuses notice (see the § 12B-102(a) counsel note).",
        // Harm-gate pass (2026-08-02): the service carries its OWN harmGate
        // — the statute states the carve-out expressly for the service at
        // § 12B-102(e) — same standard, service-specific citation.
        harmGate: {
          standard: "unlikely to result in harm to the individuals whose personal information has been breached",
          citation: "6 Del. C. § 12B-102(e)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "6 Del. C. § 12B-101(1)",
            description: "The credit-monitoring duty is contingent on a breach of security having occurred. Encrypted data with an uncompromised key falls outside the statutory breach definition.",
          },
        ],
      },
      {
        // Category-conditioned pass (JDC review 2026-07-25): upgraded from the
        // former standing counsel note `de-email-credential-notice-12b-102-f`;
        // content unchanged. Gated on the credentials category per the
        // § 12B-101(7)a.5 definition (username or email address in combination
        // with a password or security question and answer).
        kind: "advisory",
        authority: "Email-credential breaches — notice restriction under § 12B-102(f)",
        gating: { categories: { anyOf: ["credentials"] } },
        citation: "6 Del. C. § 12B-102(f)",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
        condition: "If the breached credentials are for an email account furnished by the notifying entity, notice may not be sent to that email address. Use another method permitted under 6 Del. C. § 12B-101(5), or clear and conspicuous online notice delivered when the resident connects from the IP address or online location from which the resident customarily accesses the account. 6 Del. C. § 12B-102(f).",
      },
    ],
    counselNotes: [
      {
        id: "de-risk-of-harm-12b-102-a",
        placement: "caveat",
        // Conformed to the modelled harm gate (JDC 2026-08-02). The (e)
        // service carve-out's cross-reference to this note is preserved.
        title: "Risk-of-harm exception under § 12B-102(a) — modelled via the harm-assessment question",
        content: "Delaware's notification duty carries a risk-of-harm exception: notice is not required if, after an appropriate investigation, the person reasonably determines that the breach of security is unlikely to result in harm to the individuals whose personal information has been breached. The exception is modelled via the harm-assessment question: recording a documented determination suppresses the Delaware obligations under this standard. The unlikely-to-result-in-harm determination after an appropriate investigation remains counsel's substantive judgment, made and documented outside the tool; absent that determination, Respond's deadlines reflect the default position that notification is required. The same determination also excuses the § 12B-102(e) credit-monitoring offer. Document that determination contemporaneously and consult counsel before relying on it.",
        citation: "6 Del. C. § 12B-102(a)",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
      },
      {
        id: "de-notice-methods-12b-101-5",
        placement: "caveat",
        title: "Notice methods and substitute notice — § 12B-101(5)",
        content: "Permitted notice methods under § 12B-101(5): written notice; telephonic notice; or electronic notice, if consistent with the federal E-SIGN Act or if the person's primary means of communication with the resident is by electronic means. Substitute notice is available if the cost of providing direct notice would exceed $75,000, the number of affected residents exceeds 100,000, or the person does not have sufficient contact information — and requires ALL of the following: email notice where the person has email addresses for affected residents, conspicuous posting of the notice on the person's website, and notice to major statewide media, including publication on the person's major social-media platforms.",
        citation: "6 Del. C. § 12B-101(5)",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
      },
      {
        id: "de-security-duty-12b-100",
        placement: "sectoral",
        title: "Independent duty to safeguard personal information — § 12B-100",
        content: "Delaware imposes an independent duty to implement and maintain reasonable procedures and practices to protect personal information, separate from and predating any breach. 6 Del. C. § 12B-100.",
        citation: "6 Del. C. § 12B-100",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
      },
      {
        id: "de-good-faith-12b-101-1a",
        placement: "caveat",
        title: "Good-faith employee/agent acquisition — § 12B-101(1)a",
        content: "Good-faith acquisition of personal information by an employee or agent of the notifying entity for the purposes of the entity's business is not a breach of security, provided the personal information is not used for an unauthorized purpose or subject to further unauthorized disclosure. 6 Del. C. § 12B-101(1)a. Whether an insider's acquisition was in good faith and within business purposes is a fact-specific judgment; document the basis for that conclusion contemporaneously.",
        citation: "6 Del. C. § 12B-101(1)a",
        source_url: "https://delcode.delaware.gov/title6/c012b/index.html",
      },
    ],
  },
  {
    id: "ct",
    name: "Connecticut",
    short: "Connecticut",
    statute: "Conn. Gen. Stat. § 36a-701b",
    // Informational only — no Connecticut gate depends on resident count (the
    // AG notification is required regardless of the number affected).
    residentField: { stateLabel: "Connecticut residents affected", placeholder: "e.g. 800" },
    obligations: [
      {
        kind: "individual",
        authority: "Affected Connecticut Residents",
        deadline_hours: 60 * 24,
        deadline_trigger: "discovery of breach",
        deadline_phrase: "60 days from discovery of breach",
        citation: "Conn. Gen. Stat. § 36a-701b(b)(1)",
        source_url: "https://www.cga.ct.gov/current/pub/chap_669.htm",
        condition: "Without unreasonable delay but no later than 60 days after discovery of the breach, unless a shorter timeframe is required under federal law or delay is requested by law enforcement under § 36a-701b(d). Residents identified only after the 60-day window must be notified as expediently as possible, unless the risk exemption applies.",
        // Harm-gate pass (2026-08-02): the § 36a-701b(b)(1) harm exemption,
        // full verbatim statutory sentence (self-determination standard, no
        // law-enforcement-consultation element).
        harmGate: {
          standard: "Such notification shall not be required if, after an appropriate investigation the person reasonably determines that the breach will not likely result in harm to the individuals whose personal information has been acquired or accessed.",
          citation: "Conn. Gen. Stat. § 36a-701b(b)(1)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Conn. Gen. Stat. § 36a-701b(a)",
            description: "Connecticut's breach definition excludes data secured by encryption or by any other method or technology that renders the personal information unreadable or unusable. Note the statutory exclusion carries no express key-compromise proviso (unlike CO/NY); the gate conservatively treats an acquired key as defeating the harbor, since a compromised key no longer renders the data unreadable or unusable — see the no-key-proviso counsel note.",
          },
        ],
      },
      {
        kind: "ag",
        authority: "Connecticut Attorney General",
        deadline_hours: 60 * 24, // same 60-day-from-discovery clock as resident notice; due no later than notice to residents
        deadline_trigger: "discovery of breach",
        deadline_phrase: "no later than notice to residents",
        citation: "Conn. Gen. Stat. § 36a-701b(b)(2)(A)",
        source_url: "https://portal.ct.gov/ag/sections/privacy/reporting-a-data-breach",
        condition: "Required regardless of the number of residents affected, not later than the time when notice is provided to residents. The Attorney General's online submission form is the office's preferred method; supplements to a previously reported breach go to ag.breach@ct.gov with the PR case number.",
        harmGate: {
          standard: "Such notification shall not be required if, after an appropriate investigation the person reasonably determines that the breach will not likely result in harm to the individuals whose personal information has been acquired or accessed.",
          citation: "Conn. Gen. Stat. § 36a-701b(b)(1)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Conn. Gen. Stat. § 36a-701b(a)",
            description: "AG notification is contingent on notice to residents being required. Data secured by encryption or another method rendering it unreadable or unusable falls outside the statutory breach definition (no express key-compromise proviso — see the counsel note).",
          },
        ],
      },
      {
        kind: "service",
        authority: "Identity Theft Prevention Services for Affected Connecticut Residents",
        gating: { categories: { anyOf: ["ssn"] } },
        service_duration_display: "2 years",
        trigger_note: "Breach involving a resident's Social Security number or taxpayer identification number.",
        citation: "Conn. Gen. Stat. § 36a-701b(b)(2)(B)",
        source_url: "https://portal.ct.gov/ag/sections/privacy/reporting-a-data-breach",
        condition: "Appropriate identity theft prevention services and, if applicable, identity theft mitigation services. Such service or services shall be provided at no cost to such resident for a period of not less than two years. Such person shall provide all information necessary for such resident to enroll in such service or services and shall include information on how such resident can place a credit freeze on such resident's credit file.",
        // Harm-gate pass (2026-08-02): the (b)(2)(B) service is offered with
        // notice and falls when notice is excused — the cascade rides the
        // gate mechanism itself (the resident (b)(1) standard), not a
        // separate standard.
        harmGate: {
          standard: "Such notification shall not be required if, after an appropriate investigation the person reasonably determines that the breach will not likely result in harm to the individuals whose personal information has been acquired or accessed.",
          citation: "Conn. Gen. Stat. § 36a-701b(b)(1)",
          character: "exemption",
        },
        conditionalGates: [
          {
            role: "safeHarbor",
            input: "encrypted",
            equals: "yes",
            defeatedBy: "keyAcquired",
            onSatisfied: "suppress",
            whenUnset: "fires",
            suppressionType: "breach_definition",
            citation: "Conn. Gen. Stat. § 36a-701b(a)",
            description: "The identity-theft-prevention-services duty is contingent on notice to residents being required. Data secured by encryption or another method rendering it unreadable or unusable falls outside the statutory breach definition.",
          },
        ],
      },
      {
        kind: "advisory",
        authority: "Login-credential breaches — notice method under § 36a-701b(f)",
        gating: { categories: { anyOf: ["credentials"] } },
        citation: "Conn. Gen. Stat. § 36a-701b(f)",
        source_url: "https://www.cga.ct.gov/current/pub/chap_669.htm",
        condition: "Where the breach involves online-account login credentials, notice may be provided by directing the resident to promptly change the credentials. Where the breached credentials are for an email account furnished by the entity, notice to that email address does not comply — use another permitted method or clear and conspicuous online notice delivered when the resident connects from an IP address or online location from which the entity knows the resident customarily accesses the account.",
      },
    ],
    counselNotes: [
      {
        id: "ct-harm-exemption-36a-701b-b1",
        placement: "caveat",
        // Conformed to the modelled harm gate (JDC 2026-08-02): the former
        // "not modelled" framing and the queued-form-gate clause are removed.
        title: "Harm exemption (§ 36a-701b(b)(1)) — modelled via the harm-assessment question",
        content: "Connecticut's notification duty carries a harm exemption: \"Such notification shall not be required if, after an appropriate investigation the person reasonably determines that the breach will not likely result in harm to the individuals whose personal information has been acquired or accessed.\" This is a self-determination standard with no law-enforcement-consultation element. The exemption is modelled via the harm-assessment question: recording a documented determination suppresses the Connecticut obligations (and the § 36a-701b(b)(2)(B) service, which falls with the notice it accompanies) under this standard. The no-likely-harm determination after an appropriate investigation remains counsel's substantive judgment, made and documented outside the tool; absent that determination, Respond's deadlines reflect the default position that notification is required. Document that determination contemporaneously and consult counsel before relying on it.",
        citation: "Conn. Gen. Stat. § 36a-701b(b)(1)",
        source_url: "https://www.cga.ct.gov/current/pub/chap_669.htm",
      },
      {
        id: "ct-no-key-proviso-36a-701b-a",
        placement: "caveat",
        title: "No key-compromise proviso in the § 36a-701b(a) encryption exclusion",
        content: "Unlike Colorado and New York, Connecticut's definitional exclusion for encrypted data does not condition the exclusion on the encryption key remaining uncompromised — the definition excludes data secured by encryption or by any other method or technology that renders the personal information unreadable or unusable, with no express key proviso. Counsel should not assume the CO/NY key-compromise analysis transfers to Connecticut. Respond's gate conservatively treats an acquired key as defeating the harbor (a compromised key arguably leaves the data no longer 'unreadable or unusable'), so the obligations compute in that case rather than being silently excused; counsel may reach a different conclusion under the literal statutory text.",
        citation: "Conn. Gen. Stat. § 36a-701b(a)",
        source_url: "https://www.cga.ct.gov/current/pub/chap_669.htm",
      },
      {
        id: "ct-deemed-compliance-36a-701b-g-h",
        placement: "sectoral",
        title: "Own-procedures and functional-regulator deemed compliance — § 36a-701b(g), (h)",
        content: "Connecticut deems a person compliant if it maintains its own security-breach procedures consistent with the timing requirements of § 36a-701b and notifies residents in accordance with its policies in the event of a breach (subsection (g)), or if it complies with the security-breach requirements of its primary or functional regulator, including notice regimes under federal law such as HIPAA/HITECH (subsection (h)). These are entity-type-dependent provisions that Respond does not model (same treatment as the NYDFS sectoral overlay for New York). If the entity is subject to a functional regulator's breach regime, assess deemed compliance separately.",
        citation: "Conn. Gen. Stat. § 36a-701b(g), (h)",
        source_url: "https://www.cga.ct.gov/current/pub/chap_669.htm",
      },
      {
        id: "ct-cutpa-enforcement-36a-701b-j",
        placement: "caveat",
        title: "CUTPA enforcement context — § 36a-701b(j)",
        content: "Failure to comply with § 36a-701b constitutes an unfair trade practice for purposes of the Connecticut Unfair Trade Practices Act and is enforced by the Attorney General. This enforcement framing raises the stakes of a missed or late notification beyond the notification statute itself; it does not change any deadline modelled above.",
        citation: "Conn. Gen. Stat. § 36a-701b(j)",
        source_url: "https://www.cga.ct.gov/current/pub/chap_669.htm",
      },
    ],
  },
];

export { JURISDICTIONS, SENSITIVITY_OPTIONS };
