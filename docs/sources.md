# Arkidel — external sources & change tripwires

This file records the external sources of truth that Arkidel's substantive
layer (`src/breach-clock/data.js`) depends on, and the automated tripwires that
watch them for change. When a tripwire fires, the relevant `data.js` entries
must go back through the formal intake process (`docs/intake-forms.md`) before
the baseline here is updated.

---

## IAPP — US State Breach Notification Chart

**Role.** Primary cross-check source for every U.S.-state entry in
`src/breach-clock/data.js`. Each U.S.-state intake form records a consistency
check against this chart; a change to the chart is the signal to re-verify
those entries.

**Source of truth.** IAPP "US State Breach Notification Chart," published by the
IAPP Cybersecurity Law Center as a PDF.

**Resource page.**
<https://iapp.org/resources/article/state-data-breach-notification-chart>

The resource page is **not** a reliable change signal: it renders a legacy
`.xlsx` variant to anonymous visitors and the PDF to logged-in members, and its
"Last updated" date moves without a corresponding edition bump. The
authoritative edition marker is the **colophon inside the PDF** ("Updated
&lt;Month Year&gt;"), not the page date or the served-file variant.

**Asset URL (public CDN, stable).**
<https://assets.contentstack.io/v3/assets/bltd4dd5b2d705252bc/bltce14f03b577e3063/us_state_data_breach_notification_chart.pdf>

No IAPP credentials are needed to fetch this asset — it is served anonymously by
the Contentstack CDN (verified 2026-06-11). The tripwire fetches it
anonymously; it never logs in to IAPP and stores no credentials.

**Edition relied on.** Colophon "Updated February 2026"; manually confirmed
current 2026-06-11.

**Tripwire.** `scripts/check-iapp-chart.mjs` GETs the asset, computes the
sha256 of the bytes in memory (the PDF is never written to disk or committed),
reads the content-length, and compares both against the machine-readable
baselines below. Match → prints "IAPP chart unchanged (edition: February 2026)"
and exits 0. Any mismatch, fetch error, or unparseable baseline → prints a loud
operator message and exits non-zero. Run it with `node scripts/check-iapp-chart.mjs`.

When the baseline is updated for a new edition, bump both values below, update
the "Edition relied on" line, and the `EDITION` constant in
`scripts/check-iapp-chart.mjs`.

### Machine-readable baselines (parsed by scripts/check-iapp-chart.mjs)

```
baseline_content_length: 4356225
baseline_sha256: f662973acfacc0d032937b1e8a18ac190845ca7b8aaffd914777e68fcf89ec04
```
