// =============================================================================
// BREACH CLOCK — unified incident form (single React component).
//
// One form, not a step wizard, laid out in two columns: a wide main column
// (~3 parts) carrying the form, and a right rail (~1 part) carrying the
// parchment counsel notes. Nothing is pinned — the whole page scrolls as one.
// The rail notes flow in normal document order (top-down, in the order their
// questions appear) and each carries a title that connects it to its topic;
// they cluster near the top rather than aligning to their fields. Nothing
// computes on screen during entry — the user fills the form and presses Submit.
// On a valid Submit the main column switches to a read-only review (entered
// answers + computed deadline obligations) with the artifact controls (Download
// memo / Edit) at the top of the review content.
//
// Operative vs. record. Five inputs feed the engine (grouped under
// OPERATIVE_KEYS so quick mode and the cross-check can target them): awareness,
// jurisdictions + resident counts, Q1 personal-data types, encryption. They are
// NOT badged "required/operative" in the default full view — Submit validates
// them and says what's missing instead. Everything else is a record field,
// captured into the incident report, never seen by the engine.
//
// Quick mode is a focusing view over one shared state (not a separate
// workflow): it shows only the operative fields; entered record data persists
// across toggles. Engine wiring is unchanged — computeDeadlines / isHighRisk
// and the five-input shape are exactly as in the wizard; substantive legal
// changes still belong in data.js. Verify the engine with the in-app Tests view
// (footer link) after any change near the wiring.
// =============================================================================

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Scale, FileWarning, Info, Download, Check, Plus, Save, X, ChevronDown } from "lucide-react";
import { JURISDICTIONS, SENSITIVITY_OPTIONS } from "./data.js";
import { isHighRisk, computeDeadlines, runTests, TEST_AWARENESS } from "./engine.js";
import {
  groupResultsByJurisdiction,
  CONTINGENT_LABEL,
  CONTINGENT_EXPLAINER,
  HARM_ASSESSMENT_LABELS,
  RISK_LEVEL_LABELS,
  harmGatedJurisdictions,
  harmAssessmentSummary,
  harmNonGateDisplay,
  harmMechanismOf,
  orderBlocks,
  buildDeadlineQueue,
  noClockSummaryLine,
  QUEUE_MIN_BLOCKS,
} from "./results-grouping.js";
import { formatCountdown, countdownIsLive, COUNTDOWN_SHARED_INTERVAL_MS, COUNTDOWN_LIVE_INTERVAL_MS } from "./countdown.js";
import { computableGate, factsFromPayload } from "./facts.js";
import {
  deviceTimeZone,
  isValidTimeZone,
  formatDateTimeInZone,
  formatDateInZone,
  toDateTimeLocalInZone,
  COMMON_US_ZONES,
  allTimeZones,
  AWARENESS_TZ_CAVEAT,
} from "./timezone.js";
import { generateMemoPdf } from "./memo-pdf.js";
import { createIncident, updateIncident, updateIncidentStatus, updateIncidentNotifications, updateIncidentLog, updateIncidentViewState, getIncident } from "../data/incidents.js";
import { useOrg } from "../org/OrgProvider.jsx";
import ArkidelCaret from "../components/ArkidelCaret.jsx";
import usePageTitle from "../usePageTitle.js";
import { useTopBarHeader } from "../components/TopBarContext.jsx";

// Engine inputs. Grouped so quick mode (show only these) and the cross-check
// can reference the operative set without re-listing it inline.
const OPERATIVE_KEYS = ["awareness", "jurisdictions", "residentCounts", "sensitivity", "encryption"];

// incidents.view_state vocabulary (migration 20260822120000_add_view_state).
// Persisted blockOrder is "az" | "urgency"; the component's in-memory value
// is "alpha" | "urgency" (what orderBlocks in results-grouping.js takes). The
// two maps are the only translation point. Anything absent or unrecognized
// reads as the Urgency default — an empty view_state IS that default.
const BLOCK_ORDER_TO_VIEW_STATE = { alpha: "az", urgency: "urgency" };
const blockOrderFromViewState = (viewState) =>
  viewState && typeof viewState === "object" && viewState.blockOrder === "az" ? "alpha" : "urgency";
// Persisted per-block expansion (JDC ruling 2026-08-23): view_state.expanded
// is a sparse { [jurId]: boolean } overrides map over the computed collapse
// defaults. Where present it wins over the default; absent or malformed
// reads as "no overrides". Resubmit clears it (the fresh default applies to
// the recomputed results) while keeping blockOrder.
const expandedFromViewState = (viewState) => {
  const e = viewState && typeof viewState === "object" ? viewState.expanded : null;
  if (!e || typeof e !== "object" || Array.isArray(e)) return {};
  return Object.fromEntries(Object.entries(e).filter(([, v]) => typeof v === "boolean"));
};
// The full view_state row value. updateIncidentViewState replaces the jsonb
// wholesale, so every write composes BOTH keys from component state; an
// empty overrides map is omitted so a never-expanded incident writes exactly
// { blockOrder } (the pre-2026-08-23 shape).
const viewStateOf = (blockOrder, expanded) => ({
  blockOrder: BLOCK_ORDER_TO_VIEW_STATE[blockOrder],
  ...(Object.keys(expanded || {}).length > 0 ? { expanded } : {}),
});

// Citation tokens in headings and card citation lines never wrap
// mid-citation (queued CSS item, JDC 2026-08-23): each "§ …" / "art. …"
// token is wrapped in an inline-block nowrap span, so it drops to its own
// line as a unit when it would not fit rather than breaking internally.
// Matches a section sign (single or double) or "art."/"arts." followed by
// the pinpoint run up to the next whitespace, with trailing sentence
// punctuation left outside the span.
const CITATION_TOKEN = /(§§?\s?\d[^\s,;]*?|\b[Aa]rts?\.\s?\d[^\s,;]*?)(?=[.,;:]*(?:\s|$))/g;
const nowrapCitations = (text) => {
  if (typeof text !== "string" || !text.includes("§") && !/\b[Aa]rts?\.\s?\d/.test(text)) return text;
  const out = [];
  let last = 0;
  let m;
  CITATION_TOKEN.lastIndex = 0;
  while ((m = CITATION_TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={m.index} className="cite">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

// Collapse the two-column layout below this width (Tailwind `md` = 768px, the
// project's marketing-page mobile breakpoint).
const NARROW_QUERY = "(max-width: 768px)";

// The left-gutter section index is a wide-viewport-only affordance: it lives in
// the page's left margin (outside the 1180px content column), so it only renders
// once the gutter is wide enough to hold it without crowding the content.
// At 1480px the gutter is (1480-1180)/2 = 150px, comfortably more than the
// index's ~128px footprint.
const WIDE_QUERY = "(min-width: 1480px)";

// Left-gutter section index. `id` matches the id set on each form <section>;
// `label` is the short index-only label (the section headings keep their full
// Title Case). The index is derived from this array so the two stay in sync.
const FORM_SECTIONS = [
  { id: "form-general", label: "General" }, // General Information
  { id: "form-discovery", label: "Discovery" }, // How & When Discovered
  { id: "form-timing", label: "Timing" }, // When the Incident Occurred
  { id: "form-summary", label: "Summary" }, // Incident Summary
  { id: "form-data", label: "Data" }, // Data Affected
  { id: "form-measures", label: "Measures" }, // Measures
];

// Every collapsible section id, including the conditional Risk section (which
// only renders for an EU/UK jurisdiction) and the conditional Harm section
// (which only renders when a selected jurisdiction carries a harmGate).
// Drives Expand all / Collapse all; setting form-risk / form-harm open while
// they aren't rendered is harmless.
const ALL_SECTION_IDS = [...FORM_SECTIONS.map((s) => s.id), "form-risk", "form-harm"];

// The global top nav (src/components/Layout.jsx) is position:static — it scrolls
// away with the page rather than staying fixed — so the sticky index only needs
// a small breathing-room offset, not full nav-height clearance. The same value
// is the sections' scroll-margin-top so a jumped-to heading isn't flush to the
// viewport edge. (If that nav is ever made sticky, bump this to ~its height.)
const NAV_CLEARANCE = 32;

// ── Jurisdiction picker (UI layer only) ─────────────────────────────────────
// The picker is an additive combobox over the same jurisdictions/residentCounts
// maps the checkbox block wrote — payload shape unchanged. EU/UK group under
// "International"; every other modeled jurisdiction is "United States".
const INTL_JURISDICTION_IDS = new Set(["eu", "uk"]);

// The 54 IAPP-chart U.S. jurisdictions (50 states, DC, Guam, Puerto Rico,
// U.S. Virgin Islands). UI-layer reference only — used by bulk paste to tell
// "real U.S. jurisdiction we don't model yet" apart from "not recognized".
// NOT substantive data; the modeled set lives in data.js.
const US_CHART_JURISDICTIONS = [
  { name: "Alabama", postal: "AL" },
  { name: "Alaska", postal: "AK" },
  { name: "Arizona", postal: "AZ" },
  { name: "Arkansas", postal: "AR" },
  { name: "California", postal: "CA" },
  { name: "Colorado", postal: "CO" },
  { name: "Connecticut", postal: "CT" },
  { name: "Delaware", postal: "DE" },
  { name: "District of Columbia", postal: "DC" },
  { name: "Florida", postal: "FL" },
  { name: "Georgia", postal: "GA" },
  { name: "Guam", postal: "GU" },
  { name: "Hawaii", postal: "HI" },
  { name: "Idaho", postal: "ID" },
  { name: "Illinois", postal: "IL" },
  { name: "Indiana", postal: "IN" },
  { name: "Iowa", postal: "IA" },
  { name: "Kansas", postal: "KS" },
  { name: "Kentucky", postal: "KY" },
  { name: "Louisiana", postal: "LA" },
  { name: "Maine", postal: "ME" },
  { name: "Maryland", postal: "MD" },
  { name: "Massachusetts", postal: "MA" },
  { name: "Michigan", postal: "MI" },
  { name: "Minnesota", postal: "MN" },
  { name: "Mississippi", postal: "MS" },
  { name: "Missouri", postal: "MO" },
  { name: "Montana", postal: "MT" },
  { name: "Nebraska", postal: "NE" },
  { name: "Nevada", postal: "NV" },
  { name: "New Hampshire", postal: "NH" },
  { name: "New Jersey", postal: "NJ" },
  { name: "New Mexico", postal: "NM" },
  { name: "New York", postal: "NY" },
  { name: "North Carolina", postal: "NC" },
  { name: "North Dakota", postal: "ND" },
  { name: "Ohio", postal: "OH" },
  { name: "Oklahoma", postal: "OK" },
  { name: "Oregon", postal: "OR" },
  { name: "Pennsylvania", postal: "PA" },
  { name: "Puerto Rico", postal: "PR" },
  { name: "Rhode Island", postal: "RI" },
  { name: "South Carolina", postal: "SC" },
  { name: "South Dakota", postal: "SD" },
  { name: "Tennessee", postal: "TN" },
  { name: "Texas", postal: "TX" },
  { name: "U.S. Virgin Islands", postal: "VI" },
  { name: "Utah", postal: "UT" },
  { name: "Vermont", postal: "VT" },
  { name: "Virginia", postal: "VA" },
  { name: "Washington", postal: "WA" },
  { name: "West Virginia", postal: "WV" },
  { name: "Wisconsin", postal: "WI" },
  { name: "Wyoming", postal: "WY" },
];

// Combobox filter: case-insensitive substring over display name, short name,
// the uppercase id as a postal code (CA, NY, …), and the statute string (so
// "93H" finds Massachusetts and "899" finds New York).
const jurisdictionMatchesQuery = (jur, q) =>
  [jur.name, jur.short, jur.id.toUpperCase(), jur.statute].some((k) => k.toLowerCase().includes(q));

// Bulk-paste matching: exact (case-insensitive) on name, short name, or
// postal code — deliberately narrower than the combobox's substring filter so
// "Virginia" can never claim a "West Virginia" line.
const findModeledJurisdiction = (text) => {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return null;
  return (
    JURISDICTIONS.find(
      (j) => j.name.toLowerCase() === q || j.short.toLowerCase() === q || j.id.toLowerCase() === q
    ) || null
  );
};
const findChartJurisdiction = (text) => {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return null;
  return US_CHART_JURISDICTIONS.find((s) => s.name.toLowerCase() === q || s.postal.toLowerCase() === q) || null;
};

// One bulk-paste line → { jurText, countDigits }. Primary separators are tab,
// comma, or two-plus spaces; a single-space "New York 500" falls back to a
// trailing-number split. Thousands separators (commas, spaces) are stripped —
// a comma-separated "California,1,500" reassembles to 1500 via the join.
const parseBulkLine = (line) => {
  let fields = line.split(/\t|,|\s{2,}/).map((f) => f.trim()).filter(Boolean);
  if (fields.length === 1) {
    const m = line.match(/^(.*?)\s+(\d[\d,.\s]*)$/);
    if (m) fields = [m[1].trim(), m[2].trim()];
  }
  return {
    jurText: fields[0] || "",
    countDigits: fields.slice(1).join("").replace(/[\s,]/g, ""),
  };
};

// Split a jurisdiction list into the two display groups, each alphabetical by
// display name. US renders before International everywhere.
const groupJurisdictions = (list) => ({
  us: list.filter((j) => !INTL_JURISDICTION_IDS.has(j.id)).sort((a, b) => a.name.localeCompare(b.name)),
  intl: list.filter((j) => INTL_JURISDICTION_IDS.has(j.id)).sort((a, b) => a.name.localeCompare(b.name)),
});

// Wrap the first case-insensitive occurrence of `query` in a quiet Parchment
// highlight. Combobox options only.
const highlightMatch = (text, query) => {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: "#E8DDC4", borderRadius: "2px" }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
};

// Q1 personal-data categories — these ARE the engine `sensitivity` input, and
// render from the canonical SENSITIVITY_OPTIONS export in data.js (imported
// above; the former local copy predated the 2026-07-25 ssn split and is
// deleted). `ssn` sits directly above the relabeled gov_id and flows into
// facts.sensitivity like any other category.

// EU/UK risk-assessment levels — the operative `riskLevel` input. The value
// strings match what engine.js gates on (riskRequired → "risk"|"high";
// highRiskRequired → "high"; "" = unset → pending). Shared by the on-screen
// control (renderRiskAssessment) and the review recap.
const RISK_OPTIONS = [
  { value: "unlikely", label: RISK_LEVEL_LABELS.unlikely, desc: "No notification required. Document the assessment under Art. 33(5)." },
  { value: "risk", label: RISK_LEVEL_LABELS.risk, desc: "Notify the supervisory authority within 72 hours. No individual notification." },
  { value: "high", label: RISK_LEVEL_LABELS.high, desc: "Notify the authority within 72 hours and affected data subjects without undue delay." },
];

// Harm-assessment answers — the operative `harmAssessment` input (harm-gate
// UI commit, 2026-08-02). Value strings match what engine.js suppresses on
// ("determined_unlikely" is the only suppressing value; "" and "harm_likely"
// compute everything and differ only in memo recording). Labels come from the
// shared display map so the recap rows and the memo cannot drift. Single-
// select rows like the risk question; "Not assessed" ("") is the default. No
// prefill or shared state in either direction with the risk question.
const HARM_OPTIONS = [
  { value: "", label: HARM_ASSESSMENT_LABELS[""], desc: "All obligations compute. The memo records that no determination was made." },
  { value: "determined_unlikely", label: HARM_ASSESSMENT_LABELS.determined_unlikely, desc: "Suppresses only the obligations whose statute provides for it, each under its own standard." },
  { value: "harm_likely", label: HARM_ASSESSMENT_LABELS.harm_likely, desc: "All obligations compute. The memo records the assessment outcome." },
];

// Short per-obligation tags for the "Applicable standards" card, used only
// when a jurisdiction carries more than one distinct standard (Colorado:
// residents vs AG). Keyed by obligation kind.
const HARM_KIND_TAGS = { individual: "Residents", ag: "AG", cra: "CRA", agency: "Agency", authority: "Authority", service: "Service" };

// Unique harm standards for one jurisdiction, in obligation order — sourced
// from harmGate data, never hardcoded. Deduped by standard string, so
// same-standard obligations (DE residents/AG/service; CT's cascade) collapse
// to one entry carrying the first obligation's citation and tag.
const harmStandardsFor = (jur) => {
  const entries = [];
  (jur.obligations || []).forEach((o) => {
    if (!o.harmGate) return;
    if (entries.some((e) => e.standard === o.harmGate.standard)) return;
    entries.push({ standard: o.harmGate.standard, citation: o.harmGate.citation, tag: HARM_KIND_TAGS[o.kind] || o.kind });
  });
  return entries;
};

// Encryption-cluster option sets (S3b). The values match what engine.js gates on:
// encrypted/redacted/keyAcquired/reidentificationAcquired are "yes"|"no"; strength
// is "ge_128"|"below_128"|"unknown". Each is tri-state ("" = unset → fires).
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const ENCRYPTION_STRENGTH_OPTIONS = [
  { value: "ge_128", label: "Yes — 128-bit or higher" },
  { value: "below_128", label: "No — below 128-bit" },
  { value: "unknown", label: "Unknown" },
];

// Natural-language list join ("A", "A and B", "A, B, and C") for note copy.
const joinList = (arr) =>
  arr.length <= 1
    ? arr[0] || ""
    : arr.length === 2
    ? `${arr[0]} and ${arr[1]}`
    : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;

const SOURCE_OPTIONS = ["Internal", "External"];

// ── Notification record + incident log (results view; persisted as the
//    top-level `notifications` / `incident_log` jsonb columns, siblings of
//    payload — NEVER nested in the payload and never seen by the engine). ──

// Incident-log entry types. Communications carry a party (who the
// communication was with); updates do not. Entries store the stable id;
// labels render on screen and in the memo.
const LOG_TYPES = [
  { id: "initial_notification", label: "Initial notification", kind: "communication" },
  { id: "supplemental_notification", label: "Supplemental notification", kind: "communication" },
  { id: "inquiry_received", label: "Inquiry received", kind: "communication" },
  { id: "response_sent", label: "Response sent", kind: "communication" },
  { id: "development", label: "Development", kind: "update" },
  { id: "remediation_update", label: "Remediation update", kind: "update" },
  { id: "note", label: "Note", kind: "update" },
];
const LOG_TYPE_BY_ID = Object.fromEntries(LOG_TYPES.map((t) => [t.id, t]));
// Sentinel for the "Other (enter name)" party option — swaps the select for a
// free-text input. Never stored on an entry (the resolved name is).
const OTHER_PARTY = "__other__";

// Engine deadline objects carry `jurisdiction: jur.short` (the id is internal
// to the engine and stripped before return), so map short → id to build the
// stable "{jurId}:{authority}" notification-record keys.
const JUR_SHORT_TO_ID = Object.fromEntries(JURISDICTIONS.map((j) => [j.short, j.id]));
const notifKey = (d) => `${JUR_SHORT_TO_ID[d.jurisdiction] || d.jurisdiction}:${d.authority}`;

// Stable DOM anchor for an obligation card on the results view — the deadline
// queue's row-click jump target. (jurId, authority) is unique across the
// engine's outcome buckets: one obligation lands in exactly one bucket.
const obligationAnchorId = (jurId, authority) =>
  `oblig-${jurId}-${String(authority).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

// Parse a "YYYY-MM-DD" date-only string as LOCAL midnight (new Date(str)
// would parse it as UTC and shift the calendar day in western timezones).
const parseDateOnly = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const fmtDateOnly = (s) => {
  const d = parseDateOnly(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : String(s || "");
};

const DATA_PRINCIPLES = [
  { id: "confidentiality", label: "Confidentiality", desc: "Unauthorized or accidental access or disclosure of the personal data." },
  { id: "integrity", label: "Integrity", desc: "Unauthorized or accidental alteration of the personal data." },
  { id: "availability", label: "Availability", desc: "Unauthorized or accidental loss of access to or destruction of the personal data." },
];

const INCIDENT_TYPES = [
  { id: "unauthorized_access", label: "Unauthorized access" },
  { id: "phishing", label: "Phishing" },
  { id: "email_wrong_recipient", label: "Email to wrong recipient" },
  { id: "malicious_code", label: "Malicious code" },
  { id: "lost_stolen_device", label: "Lost/stolen device" },
  { id: "insider_threat", label: "Insider threat" },
  { id: "unauthorized_acquisition", label: "Unauthorized acquisition" },
  { id: "denial_of_service", label: "Denial of service" },
  { id: "other", label: "Other (specify)" },
];

const THIRD_PARTY_TYPES = ["Vendor", "Customer", "Individual", "Other"];

// Shared data-element checklist used by every data-subject category block.
// `tag` rolls an element up to a Q1 sensitivity category for the cross-check;
// untagged elements never trigger it. Children's data has no element here and
// stays a Q1-only selection by design.
const DATA_ELEMENTS = [
  { id: "name", label: "First and/or last name" },
  { id: "email", label: "Email address" },
  { id: "username", label: "Username" },
  { id: "password", label: "Password", tag: "credentials" },
  { id: "physical_address", label: "Physical address" },
  { id: "ip", label: "IP address" },
  { id: "dob", label: "Date of birth" },
  { id: "national_id", label: "National identification number", tag: "gov_id" },
  { id: "gov_id", label: "Government ID", tag: "gov_id" },
  { id: "payment_card", label: "Payment card information", tag: "financial" },
  { id: "photo", label: "Photo(s)" },
  { id: "fingerprint", label: "Fingerprint", tag: "biometric" },
  { id: "health", label: "Health or medical information", tag: "health" },
  { id: "special", label: "Other sensitive / special-category data", desc: "e.g., racial or ethnic origin, political opinions, religious or philosophical beliefs, trade-union membership, sex life or sexual orientation", tag: "special" },
];

// Q1 category label for each cross-check tag — used in the warning text.
const TAG_TO_Q1_LABEL = {
  gov_id: "Government IDs",
  financial: "Financial",
  health: "Health or medical information",
  special: "Other sensitive / special-category data",
  credentials: "Authentication credentials",
  biometric: "Biometric or genetic data",
};

// Monotonic id source for data-subject blocks (module scope — the component is
// a singleton; this avoids Date.now/random in render and keeps keys stable).
let _blockSeq = 0;
const makeBlock = () => ({ id: `blk-${++_blockSeq}`, name: "", count: "", elements: [], others: [] });

const EMPTY_RECORD = {
  // 1. General information
  incidentTitle: "",
  sourceOfIncident: "",
  incidentLocation: "",
  departmentReporting: "",
  systemsImpacted: "",
  backups: "",
  dataPrinciples: [],
  incidentTypes: [],
  incidentTypeOther: "",
  // 2. How & when discovered (awareness lives in operative state)
  howDiscovered: "",
  learnedFromThirdParty: "",
  thirdPartyType: "",
  thirdPartyCustomerName: "",
  thirdPartyVendorName: "",
  thirdPartyIndividualName: "",
  thirdPartyOther: "",
  // 3. When the incident occurred
  occurrenceNotAvailable: false,
  occurrenceDate: "",
  occurrenceTime: "",
  occurrenceDetail: "",
  // 4. Incident summary
  incidentSummary: "",
  // 5. Data affected — dynamic data-subject blocks (record only)
  dataSubjectBlocks: [],
  // 6. Measures
  measuresTaken: "",
  measuresTakenNotAvailable: false,
  measuresProposed: "",
  measuresProposedNotAvailable: false,
};

const slugify = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const fmtCount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n.toLocaleString() : String(v).trim();
};

// ── Tooltip ──────────────────────────────────────────────────────────────
// Module-scope component (so it keeps its own open state and doesn't remount).
// Shows on hover AND on focus/tap, so it works with a keyboard and on touch
// devices that have no hover. Replaces the old `title`-attribute trigger, whose
// content never appeared.
function InfoTip({ text, size = 13 }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          background: "none", border: "none", padding: 0, margin: 0, cursor: "help",
          display: "inline-flex", alignItems: "center", color: "#1B2A3F", opacity: 0.5,
        }}
      >
        <Info size={size} />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute", zIndex: 60, top: "calc(100% + 8px)", left: 0,
            width: "270px", maxWidth: "70vw", background: "#1B2A3F", color: "#FAF8F2",
            padding: "11px 13px", borderRadius: "8px", fontSize: "12px", lineHeight: 1.5,
            fontFamily: "'Inter', sans-serif", letterSpacing: 0, textTransform: "none",
            fontWeight: 400, boxShadow: "0 6px 18px rgba(27,42,63,0.22)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ── Countdown element ─────────────────────────────────────────────────────
// One card counter (JDC ruling 2026-08-23, magnitude-tiered precision). The
// string comes from formatCountdown at the tier its magnitude earns and is
// recomputed on the page's ONE shared 60-second `now`. Only while the
// element is in the under-1-hour tier does it attach its own 1-second
// interval — and only this element does: the shared clock never ticks per
// second. On the tick that crosses zero it asks the page to refresh its
// shared `now` (onCrossZero) so the card's urgent/overdue treatment, which
// reads the shared clock, flips with the counter rather than up to a minute
// later. Nothing animates; the text simply changes.
function Countdown({ deadline, now, onCrossZero, className, style }) {
  const sharedRemaining = deadline.getTime() - now.getTime();
  const live = countdownIsLive(sharedRemaining);
  const [liveNow, setLiveNow] = useState(null);
  const crossRef = useRef(sharedRemaining < 0);
  useEffect(() => {
    if (!live) {
      setLiveNow(null);
      return undefined;
    }
    setLiveNow(new Date());
    const t = setInterval(() => setLiveNow(new Date()), COUNTDOWN_LIVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [live]);
  const remaining = live && liveNow ? deadline.getTime() - liveNow.getTime() : sharedRemaining;
  useEffect(() => {
    const overdue = remaining < 0;
    if (overdue !== crossRef.current) {
      crossRef.current = overdue;
      if (onCrossZero) onCrossZero();
    }
  }, [remaining, onCrossZero]);
  return (
    <div className={className} style={style}>
      {formatCountdown(remaining)}
    </div>
  );
}

// Stable signature over the payload fields the engine actually sees (the
// factsFromPayload inputs — quickMode and the record never affect the
// analysis). Drives the staleness banner: the signature at the last explicit
// compute is compared against the live one, so a Back-to-results that reverts
// to the exact facts last computed shows no banner, while a Save of edited
// facts followed by Back does. Key order is stable — jurisdiction/count maps
// are always built by spreading over the full JURISDICTIONS key set.
const factsSignatureOf = (p) =>
  JSON.stringify([
    p.awareness,
    p.awarenessTz,
    p.jurisdictions,
    p.residentCounts,
    p.residentCountUnknown,
    p.sensitivity,
    p.encrypted,
    p.encryptionStrength,
    p.redacted,
    p.keyAcquired,
    p.reidentificationAcquired,
    p.gdprUnintelligibility,
    p.riskLevel,
    p.harmAssessment,
  ]);

export default function BreachClock() {
  usePageTitle("Respond");
  const [showTests, setShowTests] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Caveat-note disclosure state (results page). Collapsed by default; reset
  // on every submit so a fresh results render always starts collapsed. Keyed
  // by note id. Caveat placement only — sectoral notes are never collapsible.
  const [expandedCaveats, setExpandedCaveats] = useState(() => new Set());
  const toggleCaveat = (id) =>
    setExpandedCaveats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // ── Results-at-scale view state (results page; presentation only) ──
  // Block order across jurisdiction blocks: "urgency" (default — the shared
  // compareBlocksByUrgency order both surfaces lead with, JDC amendment
  // 2026-08-21) | "alpha" (the screen's secondary view). PERSISTED PER
  // INCIDENT (2026-08-22; the results-at-scale rider, now closed): the choice
  // lives in the incidents.view_state jsonb column (migration
  // 20260822120000_add_view_state) as { blockOrder: "az" | "urgency" } —
  // BESIDE the facts payload, never inside it. payload stays byte-identical
  // to the facts, and notifications / incident_log keep their legally
  // meaningful shapes; view_state is the one column that carries presentation
  // state. An empty view_state ('{}', the column default) means the Urgency
  // default — so a fresh incident never needs a write, and the toggle writes
  // on change only (persistBlockOrder), never on load. Neither value ever
  // enters buildPayload.
  const [blockOrder, setBlockOrder] = useState("urgency");
  // Per-block expand/collapse OVERRIDES ({ [jurId]: bool }) on top of the
  // computed default (see blockExpanded below: the single most urgent block
  // expanded above 3 jurisdictions). PERSISTED PER INCIDENT as
  // view_state.expanded beside blockOrder (JDC ruling 2026-08-23): applied
  // at load, written through on every change, cleared by Submit & compute
  // (never by the silent rehydrate auto-compute or Back-to-results).
  const [expandedBlocks, setExpandedBlocks] = useState({});
  const [isNarrow, setIsNarrow] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [activeSection, setActiveSection] = useState(FORM_SECTIONS[0].id);
  // Per-section collapse state. On load only General is expanded; every other
  // section (including the conditional Risk section) is collapsed. Lives in
  // component state, so it survives the form → review → "Edit answers" round
  // trip — returning to edit does not reset it.
  const [openSections, setOpenSections] = useState({ [FORM_SECTIONS[0].id]: true });
  // A section id to scroll to once the next render has committed (so the target
  // is scrolled in its final, post-expand position). Driven through state + an
  // effect rather than requestAnimationFrame, which the browser throttles when
  // the tab isn't visible.
  const [pendingScroll, setPendingScroll] = useState(null);

  // ── Operative state (feeds the engine) — unchanged from the wizard ──
  const [awareness, setAwareness] = useState("");
  // Declared awareness zone (serverless bundle, JDC 2026-08-22) — an IANA id
  // stored beside the datetime-local string. The user specifies it; awareness
  // is never interpreted from the reading device. The device zone is only the
  // visible, editable SUGGESTION the selector starts on (new form, or a
  // legacy record that predates the field).
  const [awarenessTz, setAwarenessTz] = useState(() => deviceTimeZone());
  const [jurisdictions, setJurisdictions] = useState(
    () => Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false]))
  );
  const [residentCounts, setResidentCounts] = useState(
    () => Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""]))
  );
  // "Count not yet known" per jurisdiction (intake phase 2) — a sparse
  // { [jurId]: true } map, absent key meaning nothing claimed. Mutually
  // exclusive with a numeric count in BOTH directions: toggling on clears the
  // count input, typing a count clears the toggle. The engine holds each
  // threshold-gated obligation of a flagged jurisdiction as CONTINGENT.
  const [residentCountUnknown, setResidentCountUnknown] = useState({});
  const [sensitivity, setSensitivity] = useState([]);
  // US encryption cluster (S3b) — five tri-state inputs, each defaulting to unset
  // (""). They feed the US per-obligation safeHarbor gates in the engine.
  const [encrypted, setEncrypted] = useState("");
  const [encryptionStrength, setEncryptionStrength] = useState("");
  const [redacted, setRedacted] = useState("");
  const [keyAcquired, setKeyAcquired] = useState("");
  const [reidentificationAcquired, setReidentificationAcquired] = useState("");
  // GDPR Art. 34(3)(a) unintelligibility (S5) — the dedicated EU/UK input that
  // replaced the derived encryptionApplied boolean. Tri-state, default unset.
  const [gdprUnintelligibility, setGdprUnintelligibility] = useState("");

  // ── Jurisdiction-picker UI state (presentation only — the operative values
  //    stay in the jurisdictions/residentCounts maps above) ──
  const [jurQuery, setJurQuery] = useState("");
  const [jurListOpen, setJurListOpen] = useState(false);
  const [jurHighlight, setJurHighlight] = useState(0);
  // Jurisdiction id whose freshly mounted resident-count input should take
  // focus after a combobox commit (the row doesn't exist until the next
  // render, so focus routes through state + the effect below).
  const [focusCountFor, setFocusCountFor] = useState(null);
  const countInputRefs = useRef({});
  // Bulk "Paste counts" panel: open flag, textarea draft, and the last Apply's
  // report ({ added, updated, unmatched, notModeled }; null = no apply yet).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteReport, setPasteReport] = useState(null);
  // Rows whose count a bulk Apply just updated — carries the brief "UPDATED"
  // tag, cleared by the timeout effect below.
  const [bulkFlash, setBulkFlash] = useState(() => new Set());

  useEffect(() => {
    if (!focusCountFor) return;
    const el = countInputRefs.current[focusCountFor];
    if (el) el.focus();
    setFocusCountFor(null);
  }, [focusCountFor]);

  useEffect(() => {
    if (!bulkFlash.size) return undefined;
    const t = setTimeout(() => setBulkFlash(new Set()), 2500);
    return () => clearTimeout(t);
  }, [bulkFlash]);

  // ── Record state (incident report only; never seen by the engine) ──
  const [record, setRecord] = useState(() => ({ ...EMPTY_RECORD, dataSubjectBlocks: [makeBlock()] }));

  const [riskLevel, setRiskLevel] = useState("");
  // Harm-assessment attestation ("" | "determined_unlikely" | "harm_likely").
  // Independent of riskLevel — the two never prefill each other.
  const [harmAssessment, setHarmAssessment] = useState("");
  const [now, setNow] = useState(new Date());
  const [downloadError, setDownloadError] = useState("");

  // ── Persistence (save/load against the incidents table) ──
  // /breach-clock (no :id) is the blank new-incident form; /breach-clock/:id
  // loads a saved incident. Both are ONE route (optional param), so the first
  // save's navigate() only changes params — no remount, no state loss.
  const { id: routeIncidentId } = useParams();
  const navigate = useNavigate();
  const { activeOrg } = useOrg();
  // "loading" | "ready" | "notfound" | "loaderror". Only :id starts in loading.
  const [loadState, setLoadState] = useState(routeIncidentId ? "loading" : "ready");
  // Saved incidents open at results: set in the SAME state batch as a genuine
  // rehydrate (applyPayload), so the effect that consumes it runs against the
  // fully hydrated state — rehydrate completion, not a timer. Never set for
  // the blank form or the just-created-save early-return.
  const [autoComputePending, setAutoComputePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState("");
  // Incident status lifecycle: "draft" | "active" | "closed" (DB CHECK
  // constraint incidents_status_check). A DB column, NOT part of the payload —
  // applyPayload never touches it. Draft until the user explicitly submits
  // (→ active, via handleSubmit only — carried in Submit's single persistence
  // write, atomically with the payload; the silent auto-compute on rehydrate
  // shares the compute path but must never transition status); any value can
  // also be set manually via the top-bar dropdown. Manual changes on saved
  // incidents persist immediately (changeStatus); the unsaved form holds
  // status in memory and the first save writes it (createIncident, from Save
  // or Submit).
  const [status, setStatus] = useState("draft");
  // Notification record + incident log — DB columns siblings of payload, NOT
  // part of the payload (applyPayload never touches them) and never part of
  // the facts the engine sees. Both persist immediately on change, the same
  // pattern as status: saved incidents write through their dedicated update
  // functions; the unsaved form holds them in memory and the first save
  // writes them via createIncident.
  const [notifications, setNotifications] = useState({});
  const [incidentLog, setIncidentLog] = useState([]);
  // Inline notified-on editor on the deadline cards: the open card's
  // "{jurId}:{authority}" key (null = none open) + the draft date value.
  const [notifEditing, setNotifEditing] = useState(null);
  const [notifDraft, setNotifDraft] = useState("");
  // Add-entry draft for the incident log's bottom form.
  const EMPTY_LOG_DRAFT = { date: "", type: "", party: "", partyOther: "", note: "" };
  const [logDraft, setLogDraft] = useState(EMPTY_LOG_DRAFT);
  // The id created by this session's first save. The load effect skips the
  // refetch for it — the form state IS the just-saved payload already.
  const justCreatedRef = useRef(null);
  // The payload as last confirmed persisted (load hydrate, Save, or Submit's
  // save). Back-to-results reverts to it, discarding unsaved in-memory edits.
  const lastSavedPayloadRef = useRef(null);
  // Facts signature at the last compute that produced the results view
  // (explicit submit or the silent rehydrate auto-compute). Null until then —
  // it doubles as "a computed results state exists", gating Back-to-results.
  // Compared against the live signature for the staleness banner; a
  // successful submit refreshes it, so the banner never renders post-submit.
  const [computedSignature, setComputedSignature] = useState(null);

  // Hydrate every form state from a saved payload. Defensive on shape: each
  // field falls back to its blank default, jurisdiction/count maps are rebuilt
  // over the full JURISDICTIONS key set (so a later-added jurisdiction is never
  // missing from an older payload), and data-subject blocks get fresh local
  // ids (the saved ids came from a previous session's counter and could
  // collide with ones this session mints). applyPayload({}) doubles as the
  // full form reset.
  const applyPayload = (p) => {
    setQuickMode(!!p.quickMode);
    setAwareness(typeof p.awareness === "string" ? p.awareness : "");
    // A usable saved zone is applied verbatim; absent/unrecognized (legacy)
    // → the device zone as the suggestion. The legacy caveat keys off the
    // SAVED payload (lastSavedPayloadRef), never this suggestion.
    setAwarenessTz(isValidTimeZone(p.awarenessTz) ? p.awarenessTz : deviceTimeZone());
    setJurisdictions({
      ...Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false])),
      ...(p.jurisdictions && typeof p.jurisdictions === "object" ? p.jurisdictions : {}),
    });
    setResidentCounts({
      ...Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""])),
      ...(p.residentCounts && typeof p.residentCounts === "object" ? p.residentCounts : {}),
    });
    // Sparse map; an older payload has no key at all (no migration). Only
    // truthy entries are kept, so a serialized `false` never renders as
    // "not yet known".
    setResidentCountUnknown(
      p.residentCountUnknown && typeof p.residentCountUnknown === "object"
        ? Object.fromEntries(Object.entries(p.residentCountUnknown).filter(([, v]) => !!v).map(([k]) => [k, true]))
        : {}
    );
    setSensitivity(Array.isArray(p.sensitivity) ? p.sensitivity : []);
    setEncrypted(p.encrypted || "");
    setEncryptionStrength(p.encryptionStrength || "");
    setRedacted(p.redacted || "");
    setKeyAcquired(p.keyAcquired || "");
    setReidentificationAcquired(p.reidentificationAcquired || "");
    setGdprUnintelligibility(p.gdprUnintelligibility || "");
    // riskLevel passes through as-is — the engine fails safe on anything
    // outside VALID_RISK_LEVELS (routes to pending, never suppression).
    setRiskLevel(typeof p.riskLevel === "string" ? p.riskLevel : "");
    // harmAssessment likewise — the engine treats anything other than the
    // exact "determined_unlikely" sentinel as inert (computes everything).
    setHarmAssessment(typeof p.harmAssessment === "string" ? p.harmAssessment : "");
    const savedBlocks = Array.isArray(p.record?.dataSubjectBlocks) ? p.record.dataSubjectBlocks : [];
    setRecord({
      ...EMPTY_RECORD,
      ...(p.record && typeof p.record === "object" ? p.record : {}),
      dataSubjectBlocks: savedBlocks.length
        ? savedBlocks.map((b) => {
            const fresh = makeBlock();
            return { ...fresh, ...b, id: fresh.id };
          })
        : [makeBlock()],
    });
    setSubmitted(false);
    setAttemptedSubmit(false);
  };

  // Load the routed incident (or reset to blank when the param goes away, e.g.
  // navigating from a saved incident to "New incident").
  useEffect(() => {
    setSaveError("");
    if (!routeIncidentId) {
      justCreatedRef.current = null;
      lastSavedPayloadRef.current = null;
      setComputedSignature(null);
      setSavedAt(null);
      setStatus("draft");
      setNotifications({});
      setIncidentLog([]);
      setNotifEditing(null);
      setNotifDraft("");
      setLogDraft(EMPTY_LOG_DRAFT);
      setBlockOrder("urgency");
      setExpandedBlocks({});
      applyPayload({});
      setLoadState("ready");
      return undefined;
    }
    // Just created by this session's save: state is already live — no refetch.
    if (justCreatedRef.current === routeIncidentId) return undefined;
    let cancelled = false;
    setLoadState("loading");
    (async () => {
      try {
        const incident = await getIncident(routeIncidentId);
        if (cancelled) return;
        if (!incident) {
          setLoadState("notfound");
          return;
        }
        applyPayload(incident.payload || {});
        lastSavedPayloadRef.current = incident.payload || {};
        // Reset before the auto-compute decides: an incomplete draft must not
        // inherit a previous incident's computed state (which would offer a
        // Back-to-results into the wrong incident's results).
        setComputedSignature(null);
        setStatus(incident.status || "draft");
        setNotifications(incident.notifications && typeof incident.notifications === "object" ? incident.notifications : {});
        setIncidentLog(Array.isArray(incident.incident_log) ? incident.incident_log : []);
        setNotifEditing(null);
        setNotifDraft("");
        setLogDraft(EMPTY_LOG_DRAFT);
        // view_state.blockOrder applies when present; an empty or unrecognized
        // value falls to the Urgency default. Read only — never written here.
        setBlockOrder(blockOrderFromViewState(incident.view_state));
        // Persisted expansion overrides win over the collapse default
        // (2026-08-23); absent → the fresh default.
        setExpandedBlocks(expandedFromViewState(incident.view_state));
        setSavedAt(null);
        setAutoComputePending(true);
        setLoadState("ready");
      } catch (err) {
        console.error("Incident load failed:", err);
        if (!cancelled) setLoadState("loaderror");
      }
    })();
    return () => {
      cancelled = true;
    };
    // applyPayload is re-created per render but only reads setters + constants;
    // the load is deliberately keyed on the route param alone.
  }, [routeIncidentId]);

  // The full form state — everything applyPayload can hydrate. Inputs only;
  // deadlines and other derived values are recomputed on load, never stored.
  const buildPayload = () => ({
    quickMode,
    awareness,
    awarenessTz,
    jurisdictions,
    residentCounts,
    residentCountUnknown,
    sensitivity,
    encrypted,
    encryptionStrength,
    redacted,
    keyAcquired,
    reidentificationAcquired,
    gdprUnintelligibility,
    riskLevel,
    harmAssessment,
    record,
  });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const title = record.incidentTitle.trim() || "Untitled Incident";
      const payload = buildPayload();
      if (routeIncidentId) {
        await updateIncident(routeIncidentId, { title, payload });
      } else {
        // First save writes the in-memory status too — an incident submitted
        // before ever being saved is created active, not draft — along with
        // any notification records / log entries made before the first save.
        const row = await createIncident(activeOrg?.id, title, payload, status, notifications, incidentLog);
        justCreatedRef.current = row.id;
        // replace: back from the saved URL should not land on the blank form
        // and create a duplicate on the next save.
        navigate(`/breach-clock/${row.id}`, { replace: true });
      }
      lastSavedPayloadRef.current = payload;
      setSavedAt(new Date());
    } catch (err) {
      console.error("Incident save failed:", err);
      // The form state is untouched on failure — the user can retry.
      setSaveError(err?.message ? `Save failed: ${err.message}` : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Change the incident's status from the top-bar dropdown. (The explicit
  // submit transition no longer routes through here — it rides Submit's
  // single persistence write so payload and status land atomically; the
  // silent auto-compute never transitions at all.) The control updates
  // optimistically so the select never snaps back mid-write; a saved incident
  // persists the change immediately (status is not staged behind Save), and on
  // a failed write the control reverts and the error surfaces through the
  // module's normal save-error slot. On the unsaved form there is no row yet:
  // the value is held in memory and written by the first save (handleSave).
  const changeStatus = async (next) => {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    if (!routeIncidentId) return;
    try {
      await updateIncidentStatus(routeIncidentId, next);
      setSaveError("");
    } catch (err) {
      console.error("Incident status update failed:", err);
      setStatus(prev);
      setSaveError(err?.message ? `Status change failed: ${err.message}` : "Status change failed. Try again.");
    }
  };

  // Persist the notification record / incident log — same immediate-write
  // pattern as changeStatus: optimistic state update, reverted on a failed
  // write, surfaced through the module's normal save-error slot. On the
  // unsaved form there is no row yet; the value is held in memory and written
  // by the first save (handleSave).
  const persistNotifications = async (next) => {
    const prev = notifications;
    setNotifications(next);
    if (!routeIncidentId) return;
    try {
      await updateIncidentNotifications(routeIncidentId, next);
      setSaveError("");
    } catch (err) {
      console.error("Notification record update failed:", err);
      setNotifications(prev);
      setSaveError(err?.message ? `Notification record failed: ${err.message}` : "Notification record failed. Try again.");
    }
  };
  const persistIncidentLog = async (next) => {
    const prev = incidentLog;
    setIncidentLog(next);
    if (!routeIncidentId) return;
    try {
      await updateIncidentLog(routeIncidentId, next);
      setSaveError("");
    } catch (err) {
      console.error("Incident log update failed:", err);
      setIncidentLog(prev);
      setSaveError(err?.message ? `Incident log update failed: ${err.message}` : "Incident log update failed. Try again.");
    }
  };
  // Block-order toggle write-through: the same optimistic / rollback /
  // saveError pattern as the incident log, writing view_state ALONE
  // ({ blockOrder: "az" | "urgency" } — the persisted vocabulary; the
  // in-memory value stays "alpha" | "urgency" for orderBlocks). Called on
  // change only. Results render only for persisted incidents (compute
  // persists first), so the no-row branch is a guard, not a live path.
  const persistBlockOrder = async (next) => {
    const prev = blockOrder;
    if (next === prev) return;
    setBlockOrder(next);
    if (!routeIncidentId) return;
    try {
      await updateIncidentViewState(routeIncidentId, viewStateOf(next, expandedBlocks));
      setSaveError("");
    } catch (err) {
      console.error("View state update failed:", err);
      setBlockOrder(prev);
      setSaveError(err?.message ? `Jurisdiction order failed to save: ${err.message}` : "Jurisdiction order failed to save. Try again.");
    }
  };

  // Latest-handler ref so the memoized top-bar control below never closes over
  // a stale changeStatus (it re-renders only when status changes).
  const changeStatusRef = useRef(changeStatus);
  useEffect(() => {
    changeStatusRef.current = changeStatus;
  });

  // AppShell top-bar header slot. The eyebrow is the status control: a quiet
  // native select (full keyboard/aria semantics for free) wearing the
  // small-caps eyebrow treatment when collapsed — chromeless, so it reads as
  // the eyebrow text plus the browser's own dropdown affordance. Memoized
  // because the eyebrow node is an effect dependency inside useTopBarHeader:
  // a fresh element every render would re-push the header slot on every tick
  // of the results clock; keyed on status alone, it re-renders only when the
  // status actually changes. The title tracks the incident reference/title
  // field live as the user types, falling back while it's empty.
  const statusControl = useMemo(
    () => (
      <select
        value={status}
        onChange={(e) => changeStatusRef.current(e.target.value)}
        aria-label="Incident status"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#1B2A3F",
          opacity: 0.7,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
        }}
      >
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="closed">Closed</option>
      </select>
    ),
    [status]
  );
  useTopBarHeader({
    eyebrow: statusControl,
    title: record.incidentTitle.trim() || "Untitled Incident",
  });

  // The page's ONE shared clock (JDC ruling 2026-08-23): every countdown
  // string — card counters and queue status cells — recomputes on this
  // 60-second interval. A per-second interval exists only inside a Countdown
  // element whose magnitude is under one hour (see Countdown above).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), COUNTDOWN_SHARED_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  // Countdown elements call this on the tick that crosses zero so the
  // shared-clock treatments (urgent / overdue) flip with the counter.
  const refreshNow = useCallback(() => setNow(new Date()), []);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const on = () => setIsNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setIsWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Perform a pending section scroll after the commit that expanded it, so the
  // target is in its final laid-out position (a synchronous scroll in the click
  // handler would aim at the pre-expand position and overshoot on a tall page).
  useEffect(() => {
    if (!pendingScroll) return;
    const el = document.getElementById(pendingScroll);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScroll(null);
  }, [pendingScroll]);

  // Highlight the section currently in view. A single read-only
  // IntersectionObserver watches the six form-section anchors and sets the
  // active id; the narrow band near the top of the viewport (via rootMargin)
  // means "active" tracks the section whose heading area is at the top. This is
  // not layout positioning — it never moves anything (cf. the removed
  // useLayoutEffect/ResizeObserver rail anchoring).
  // The fixed six sections plus the conditional Risk Assessment section, which
  // appears only when an EU/UK jurisdiction is selected. Derived so the index
  // and the IntersectionObserver stay in sync as that section comes and goes.
  // The positional FORM_SECTIONS[n].id references on the six fixed <section>s
  // are left untouched.
  // Selected jurisdictions carrying any harm-gated obligation — drives the
  // conditional Harm Assessment question, the standards card, and the recap
  // row. Sourced from data.js harmGate declarations via the shared helper.
  const harmGatedSelected = harmGatedJurisdictions(jurisdictions);
  const anyHarmGated = harmGatedSelected.length > 0;

  const indexSections = [
    ...FORM_SECTIONS,
    ...((jurisdictions.eu || jurisdictions.uk) ? [{ id: "form-risk", label: "Risk" }] : []),
    ...(anyHarmGated ? [{ id: "form-harm", label: "Harm" }] : []),
  ];

  const showSectionIndex = isWide && !isNarrow && !submitted && !quickMode;
  useEffect(() => {
    if (!showSectionIndex) return;
    const els = indexSections.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: "-12% 0px -78% 0px", threshold: 0 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [showSectionIndex, jurisdictions.eu, jurisdictions.uk, anyHarmGated]);

  // ── Record updaters ──
  const updateRecord = (key, value) => setRecord((r) => ({ ...r, [key]: value }));
  const toggleRecordArray = (key, id) =>
    setRecord((r) => {
      const arr = r[key] || [];
      return { ...r, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });

  // ── Data-subject block updaters ──
  const mapBlocks = (fn) => setRecord((r) => ({ ...r, dataSubjectBlocks: r.dataSubjectBlocks.map(fn) }));
  const addBlock = () => setRecord((r) => ({ ...r, dataSubjectBlocks: [...r.dataSubjectBlocks, makeBlock()] }));
  const removeBlock = (id) => setRecord((r) => ({ ...r, dataSubjectBlocks: r.dataSubjectBlocks.filter((b) => b.id !== id) }));
  const updateBlock = (id, patch) => mapBlocks((b) => (b.id === id ? { ...b, ...patch } : b));
  const toggleBlockElement = (id, elId) =>
    mapBlocks((b) =>
      b.id === id
        ? { ...b, elements: b.elements.includes(elId) ? b.elements.filter((x) => x !== elId) : [...b.elements, elId] }
        : b
    );
  const addBlockOther = (id) => mapBlocks((b) => (b.id === id ? { ...b, others: [...b.others, ""] } : b));
  const updateBlockOther = (id, idx, val) =>
    mapBlocks((b) => (b.id === id ? { ...b, others: b.others.map((o, i) => (i === idx ? val : o)) } : b));
  const removeBlockOther = (id, idx) =>
    mapBlocks((b) => (b.id === id ? { ...b, others: b.others.filter((_, i) => i !== idx) } : b));

  // ── Jurisdiction picker handlers ──
  // Add: flip the id on, clear/close the combobox, and route focus to the new
  // row's resident-count input (EU/UK rows have none — focus stays put).
  const addJurisdiction = (jur) => {
    setJurisdictions((prev) => ({ ...prev, [jur.id]: true }));
    setJurQuery("");
    setJurListOpen(false);
    setJurHighlight(0);
    if (jur.residentField) setFocusCountFor(jur.id);
  };
  // Remove clears the jurisdiction, its resident count, AND any "count not yet
  // known" claim — nothing about a removed jurisdiction should survive into
  // the payload.
  const removeJurisdiction = (id) => {
    setJurisdictions((prev) => ({ ...prev, [id]: false }));
    setResidentCounts((prev) => (id in prev ? { ...prev, [id]: "" } : prev));
    clearCountUnknown(id);
  };

  // ── "Count not yet known" handlers (mutual exclusion, both directions) ──
  // Toggling ON clears the count input; typing a count clears the toggle. The
  // engine defends against the combination anyway (a numeric count always
  // beats the flag), but the form never produces it.
  const clearCountUnknown = (id) =>
    setResidentCountUnknown((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const setCountUnknown = (id, on) => {
    if (!on) {
      clearCountUnknown(id);
      return;
    }
    setResidentCountUnknown((prev) => ({ ...prev, [id]: true }));
    setResidentCounts((prev) => (id in prev ? { ...prev, [id]: "" } : prev));
  };
  const setResidentCount = (id, value) => {
    setResidentCounts((prev) => ({ ...prev, [id]: value }));
    if (value !== "") clearCountUnknown(id);
  };
  // Add every modeled US jurisdiction not already selected; counts left blank.
  const addAllUS = () => {
    setJurisdictions((prev) => {
      const next = { ...prev };
      JURISDICTIONS.forEach((j) => {
        if (!INTL_JURISDICTION_IDS.has(j.id)) next[j.id] = true;
      });
      return next;
    });
  };

  // Bulk "Paste counts" Apply. Matched lines add the jurisdiction (if absent)
  // and set its count; already-selected jurisdictions get their count updated
  // (never duplicated) and a brief "UPDATED" tag. Everything else lands in the
  // report — nothing is silently dropped. A first-line header row is tolerated
  // only when its name column matches no known jurisdiction (so a real
  // "California,750" first line is data, not a header).
  const applyBulkPaste = () => {
    const report = { added: [], updated: [], unmatched: [], notModeled: [] };
    const nextJur = { ...jurisdictions };
    const nextCounts = { ...residentCounts };
    const flash = new Set();
    let sawFirstLine = false;
    pasteText.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const isFirstLine = !sawFirstLine;
      sawFirstLine = true;
      const { jurText, countDigits } = parseBulkLine(line);
      const countValid = /^\d+$/.test(countDigits);
      if (
        isFirstLine &&
        !countValid &&
        !findModeledJurisdiction(jurText) &&
        !findChartJurisdiction(jurText)
      ) {
        return; // header row
      }
      const jur = findModeledJurisdiction(jurText);
      if (!jur) {
        const chart = findChartJurisdiction(jurText);
        if (chart) {
          if (!report.notModeled.includes(chart.name)) report.notModeled.push(chart.name);
        } else {
          report.unmatched.push(line);
        }
        return;
      }
      // A count column that is present but non-numeric is a failed intent —
      // surface the line rather than adding the jurisdiction without it.
      if (countDigits.length > 0 && !countValid) {
        report.unmatched.push(line);
        return;
      }
      if (nextJur[jur.id]) {
        if (jur.residentField && countValid) {
          nextCounts[jur.id] = countDigits;
          flash.add(jur.id);
        }
        if (!report.updated.includes(jur.name)) report.updated.push(jur.name);
      } else {
        nextJur[jur.id] = true;
        if (jur.residentField && countValid) nextCounts[jur.id] = countDigits;
        if (!report.added.includes(jur.name)) report.added.push(jur.name);
      }
    });
    setJurisdictions(nextJur);
    setResidentCounts(nextCounts);
    // A pasted count establishes the number — the same mutual exclusion the
    // typed input enforces, applied to every jurisdiction this Apply counted.
    setResidentCountUnknown((prev) => {
      const next = { ...prev };
      Object.keys(nextCounts).forEach((id) => {
        if (nextCounts[id] !== "" && nextCounts[id] !== undefined) delete next[id];
      });
      return next;
    });
    setBulkFlash(flash);
    setPasteReport(report);
    // Clean apply closes the panel; unmatched / not-modeled lines keep it open
    // (textarea intact) so the user can correct them.
    if (report.unmatched.length === 0 && report.notModeled.length === 0) {
      setPasteOpen(false);
      setPasteText("");
    }
  };

  const toggleSensitivity = (id) =>
    sensitivity.includes(id) ? setSensitivity(sensitivity.filter((s) => s !== id)) : setSensitivity([...sensitivity, id]);

  const anyJurisdiction = Object.values(jurisdictions).some(Boolean);
  // Any U.S. state selected (everything except EU/UK). Gates the US encryption
  // cluster's visibility — EU/UK have their own gdprUnintelligibility input.
  const anyUSJurisdiction = Object.entries(jurisdictions).some(([id, on]) => on && id !== "eu" && id !== "uk");
  const highRiskPresent = isHighRisk(sensitivity);

  // Human-readable cluster summary for the review-page Analysis-inputs recap.
  const encryptionRecap = (() => {
    const parts = [];
    if (encrypted === "yes") {
      let s = "Encrypted";
      if (encryptionStrength === "ge_128") s += " (128-bit+)";
      else if (encryptionStrength === "below_128") s += " (below 128-bit)";
      else if (encryptionStrength === "unknown") s += " (strength unknown)";
      if (keyAcquired === "yes") s += ", key/credential acquired";
      else if (keyAcquired === "no") s += ", key not acquired";
      parts.push(s);
    } else if (encrypted === "no") parts.push("Not encrypted");
    if (redacted === "yes") {
      let s = "Redacted";
      if (reidentificationAcquired === "yes") s += ", re-identification info acquired";
      else if (reidentificationAcquired === "no") s += ", re-identification info not acquired";
      parts.push(s);
    } else if (redacted === "no") parts.push("Not redacted");
    return parts.length ? parts.join(" · ") : "Not reported";
  })();

  // Awareness parsing + completeness gate — shared with the incidents list's
  // Next-deadline column via facts.js (one source, no divergent copies).
  const gate = computableGate({ awareness, awarenessTz, jurisdictions, sensitivity }, now);
  const awarenessDate = gate.awarenessDate;
  // Display zone (ruling B): every deadline time on this page renders in the
  // incident's declared zone with a label. For a legacy record the selector's
  // suggestion IS the viewer's zone, so the times read exactly as before.
  const displayTz = isValidTimeZone(awarenessTz) ? awarenessTz : null;
  const fmtDueDateTime = (d) => formatDateTimeInZone(d, displayTz);
  const fmtDueDate = (d) => formatDateInZone(d, displayTz);
  // Legacy record (ruling C): the SAVED payload carries an awareness but no
  // usable zone. Surfaces the caveat in Analysis Inputs (screen + memo) until
  // a save/resubmit writes the zone the selector shows.
  const savedPayload = lastSavedPayloadRef.current;
  const legacyAwarenessZone = !!savedPayload && !!savedPayload.awareness && !isValidTimeZone(savedPayload.awarenessTz);

  // ── Deadlines — same pure engine the test harness calls ──
  // riskLevel feeds the EU/UK risk gating; `pending` carries the GDPR
  // obligations awaiting a risk assessment (neither fired nor suppressed). An
  // unset assessment surfaces as a pending result, so it is deliberately NOT
  // part of canCompute / the submit gate below.
  // `review` (Stage 2 quad-state bucket) carries obligations whose outcome turns
  // on a substantive legal judgment the engine does not make. Empty until Stage 4
  // routes the MA second-trigger here.
  // Facts come from the SAME payload shape the save path writes
  // (factsFromPayload over buildPayload), so the editor, the saved-incident
  // rehydrate, and the incidents list all feed the engine identically.
  // `services` / `advisories` are the engine's additive category-conditioned
  // outputs (commit f02f0ef): computed service obligations (statutory duration,
  // no deadline) and advisory entries (declared + auto "ssn_unconfirmed").
  // `contingent` (intake phase 2) carries threshold-gated obligations held on
  // an unestablished resident count — live but for the count, never firm.
  // Structured refusal (JDC 2026-08-22): on incomplete facts the engine
  // returns { error: "incomplete_facts", missing } instead of buckets. The
  // submit gate keeps that off the results view; this render runs on every
  // keystroke of the form too, so the refusal is absorbed here as empty
  // buckets (nothing renders from them while on the form) and flagged —
  // the results view renders nothing and logs if it ever sees one.
  const engineResult = computeDeadlines(factsFromPayload(buildPayload()));
  const engineRefusal = engineResult && engineResult.error ? engineResult : null;
  const EMPTY = [];
  const { deadlines = EMPTY, suppressed = EMPTY, pending = EMPTY, review = EMPTY, contingent = EMPTY, services = EMPTY, advisories = EMPTY } =
    engineRefusal ? {} : engineResult;

  // ── Results-at-scale derivations (presentation only) ──
  // Jurisdiction-first grouping, computed once per render and shared by the
  // deadline queue and the block renderer. `pending` is deliberately NOT
  // grouped (it stays the consolidated banner above the blocks). The default
  // "urgency" view re-applies the same compareBlocksByUrgency order the
  // grouping (and therefore the memo) already carries — parity by
  // construction; "alpha" is the screen's secondary divergence. The
  // comparators read only deadline timestamps and names, so the block order
  // can change only on the toggle or on a fresh compute, never on a
  // countdown tick.
  const resultGroups = groupResultsByJurisdiction({ deadlines, suppressed, review, contingent, services, advisories, jurisdictions });
  const orderedResultGroups = orderBlocks(resultGroups, blockOrder);
  const deadlineQueue = buildDeadlineQueue(orderedResultGroups);
  // Collapsing operates only past 3 SELECTED jurisdictions — at or below, the
  // blocks render expanded exactly as before (zero change to the small-
  // incident experience).
  const selectedJurisdictionCount = JURISDICTIONS.filter((j) => jurisdictions[j.id]).length;
  const collapsibleBlocks = selectedJurisdictionCount > 3;
  // Auto-expand is capped at the SINGLE most urgent block (JDC ruling
  // 2026-08-23): above the 3-jurisdiction threshold exactly one block loads
  // expanded — the first under compareBlocksByUrgency, which is the first
  // block of the grouping (groupResultsByJurisdiction sorts with that
  // comparator regardless of the screen's A–Z toggle). Every other block
  // loads collapsed, overdue or not — the former firm-overdue exception is
  // gone. Persisted view_state.expanded overrides, where present, win over
  // this default. Reads no clock, so the default never shifts on a tick.
  const mostUrgentBlockId = resultGroups.length > 0 ? resultGroups[0].jurisdictionId : null;
  const blockExpanded = (block) =>
    !collapsibleBlocks || (expandedBlocks[block.jurisdictionId] ?? block.jurisdictionId === mostUrgentBlockId);
  // Expansion write-through (JDC ruling 2026-08-23): every expand/collapse —
  // a block header, a queue-row jump, Expand all / Collapse all — persists
  // the overrides map to view_state beside blockOrder, on the same
  // optimistic / rollback / saveError pattern as the block-order toggle.
  const persistExpandedBlocks = async (next) => {
    const prev = expandedBlocks;
    setExpandedBlocks(next);
    if (!routeIncidentId) return;
    try {
      await updateIncidentViewState(routeIncidentId, viewStateOf(blockOrder, next));
      setSaveError("");
    } catch (err) {
      console.error("View state update failed:", err);
      setExpandedBlocks(prev);
      setSaveError(err?.message ? `Block expansion failed to save: ${err.message}` : "Block expansion failed to save. Try again.");
    }
  };
  const setBlockExpanded = (jurId, open) => {
    if (expandedBlocks[jurId] === open) return;
    persistExpandedBlocks({ ...expandedBlocks, [jurId]: open });
  };
  const expandAllBlocks = () => persistExpandedBlocks(Object.fromEntries(resultGroups.map((b) => [b.jurisdictionId, true])));
  const collapseAllBlocks = () => persistExpandedBlocks(Object.fromEntries(resultGroups.map((b) => [b.jurisdictionId, false])));
  // Queue row click: expand the row's block, then scroll to the card once the
  // expanded layout has committed (the same pendingScroll effect the form's
  // section jumps ride).
  const jumpToObligation = (row) => {
    setBlockExpanded(row.jurisdictionId, true);
    setPendingScroll(obligationAnchorId(row.jurisdictionId, row.authority));
  };
  // Queue summary-line jumps: the first block (in the rendered order) with a
  // suppressed group / a counsel-review card.
  const jumpToFirstSuppressed = () => {
    const target = orderedResultGroups.find((b) => b.suppressedCards.length > 0);
    if (!target) return;
    setBlockExpanded(target.jurisdictionId, true);
    setPendingScroll(`suppressed-group-${target.jurisdictionId}`);
  };
  const jumpToFirstReview = () => {
    const target = orderedResultGroups.find((b) => b.counselReviewCards.length > 0);
    if (!target) return;
    setBlockExpanded(target.jurisdictionId, true);
    setPendingScroll(obligationAnchorId(target.jurisdictionId, target.counselReviewCards[0].authority));
  };

  // ── Minimal operative inputs required to submit (mirrors the old
  //    canAdvance) — read from the shared gate above. ──
  const hasAwareness = gate.hasAwareness;
  const hasAwarenessTz = gate.hasAwarenessTz;
  const hasJurisdiction = gate.hasJurisdiction;
  const hasSensitivity = gate.hasSensitivity;
  // canCompute: the facts resolve (legacy zone-less records included — this
  // is what the silent rehydrate auto-compute reads). canSubmit: canCompute
  // AND a declared zone whenever awareness is set — the Submit gate, which is
  // what heals legacy incidents on resubmit.
  const canCompute = gate.canCompute;
  const canSubmit = gate.canSubmit;

  // Saved incidents open at results. Runs on the render AFTER a genuine
  // rehydrate (the flag lands in the same batch as applyPayload's setters),
  // so canCompute here is derived from the fully hydrated answers — the
  // silent equivalent of pressing Submit. Valid → results, exactly as if
  // submitted (same collapsed-caveat reset as handleSubmit). Invalid → stay
  // on the form and show NO validation errors: attemptedSubmit is left
  // untouched, so errors appear only when the user submits themselves.
  // useLayoutEffect so the flip to results happens before paint — no
  // one-frame flash of the form on the way to the results view.
  useLayoutEffect(() => {
    if (!autoComputePending) return;
    setAutoComputePending(false);
    if (canCompute) {
      setExpandedCaveats(new Set());
      // Persisted block expansion (applied at load) is deliberately kept —
      // the silent auto-compute is a view of the saved incident, not a
      // resubmit.
      // The silent equivalent of pressing Submit: record the computed facts
      // signature (no banner over a fresh compute; enables Back-to-results)
      // — but never a save or a status transition.
      setComputedSignature(factsSignatureOf(buildPayload()));
      setSubmitted(true);
    }
  }, [autoComputePending, canCompute]);

  // A future-dated awareness gets its own specific message; only a truly
  // missing/unparseable value gets the generic "provide" prompt.
  const awarenessInFuture = !!awarenessDate && awarenessDate > now;

  const missingInputs = [];
  if (!hasAwareness) {
    missingInputs.push(
      awarenessInFuture
        ? "The date and time of awareness is in the future — check the date."
        : "Provide the date and time of awareness."
    );
  }
  if (hasAwareness && !hasAwarenessTz) missingInputs.push("Select the timezone in which the awareness date and time is stated.");
  if (!hasJurisdiction) missingInputs.push("Provide at least one affected jurisdiction.");
  if (!hasSensitivity) missingInputs.push("Provide at least one type of personal data involved.");

  // The full IANA list is host-provided and static for the session.
  const timeZoneOptions = useMemo(() => allTimeZones(), []);

  // Results view must never present a refusal as a result (no green
  // "no obligations" state): log it once per occurrence and render nothing.
  useEffect(() => {
    if (submitted && engineRefusal) {
      console.error("Respond: engine refused incomplete facts on the results view", engineRefusal);
    }
  }, [submitted, engineRefusal && engineRefusal.missing.join(",")]);

  // ── Q1 ⇄ data-element cross-check ──
  const selectedTags = new Set();
  record.dataSubjectBlocks.forEach((b) =>
    b.elements.forEach((elId) => {
      const def = DATA_ELEMENTS.find((d) => d.id === elId);
      if (def?.tag) selectedTags.add(def.tag);
    })
  );
  const crossCheckMissing = [...selectedTags].filter((tag) => !sensitivity.includes(tag));

  const sensitivityLabelsForMemo = sensitivity
    .map((s) => SENSITIVITY_OPTIONS.find((o) => o.id === s)?.label)
    .filter(Boolean)
    .map((label) => label.replace(/\s*\([^)]*\)\s*$/, ""));

  const labelsFor = (opts, ids) => ids.map((id) => opts.find((o) => o.id === id)?.label).filter(Boolean);

  // Ordered incident-report structure consumed by the PDF generator and the
  // on-screen review. Only populated fields survive; "not available" groups drop.
  const buildIncidentReportSections = () => {
    const out = [];
    const pushGroup = (title, fields) => {
      const populated = fields.filter(
        (f) => f.value !== undefined && f.value !== null && String(f.value).trim() !== ""
      );
      if (populated.length === 0) return;
      out.push({ type: "group", title });
      populated.forEach((f) => out.push({ type: "field", label: f.label, value: String(f.value), multiline: !!f.multiline }));
    };

    const incidentTypeLabels = INCIDENT_TYPES.filter((t) => t.id !== "other" && record.incidentTypes.includes(t.id)).map((t) => t.label);
    if (record.incidentTypes.includes("other")) {
      incidentTypeLabels.push(record.incidentTypeOther.trim() ? `Other: ${record.incidentTypeOther.trim()}` : "Other");
    }
    pushGroup("General Information", [
      { label: "Incident reference / title", value: record.incidentTitle },
      { label: "Source of incident", value: record.sourceOfIncident },
      { label: "Incident location", value: record.incidentLocation },
      { label: "Department reporting", value: record.departmentReporting },
      { label: "Systems & services impacted", value: record.systemsImpacted, multiline: true },
      { label: "Backups — existence & availability", value: record.backups, multiline: true },
      { label: "Data security principles compromised", value: labelsFor(DATA_PRINCIPLES, record.dataPrinciples).join(", ") },
      { label: "Type of incident", value: incidentTypeLabels.join(", ") },
    ]);

    const tpName =
      record.thirdPartyType === "Customer" ? record.thirdPartyCustomerName
      : record.thirdPartyType === "Vendor" ? record.thirdPartyVendorName
      : record.thirdPartyType === "Individual" ? record.thirdPartyIndividualName
      : record.thirdPartyType === "Other" ? record.thirdPartyOther
      : "";
    const discovery = [
      { label: "Summary of how discovered", value: record.howDiscovered, multiline: true },
      { label: "Learned from a third party?", value: record.learnedFromThirdParty },
    ];
    if (record.learnedFromThirdParty === "Yes") {
      discovery.push({ label: "Type of third party", value: record.thirdPartyType });
      if (tpName) discovery.push({ label: `${record.thirdPartyType} details`, value: tpName });
    }
    pushGroup("How & When Discovered", discovery);

    if (!record.occurrenceNotAvailable) {
      pushGroup("When the Incident Occurred", [
        { label: "Occurrence date", value: record.occurrenceDate },
        { label: "Exact time (incl. time zone)", value: record.occurrenceTime },
        { label: "Additional detail", value: record.occurrenceDetail, multiline: true },
      ]);
    }

    pushGroup("Incident Summary", [
      { label: "Summary of the incident", value: record.incidentSummary, multiline: true },
    ]);

    record.dataSubjectBlocks.forEach((b, i) => {
      const name = b.name.trim() || `Category ${i + 1}`;
      const others = b.others.map((o) => o.trim()).filter(Boolean);
      pushGroup(`Data Subjects — ${name}`, [
        { label: "Approximate count", value: b.count ? fmtCount(b.count) : "" },
        { label: "Data elements", value: labelsFor(DATA_ELEMENTS, b.elements).join(", ") },
        { label: "Other elements", value: others.join(", ") },
      ]);
    });

    const measures = [];
    if (!record.measuresTakenNotAvailable) {
      measures.push({ label: "Measures taken (incl. mitigation)", value: record.measuresTaken, multiline: true });
    }
    if (!record.measuresProposedNotAvailable) {
      measures.push({ label: "Measures proposed (incl. proposed mitigation)", value: record.measuresProposed, multiline: true });
    }
    pushGroup("Measures", measures);

    return out;
  };

  const handleDownloadMemo = async () => {
    setDownloadError("");
    try {
      // Memos always generate from a fresh compute of current facts at
      // generation time (JDC ruling 2026-08-02) — never a cached results
      // state. Belt-and-braces alongside Submit-also-saves; it exists for the
      // Save-without-Submit path, where it guarantees the memo can never
      // print superseded analysis. Shadows the render-scope destructure
      // deliberately.
      const { deadlines, suppressed, review, contingent, services, advisories } =
        computeDeadlines(factsFromPayload(buildPayload()));
      const facts = {
        awarenessDate,
        // Display zone + whether the RECORD holds it (legacy caveat on the
        // memo's Analysis Inputs when it does not).
        awarenessTz: displayTz,
        awarenessTzRecorded: !legacyAwarenessZone,
        jurisdictions,
        residentCounts,
        // Drives the Analysis Inputs "resident count not established" lines;
        // the contingent cards themselves ride the trailing array below.
        residentCountUnknown,
        sensitivity,
        sensitivityLabels: sensitivityLabelsForMemo,
        encryptionSummary: encryptionRecap,
        riskLevel,
        harmAssessment,
        // Lifecycle status for the memo's Analysis Inputs "Status" line —
        // the record states what the matter was when the memo was cut.
        status,
        incidentReport: quickMode ? null : buildIncidentReportSections(),
      };
      // Notification Record section — built UI-side (like incidentReport) and
      // passed as its own parameter, never inside facts: dates-only rows for
      // each obligation with a recorded notification, plus the log entries the
      // user included (filtering is silent — no counts, no gaps). Null when
      // there is nothing to show, so the memo omits the section entirely.
      const notifRows = deadlines
        .filter((d) => notifications[notifKey(d)])
        .map((d) => ({
          authority: d.authority,
          dueText: d.deadline ? fmtDueDate(d.deadline) : "—",
          notifiedText: fmtDateOnly(notifications[notifKey(d)].notified_on),
        }));
      const memoLogEntries = [...incidentLog]
        .filter((e) => e.include_in_memo)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((e) => {
          const t = LOG_TYPE_BY_ID[e.type];
          const typeLabel = t ? t.label : String(e.type || "");
          const lead = t?.kind === "communication" && e.party ? `${e.party} · ${typeLabel}` : typeLabel;
          return { label: `${fmtDateOnly(e.date)} — ${lead}`, value: e.note || "—" };
        });
      const notificationRecord =
        notifRows.length || memoLogEntries.length ? { rows: notifRows, entries: memoLogEntries } : null;
      const pdfBytes = await generateMemoPdf(facts, deadlines, suppressed, review, notificationRecord, services, advisories, contingent);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateForFilename = toDateTimeLocalInZone(awarenessDate || new Date(), displayTz).slice(0, 10);
      a.href = url;
      a.download = quickMode
        ? `breach-notification-analysis-${dateForFilename}.pdf`
        : `${slugify(record.incidentTitle) || "incident-report"}-${dateForFilename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Memo PDF generation failed:", err);
      const msg = err && err.message ? err.message : String(err);
      setDownloadError(`Memo download failed: ${msg}. See browser console for details.`);
    }
  };

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    if (!canSubmit) {
      // A collapsed required field must never be a dead-end error: expand the
      // sections that hold a missing required input and scroll to the first
      // offending one (awareness lives in Discovery; jurisdiction + data type in
      // Data — Discovery precedes Data in document order). The validation
      // message itself renders below. No-ops harmlessly in quick mode, where
      // these section ids aren't in the DOM.
      const toOpen = {};
      if (!hasAwareness) toOpen["form-discovery"] = true;
      if (!hasJurisdiction || !hasSensitivity) toOpen["form-data"] = true;
      setOpenSections((s) => ({ ...s, ...toOpen }));
      const firstId = !hasAwareness ? "form-discovery" : "form-data";
      scrollToSection(firstId);
      return;
    }
    if (saving) return;
    // Submit & compute also saves (JDC ruling 2026-08-02, universal — quick
    // mode included), and results render only after confirmed persistence.
    // A saved incident gets ONE update carrying payload AND the active
    // transition together (single PATCH — no facts/status divergence window);
    // a never-saved form is created active in one insert. The explicit submit
    // remains the only status-transitioning path — the silent rehydrate
    // auto-compute shares the compute, never the transition. Re-submitting a
    // closed incident reactivates it, deliberately without a prompt (Back to
    // results is the non-mutating exit).
    setSaving(true);
    setSaveError("");
    try {
      const title = record.incidentTitle.trim() || "Untitled Incident";
      const payload = buildPayload();
      if (routeIncidentId) {
        await updateIncident(routeIncidentId, { title, payload, status: "active" });
      } else {
        const row = await createIncident(activeOrg?.id, title, payload, "active", notifications, incidentLog);
        justCreatedRef.current = row.id;
        navigate(`/breach-clock/${row.id}`, { replace: true });
      }
      setStatus("active");
      lastSavedPayloadRef.current = payload;
      setSavedAt(new Date());
      setExpandedCaveats(new Set());
      // Resubmit clears persisted expansion so the fresh single-block default
      // applies to the recomputed results, keeping the block-order choice
      // (JDC ruling 2026-08-23). Written only when there was something to
      // clear — a never-expanded incident needs no view_state write.
      if (routeIncidentId && Object.keys(expandedBlocks).length > 0) {
        try {
          await updateIncidentViewState(routeIncidentId, viewStateOf(blockOrder, {}));
        } catch (err) {
          // The facts are saved and the compute is valid; a failed
          // view-state clear is cosmetic. Log and continue.
          console.error("View state clear failed:", err);
        }
      }
      setExpandedBlocks({});
      setComputedSignature(factsSignatureOf(payload));
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // FAILURE PATH IS THE POINT: a compute that renders as if saved would
      // reintroduce the divergence this path exists to kill. Stay on the
      // form; the save-error treatment surfaces the failure; state is
      // untouched so the user can retry.
      console.error("Submit & compute save failed:", err);
      setSaveError(err?.message ? `Save failed: ${err.message}` : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setSubmitted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Back to results (JDC ruling 2026-08-02): discard unsaved in-memory edits
  // by reverting to the last-saved payload, then return to the computed
  // results view — no save, no status transition. Rendered only when a
  // computed results state exists to return to (computedSignature non-null;
  // absent on /new before the first submit). applyPayload ends by clearing
  // submitted/attemptedSubmit; the setSubmitted(true) after it wins the batch.
  const handleBackToResults = () => {
    applyPayload(lastSavedPayloadRef.current || {});
    setExpandedCaveats(new Set());
    // Block expansion is persisted view state (2026-08-23) and survives the
    // non-mutating Back-to-results exit unchanged.
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // From the pending result card: return to the form and jump to the risk
  // section. The #form-risk anchor is rendered after this returns to the form
  // (it exists whenever an EU/UK jurisdiction is selected, which is the only
  // way a pending result arises), so defer the scroll to the next frame.
  const handleCompleteRiskAssessment = () => {
    setSubmitted(false);
    requestAnimationFrame(() => {
      const el = document.getElementById("form-risk");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // From an auto-advisory card ("Edit data categories"): return to the form,
  // open the collapsible Data section (mirroring the submit-validation path),
  // and jump to the Q1 sensitivity list itself (#form-data-categories — the
  // ssn row the advisory directs counsel to sits at its top). The scroll rides
  // the pendingScroll effect, which fires after the commit that re-rendered
  // the form with the section expanded, so it aims at the final laid-out
  // position — the earlier direct rAF scroll aimed at the pre-expand layout
  // and overshot by ~300px (2026-07-25 gate render). Same NAV_CLEARANCE
  // landing as the risk jump. No-ops harmlessly in quick mode.
  const handleEditDataCategories = () => {
    setSubmitted(false);
    setOpenSections((s) => ({ ...s, "form-data": true }));
    scrollToSection("form-data-categories");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Tests view (unchanged) — pure rules-engine pass/fail across engine.js cases.
  // ─────────────────────────────────────────────────────────────────────────
  if (showTests) {
    const results = runTests();
    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    const allPassed = passed === total;
    const byCategory = results.reduce((acc, r) => {
      (acc[r.category] = acc[r.category] || []).push(r);
      return acc;
    }, {});
    return (
      <div style={{ minHeight: "100vh", background: "#FAF8F2", color: "#2C2418", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
          * { box-sizing: border-box; }
          body { margin: 0; }
          .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
          .serif { font-family: Merriweather, Georgia, serif; }
          .section-mark {
            font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500;
            letter-spacing: 0.18em; text-transform: uppercase; color: #1B2A3F; opacity: 0.7;
          }
        `}</style>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: isNarrow ? "40px 20px" : "60px 40px" }}>
          <header style={{ marginBottom: "48px", borderBottom: "1px solid rgba(27,42,63,0.18)", paddingBottom: "32px" }}>
            {/* Pill + eyebrow + back button share one row so the pill sits at
                the top of the header, at the same height as the main Respond
                masthead pill (which likewise leads its header row). The pill
                reads only "Respond" — identical to the masthead lozenge — with
                "Rules Engine Tests" beside it as a .section-mark eyebrow, the
                same treatment as the masthead's "Preliminary" eyebrow, so the
                pill itself never wraps. flexWrap keeps the row from overflowing
                at narrow widths (the button drops below if cramped). */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                <span className="serif" style={{ fontSize: "18px", fontWeight: 400, color: "#1B2A3F", letterSpacing: "0.01em" }}>Respond</span>
                <span className="section-mark">Rules Engine Tests</span>
              </div>
              <button
                onClick={() => setShowTests(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #1B2A3F",
                  borderRadius: "8px",
                  padding: "9px 14px",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  color: "#1B2A3F",
                  flexShrink: 0,
                }}
              >
                ← Back to Respond
              </button>
            </div>
            <p style={{ fontSize: "17px", marginTop: "20px", maxWidth: "640px", lineHeight: 1.6, color: "#2C2418" }}>
              Each case feeds a fact pattern to the deadline engine and asserts which obligations should and should not apply. Run automatically every time this page loads.
            </p>
          </header>

          <div style={{
            padding: "24px 28px",
            marginBottom: "32px",
            background: allPassed ? "#5A6E4A" : "#1B2A3F",
            color: "#FAF8F2",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "6px" }}>
                {allPassed ? "All tests passed" : "Failures detected"}
              </div>
              <div className="serif" style={{ fontSize: "32px", fontWeight: 400 }}>
                {passed} / {total}
              </div>
            </div>
            <div className="mono" style={{ fontSize: "11px", opacity: 0.7 }}>
              Reference time · {TEST_AWARENESS.toISOString()}
            </div>
          </div>

          {Object.entries(byCategory).map(([category, items]) => {
            const categoryPassed = items.every((r) => r.pass);
            return (
              <div key={category} style={{ marginBottom: "32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <div className="section-mark">{category}</div>
                  <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
                  <div className="section-mark" style={{ color: categoryPassed ? "#5A6E4A" : "#C76E3A", opacity: 1 }}>
                    {items.filter((r) => r.pass).length} / {items.length}
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1px solid rgba(27,42,63,0.18)", borderRadius: "12px", overflow: "hidden" }}>
                  {items.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "14px 20px",
                        borderBottom: i < items.length - 1 ? "1px solid rgba(27,42,63,0.10)" : "none",
                        display: "flex",
                        gap: "16px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{
                        flexShrink: 0,
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: r.pass ? "#5A6E4A" : "#C76E3A",
                        color: "#FAF8F2",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 600,
                        marginTop: "2px",
                      }}>
                        {r.pass ? "✓" : "×"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "15px", lineHeight: 1.5 }}>{r.name}</div>
                        {!r.pass && (
                          <div className="mono" style={{
                            fontSize: "12px",
                            color: "#C76E3A",
                            marginTop: "8px",
                            background: "#FBF5EE",
                            padding: "10px 12px",
                            borderLeft: "3px solid #C76E3A",
                            wordBreak: "break-word",
                          }}>
                            {r.error ? `ERROR: ${r.error}` : r.message || "(no message)"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <footer style={{ marginTop: "60px", paddingTop: "32px", borderTop: "1px solid rgba(27,42,63,0.18)" }}>
            <div className="section-mark" style={{ opacity: 0.5 }}>
              {total} cases · pure rules engine · no UI assertions
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Saved-incident load states (/breach-clock/:id only). Inline-styled — the
  // component's <style> classes live in the main return, not here.
  // ─────────────────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div style={{ minHeight: "50vh", background: "#FAF8F2", color: "#2C2418", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div
          style={{
            maxWidth: "560px", margin: "0 auto", padding: "80px 40px",
            fontSize: "11px", fontWeight: 500, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "#1B2A3F", opacity: 0.6,
          }}
        >
          Loading incident…
        </div>
      </div>
    );
  }
  if (loadState === "notfound" || loadState === "loaderror") {
    return (
      <div style={{ minHeight: "50vh", background: "#FAF8F2", color: "#2C2418", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "80px 40px" }}>
          <div style={{ fontFamily: "Merriweather, Georgia, serif", fontSize: "24px", fontWeight: 400, color: "#1B2A3F" }}>
            {loadState === "notfound" ? "Incident not found" : "Couldn't load this incident"}
          </div>
          <p style={{ fontSize: "15px", lineHeight: 1.6, margin: "14px 0 24px" }}>
            {loadState === "notfound"
              ? "It may have been deleted, or it may belong to a different organization."
              : "Something went wrong while loading it. Reload the page to try again."}
          </p>
          <Link
            to="/breach-clock"
            style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              color: "#1B2A3F", fontSize: "14px", fontWeight: 500, textDecoration: "none",
              border: "1px solid #1B2A3F", borderRadius: "8px", padding: "9px 16px",
            }}
          >
            <ArrowLeft size={14} /> Back to Respond
          </Link>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers (plain functions returning JSX — NOT components, so inputs
  // don't remount and lose focus on each keystroke).
  // ─────────────────────────────────────────────────────────────────────────
  const labelRow = (text, tooltip, badge) => (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
      <span className="field-mark">{text}</span>
      {tooltip && <InfoTip text={tooltip} />}
      {badge && (
        <span className="mono" style={{ fontSize: "10px", letterSpacing: "0.08em", color: "#C76E3A", textTransform: "uppercase" }}>
          {badge}
        </span>
      )}
    </div>
  );

  const field = (labelText, tooltip, control, opts = {}) => (
    <div style={{ marginBottom: "24px" }}>
      {labelRow(labelText, tooltip, opts.badge)}
      {control}
    </div>
  );

  // Checkbox-row: a prominent always-visible checkbox + clickable, hover-lit
  // row. The one selection idiom across the form (jurisdictions, Q1, incident
  // types, CIA principles, data elements, and the boolean toggles).
  const checkRow = (checked, label, onToggle, opts = {}) => (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      className={`check-row ${checked ? "selected" : ""}`}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
    >
      <span className="check-box" aria-hidden="true">{checked && <Check size={14} strokeWidth={3} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="check-label">{label}</span>
        {opts.sub && <span className="mono check-sub">{opts.sub}</span>}
        {opts.desc && <span className="check-desc">{opts.desc}</span>}
      </span>
    </div>
  );

  const multiCheck = (options, selected, onToggle, cols = 2) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "4px" }}>
      {options.map((o) => (
        <div key={o.id}>{checkRow(selected.includes(o.id), o.label, () => onToggle(o.id), { desc: o.desc })}</div>
      ))}
    </div>
  );

  // Tri-state Yes/No[/extra] selector — check-rows behaving as radios (same idiom
  // as the risk section): clicking a row sets the value; unset ("") is the
  // pre-interaction default. Used by the encryption cluster.
  const triStateRow = (value, setValue, options) => (
    <div style={{ display: "grid", gap: "4px" }}>
      {options.map((o) => (
        <div key={o.value}>
          {checkRow(value === o.value, o.label, () => setValue(o.value), o.desc ? { desc: o.desc } : {})}
        </div>
      ))}
    </div>
  );

  // ── Collapsible sections ──────────────────────────────────────────────────
  const isSectionOpen = (id) => !!openSections[id];
  const toggleSection = (id) => setOpenSections((s) => ({ ...s, [id]: !s[id] }));
  const expandAll = () => setOpenSections(Object.fromEntries(ALL_SECTION_IDS.map((id) => [id, true])));
  const collapseAll = () => setOpenSections({});
  // Request a scroll to a section; the effect above performs it after the next
  // commit (so the target sits in its final, post-expand position).
  const scrollToSection = (id) => setPendingScroll(id);
  // Expand a section (if collapsed) and scroll its header into view. Shared by
  // the left index and the post-submit validation jump.
  const openAndScrollTo = (id) => {
    setOpenSections((s) => ({ ...s, [id]: true }));
    scrollToSection(id);
  };

  // Header is the toggle. A div role="button" (not a real <button>) so the
  // section-03 InfoTip — itself a <button> — can nest without invalid markup;
  // InfoTip stops click propagation, and the keydown guard (target ===
  // currentTarget) keeps Enter/Space on the InfoTip from also toggling.
  const headerKeyDown = (id) => (e) => {
    if ((e.key === " " || e.key === "Enter") && e.target === e.currentTarget) {
      e.preventDefault();
      toggleSection(id);
    }
  };

  // Does a section hold any user input? Drives the quiet completion indicator so
  // a collapsed header never hides that a (required) section is still blank. The
  // three required operative inputs map here: awareness → Discovery; jurisdiction
  // + data type → Data. Empty is neutral (not an error) before submit.
  const sectionHasInput = (id) => {
    switch (id) {
      case "form-general":
        return !!(record.incidentTitle || record.sourceOfIncident || record.incidentLocation ||
          record.departmentReporting || record.systemsImpacted || record.backups ||
          record.dataPrinciples.length || record.incidentTypes.length);
      case "form-discovery":
        return !!(record.howDiscovered || awareness || record.learnedFromThirdParty);
      case "form-timing":
        return !!(record.occurrenceNotAvailable || record.occurrenceDate ||
          record.occurrenceTime || record.occurrenceDetail);
      case "form-summary":
        return !!record.incidentSummary;
      case "form-data":
        return anyJurisdiction || sensitivity.length > 0 || !!encrypted || !!redacted ||
          record.dataSubjectBlocks.some((b) => b.name || b.count || b.elements.length || b.others.some((o) => o.trim()));
      case "form-measures":
        return !!(record.measuresTaken || record.measuresProposed ||
          record.measuresTakenNotAvailable || record.measuresProposedNotAvailable);
      case "form-risk":
        return !!riskLevel;
      case "form-harm":
        return !!harmAssessment;
      default:
        return false;
    }
  };

  // Quiet completion indicator: a small Moss check when the section has input, a
  // neutral hollow dot when empty. Never Ember/red for empty before submit.
  const completionDot = (filled) =>
    filled ? (
      <span
        aria-label="Section has input"
        title="This section has input"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "18px", height: "18px", borderRadius: "50%", background: "#5A6E4A",
          color: "#FAF8F2", flexShrink: 0,
        }}
      >
        <Check size={11} strokeWidth={3} />
      </span>
    ) : (
      <span
        aria-label="Section empty"
        title="No input yet"
        style={{
          display: "inline-block", width: "10px", height: "10px", borderRadius: "50%",
          border: "1.5px solid rgba(27,42,63,0.28)", flexShrink: 0,
        }}
      />
    );

  // A collapsible form section: an on-brand clickable header (eyebrow number +
  // serif heading, the prior sectionHeading treatment) carrying a completion dot
  // and a chevron, over a body that mounts only when open. The body wrapper is
  // always present so aria-controls resolves; its children mount on open (so
  // collapsed content is out of layout and the tab order) and fade in.
  const collapsibleSection = (id, num, title, tooltip, body) => {
    const open = isSectionOpen(id);
    const bodyId = `${id}-body`;
    return (
      <section id={id} style={{ marginBottom: open ? "48px" : "12px", scrollMarginTop: `${NAV_CLEARANCE}px` }}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-controls={bodyId}
          className="section-toggle"
          onClick={() => toggleSection(id)}
          onKeyDown={headerKeyDown(id)}
          style={{ marginBottom: open ? "20px" : 0 }}
        >
          <span className="mono" style={{ fontSize: "13px", color: "#1B2A3F", opacity: 0.55 }}>{num}</span>
          <h2 className="serif" style={{ fontSize: "24px", fontWeight: 400, margin: 0, color: "#1B2A3F", letterSpacing: "-0.01em" }}>
            {title}
          </h2>
          {tooltip && <InfoTip text={tooltip} size={15} />}
          <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
          {completionDot(sectionHasInput(id))}
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{
              color: "#1B2A3F", opacity: 0.6, flexShrink: 0,
              transition: "transform 0.2s ease",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        </div>
        <div id={bodyId} aria-hidden={!open}>
          {open && <div className="section-body-anim">{body}</div>}
        </div>
      </section>
    );
  };

  // Slim section index for the left page gutter. Plain CSS sticky (no
  // JS-measured positioning); each item is a real anchor to its section id.
  const renderSectionIndex = () => (
    <nav
      aria-label="Form sections"
      style={{ position: "sticky", top: `${NAV_CLEARANCE}px`, width: "104px", marginLeft: "auto", marginRight: "24px", paddingTop: 0 }}
    >
      <div
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: "10px", fontWeight: 500,
          letterSpacing: "0.14em", textTransform: "uppercase", color: "#2C2418",
          opacity: 0.5, marginBottom: "12px", paddingLeft: "11px",
        }}
      >
        On this page
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        {indexSections.map((s) => {
          const active = activeSection === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active ? "true" : undefined}
                onClick={(e) => { e.preventDefault(); openAndScrollTo(s.id); }}
                style={{
                  display: "block", textDecoration: "none", fontFamily: "'Inter', sans-serif",
                  fontSize: "12px", lineHeight: 1.3, padding: "5px 0 5px 8px",
                  borderLeft: active ? "3px solid #1B2A3F" : "3px solid transparent",
                  color: active ? "#1B2A3F" : "#2C2418",
                  opacity: active ? 1 : 0.55,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  // ── Counsel notes (rendered in the rail on desktop, inline on narrow) ──
  const noteBody = (key) => {
    if (key === "awareness") {
      return (
        <>
          Under Art. 33 GDPR, the clock starts at <strong>awareness</strong>, not discovery — interpreted as reasonable certainty that a security incident has compromised personal data. Earlier signals (anomalies, suspicions) may begin an investigation period but typically do not yet start the 72-hour clock. If you are uncertain which moment qualifies, document your reasoning and consider using the earliest defensible timestamp.
        </>
      );
    }
    if (key === "q1") {
      return "These types of personal data are directly relevant to determining whether you must notify applicable regulators about an incident identified as a personal data breach. They drive the deadline calculation.";
    }
    if (key === "encryption") {
      return "Properly encrypted data with an uncompromised key may suppress some or all notification obligations. The mechanism varies by jurisdiction — most U.S. state statutes (CA, TX, CO, MA among modeled) exclude encrypted data from the breach definition itself; EU and UK GDPR provide a conditional Art. 34(3)(a) exemption from individual notification only. Specific standards vary (e.g., Massachusetts requires 128-bit or higher).";
    }
    if (key === "risk") {
      if (highRiskPresent) {
        const hrLabels = sensitivity
          .filter((s) => isHighRisk([s]))
          .map((s) => SENSITIVITY_OPTIONS.find((o) => o.id === s)?.label)
          .filter(Boolean);
        return `You indicated ${joinList(hrLabels)} — categories that often meet the high-risk threshold. The determination is yours; confirm or adjust.`;
      }
      return "Art. 33 (authority, 72 hours) is triggered by any risk; Art. 34 (data subjects, no fixed deadline) only by a high risk.";
    }
    return null;
  };

  // Each note carries a title connecting it to the topic it annotates — the
  // notes flow in document order rather than aligning to their fields, so the
  // title is what carries the connection.
  const NOTE_TITLES = {
    awareness: "Awareness",
    q1: "Data categories",
    encryption: "Encryption",
    risk: "Risk assessment",
  };

  const renderNote = (key) => (
    <aside className="counsel-note">
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "10px", color: "#1B2A3F" }}>
        <Info size={14} />
        <span className="serif" style={{ fontSize: "16px", lineHeight: 1.3, color: "#1B2A3F" }}>
          {NOTE_TITLES[key]}
        </span>
      </div>
      <p style={{ fontSize: "13px", lineHeight: 1.6, margin: 0 }}>{noteBody(key)}</p>
    </aside>
  );

  // Standalone rail note (not field-anchored): the "incident vs. breach"
  // distinction, relocated from a full-width top-of-page banner into the rail.
  // Body text is substantive legal copy — preserve it verbatim.
  const renderIncidentVsBreachNote = () => (
    <aside className="counsel-note">
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "10px", color: "#1B2A3F" }}>
        <Info size={14} />
        <span className="serif" style={{ fontSize: "16px", lineHeight: 1.3, color: "#1B2A3F" }}>
          Incident vs. Breach
        </span>
      </div>
      <p style={{ fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
        This form uses the term "incident" rather than "personal data breach" in most cases. While all security incidents are not personal data breaches, all personal data breaches are security incidents. The question of whether a security incident constitutes a personal data breach under applicable law is a legal question that must be determined by qualified privacy counsel.
      </p>
    </aside>
  );

  // ── Operative field renderers (shared by full + quick mode) ──
  // On narrow screens each annotated field renders its note inline beneath
  // itself; on desktop the notes flow in the rail (see the shell below).
  const renderAwarenessField = () => (
    <div style={{ marginBottom: "24px" }}>
      {labelRow("Date & time of awareness", "To the best of your knowledge, when did the first person in your organization to realize an incident may have occurred become aware of it?")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 16px", alignItems: "flex-start" }}>
        <input
          type="datetime-local"
          className="form-input"
          aria-label="Date and time of awareness"
          value={awareness}
          onChange={(e) => setAwareness(e.target.value)}
          max={toDateTimeLocalInZone(now, displayTz)}
          style={{ maxWidth: "340px" }}
        />
        {/* Declared zone — the user states the zone the time above is written
            in (JDC 2026-08-22). Prefilled with the device zone as a visible,
            editable suggestion; common US zones first, full IANA list below.
            Required for Submit whenever awareness is set. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <select
            className="form-select"
            aria-label="Timezone of awareness"
            value={awarenessTz}
            onChange={(e) => setAwarenessTz(e.target.value)}
            style={{ maxWidth: "340px" }}
          >
            {!isValidTimeZone(awarenessTz) && <option value="">Select timezone</option>}
            <optgroup label="Common US zones">
              {COMMON_US_ZONES.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </optgroup>
            <optgroup label="All zones">
              {timeZoneOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </optgroup>
          </select>
          <span style={{ fontSize: "12px", color: "#9FAEC2" }}>
            Timezone the date and time above is stated in{awarenessTz === deviceTimeZone() ? " (suggested from this device)" : ""}.
          </span>
        </div>
      </div>
      {isNarrow && <div style={{ marginTop: "14px" }}>{renderNote("awareness")}</div>}
    </div>
  );

  // Jurisdiction picker: an additive "Add jurisdiction" combobox (ARIA
  // combobox/listbox over a real <input>), a bulk "Paste counts" panel, an
  // add-all-US control, and the selected jurisdictions as rows with their
  // resident-count inputs inline. Writes the same jurisdictions/residentCounts
  // maps the former checkbox block wrote — payload shape unchanged.
  const renderJurisdictionsField = () => {
    const q = jurQuery.trim().toLowerCase();
    const available = JURISDICTIONS.filter((j) => !jurisdictions[j.id]);
    const matches = q ? available.filter((j) => jurisdictionMatchesQuery(j, q)) : available;
    const { us: usOptions, intl: intlOptions } = groupJurisdictions(matches);
    const flatOptions = [...usOptions, ...intlOptions];
    const highlightIdx = flatOptions.length ? Math.min(jurHighlight, flatOptions.length - 1) : 0;
    const listVisible = jurListOpen && (flatOptions.length > 0 || q.length > 0);

    const selected = JURISDICTIONS.filter((j) => jurisdictions[j.id]);
    const { us: usSelected, intl: intlSelected } = groupJurisdictions(selected);
    const selectedRows = [...usSelected, ...intlSelected];

    const modeledUSCount = JURISDICTIONS.filter((j) => !INTL_JURISDICTION_IDS.has(j.id)).length;
    const unselectedUSCount = JURISDICTIONS.filter(
      (j) => !INTL_JURISDICTION_IDS.has(j.id) && !jurisdictions[j.id]
    ).length;

    const onComboKeyDown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!jurListOpen) {
          setJurListOpen(true);
          setJurHighlight(0);
        } else {
          setJurHighlight(Math.min(highlightIdx + 1, Math.max(flatOptions.length - 1, 0)));
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setJurHighlight(Math.max(highlightIdx - 1, 0));
      } else if (e.key === "Enter") {
        if (jurListOpen && flatOptions[highlightIdx]) {
          e.preventDefault();
          addJurisdiction(flatOptions[highlightIdx]);
        }
      } else if (e.key === "Escape") {
        setJurListOpen(false);
      }
    };

    const optionNode = (jur) => {
      const idx = flatOptions.indexOf(jur);
      return (
        <div
          key={jur.id}
          id={`jur-opt-${jur.id}`}
          role="option"
          aria-selected={idx === highlightIdx}
          className={`jur-option ${idx === highlightIdx ? "active" : ""}`}
          onMouseEnter={() => setJurHighlight(idx)}
          onClick={() => addJurisdiction(jur)}
        >
          <span className="jur-option-name">{highlightMatch(jur.name, jurQuery)}</span>
          <span className="mono jur-option-sub">{highlightMatch(jur.statute, jurQuery)}</span>
        </div>
      );
    };

    return (
      <div style={{ marginBottom: "24px" }}>
        {labelRow("Which jurisdictions' residents are affected?")}

        {/* Combobox + secondary controls */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "400px" }}>
            <input
              role="combobox"
              aria-expanded={listVisible}
              aria-controls="jur-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                listVisible && flatOptions[highlightIdx] ? `jur-opt-${flatOptions[highlightIdx].id}` : undefined
              }
              aria-label="Add jurisdiction"
              className="form-input"
              placeholder="Add jurisdiction — name, postal code, or statute"
              value={jurQuery}
              onChange={(e) => {
                setJurQuery(e.target.value);
                setJurListOpen(true);
                setJurHighlight(0);
              }}
              onFocus={() => setJurListOpen(true)}
              onBlur={() => setJurListOpen(false)}
              onKeyDown={onComboKeyDown}
            />
            {listVisible && (
              <div
                id="jur-listbox"
                role="listbox"
                aria-label="Jurisdictions"
                className="jur-pane"
                onMouseDown={(e) => e.preventDefault()}
              >
                {flatOptions.length === 0 ? (
                  <div className="jur-empty">No matching jurisdiction.</div>
                ) : (
                  <>
                    {usOptions.length > 0 && (
                      <div role="group" aria-label="United States">
                        <div className="jur-group-label" aria-hidden="true">United States</div>
                        {usOptions.map(optionNode)}
                      </div>
                    )}
                    {intlOptions.length > 0 && (
                      <div role="group" aria-label="International">
                        <div className="jur-group-label" aria-hidden="true">International</div>
                        {intlOptions.map(optionNode)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "10px 16px", fontSize: "13px" }}
            aria-expanded={pasteOpen}
            onClick={() => {
              setPasteReport(null);
              setPasteOpen((o) => !o);
            }}
          >
            Paste counts
          </button>
          <div>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "10px 16px", fontSize: "13px" }}
              onClick={addAllUS}
              disabled={unselectedUSCount === 0}
            >
              Add all U.S. jurisdictions
            </button>
            <div className="rule-text" style={{ marginTop: "5px", fontSize: "12px" }}>
              adds the {modeledUSCount} U.S. jurisdictions currently modeled
            </div>
          </div>
        </div>

        {/* Bulk paste panel (inline, not a modal) */}
        {pasteOpen && (
          <div style={{ marginTop: "14px", padding: "20px", border: "1px solid rgba(27,42,63,0.18)", background: "#fff", borderRadius: "12px", maxWidth: "640px" }}>
            {labelRow(
              "Paste counts",
              "One jurisdiction per line, then its resident count — separated by a tab, comma, or two or more spaces. A header row, thousands separators, and blank lines are tolerated."
            )}
            <textarea
              className="form-textarea"
              aria-label="Jurisdictions and counts, one per line"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"California\t12,400\nNew York\t8,100"}
              style={{ minHeight: "110px", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: "13px" }}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button type="button" className="btn-primary" style={{ padding: "9px 18px", fontSize: "13px" }} onClick={applyBulkPaste} disabled={!pasteText.trim()}>
                Apply
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "9px 18px", fontSize: "13px" }}
                onClick={() => {
                  setPasteOpen(false);
                  setPasteText("");
                  setPasteReport(null);
                }}
              >
                Cancel
              </button>
            </div>
            {pasteReport && (
              <div style={{ marginTop: "14px", fontSize: "13px", lineHeight: 1.6 }}>
                <div>
                  {pasteReport.added.length} added, {pasteReport.updated.length} updated.
                </div>
                {pasteReport.unmatched.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <div className="field-mark" style={{ marginBottom: "4px" }}>Not recognized</div>
                    {pasteReport.unmatched.map((l, i) => (
                      <div key={i} className="mono" style={{ fontSize: "12px" }}>{l}</div>
                    ))}
                  </div>
                )}
                {pasteReport.notModeled.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <div className="field-mark" style={{ marginBottom: "4px" }}>Not currently modeled</div>
                    {pasteReport.notModeled.map((n) => (
                      <div key={n}>{n} — not currently modeled</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Clean apply closes the panel — keep its outcome visible in a quiet
            one-line summary until the panel is next opened. */}
        {!pasteOpen && pasteReport && (
          <div className="rule-text" style={{ marginTop: "8px" }}>
            Counts applied: {pasteReport.added.length} added, {pasteReport.updated.length} updated.
          </div>
        )}

        {/* Selected jurisdictions — US group first, alphabetical within group */}
        {selectedRows.length > 0 && (
          <div style={{ marginTop: "16px", border: "1px solid rgba(27,42,63,0.18)", background: "#fff", borderRadius: "12px" }}>
            {selectedRows.map((jur, i) => {
              const thresholdObligations = jur.obligations.filter((o) => o.gating?.residentThreshold !== undefined);
              return (
                <div key={jur.id} className="jur-row" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(27,42,63,0.12)" }}>
                  <div style={{ flex: "1 1 auto", minWidth: 0, paddingTop: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "15px", lineHeight: 1.4 }}>{jur.name}</span>
                      {bulkFlash.has(jur.id) && (
                        <span
                          className="mono"
                          style={{ fontSize: "10px", letterSpacing: "0.08em", background: "#E8DDC4", color: "#1B2A3F", padding: "2px 6px", borderRadius: "6px" }}
                        >
                          UPDATED
                        </span>
                      )}
                    </div>
                    <span className="mono check-sub">{jur.statute}</span>
                  </div>
                  {jur.residentField && (
                    <div style={{ flex: "0 0 230px" }}>
                      <span className="field-mark" aria-hidden="true" style={{ display: "block", fontSize: "10px", marginBottom: "5px" }}>
                        Residents affected
                      </span>
                      <input
                        type="number"
                        className="form-input"
                        ref={(el) => {
                          countInputRefs.current[jur.id] = el;
                        }}
                        aria-label={jur.residentField.stateLabel}
                        placeholder={jur.residentField.placeholder || ""}
                        value={residentCounts[jur.id] || ""}
                        disabled={!!residentCountUnknown[jur.id]}
                        onChange={(e) => setResidentCount(jur.id, e.target.value)}
                        style={residentCountUnknown[jur.id] ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                      />
                      {/* "Count not yet known" — a real checkbox (not the
                          .check-row idiom, which is the selection-list
                          control): this is a compact per-row qualifier on the
                          count input beside it. Checking it clears and
                          disables the count; typing a count unchecks it. */}
                      <label
                        style={{
                          display: "flex", alignItems: "center", gap: "8px",
                          marginTop: "8px", fontSize: "12.5px", lineHeight: 1.4,
                          color: "#2C2418", cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          /* Named per jurisdiction so the control is
                             unambiguous out of visual context. */
                          aria-label={`Count not yet known — ${jur.name}`}
                          checked={!!residentCountUnknown[jur.id]}
                          onChange={(e) => setCountUnknown(jur.id, e.target.checked)}
                          style={{ width: "14px", height: "14px", accentColor: "#1B2A3F", cursor: "pointer" }}
                        />
                        Count not yet known
                      </label>
                      {thresholdObligations.length > 0 && (
                        <div className="rule-text" style={{ marginTop: "6px", fontSize: "12px" }}>
                          {thresholdObligations.map((o, idx) => {
                            const t = o.gating.residentThreshold;
                            const cmp = o.gating.comparator || "gte";
                            const phrase = cmp === "gt" ? `>${t.toLocaleString()}` : `${t.toLocaleString()}+`;
                            return (
                              <div key={idx}>
                                {phrase} — {o.thresholdLabel || `${o.authority} notification`} required
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-inline-remove"
                    style={{ marginTop: "6px" }}
                    onClick={() => removeJurisdiction(jur.id)}
                    aria-label={`Remove ${jur.name}`}
                  >
                    <X size={13} /> Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderQ1 = () => (
    // Anchor for the auto-advisory "Edit data categories" jump: the target is
    // the Q1 list itself (not the Data section top), with the same
    // NAV_CLEARANCE scroll margin the section anchors carry, so the landing
    // puts the top of the sensitivity list — the ssn row — comfortably in view.
    <div id="form-data-categories" style={{ marginBottom: "24px", scrollMarginTop: `${NAV_CLEARANCE}px` }}>
      {labelRow("Did the incident involve any of the following types of personal data?")}
      {multiCheck(SENSITIVITY_OPTIONS, sensitivity, toggleSensitivity, 2)}
      {isNarrow && <div style={{ marginTop: "14px" }}>{renderNote("q1")}</div>}
    </div>
  );

  // US encryption cluster (S3b). Five tri-state inputs in the field-mark idiom,
  // with nested reveals: strength + keyAcquired appear only when encrypted=Yes;
  // reidentificationAcquired only when redacted=Yes. US-facing — shown only when a
  // US jurisdiction is selected (S5: EU/UK now have their own gdprUnintelligibility
  // input, so the cluster no longer needs to render for EU-only incidents).
  const renderEncryption = () => {
    if (!anyUSJurisdiction) return null;
    const helperStyle = { fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", color: "#2C2418", opacity: 0.7, maxWidth: "640px" };
    return (
      <div style={{ marginBottom: "24px" }}>
        <div style={{ marginBottom: "20px" }}>
          {labelRow("Was the affected data encrypted?")}
          {triStateRow(encrypted, setEncrypted, YES_NO)}
        </div>
        {encrypted === "yes" && (
          <>
            <div style={{ marginBottom: "20px" }}>
              {labelRow("Was the encryption at least 128-bit (AES-128 or stronger)?")}
              <p style={helperStyle}>Massachusetts recognizes its safe harbor only for 128-bit-or-higher.</p>
              {triStateRow(encryptionStrength, setEncryptionStrength, ENCRYPTION_STRENGTH_OPTIONS)}
            </div>
            <div style={{ marginBottom: "20px" }}>
              {labelRow("Was the encryption key, decryption means, or a security credential able to render the encrypted data readable also acquired?")}
              <p style={helperStyle}>If acquired, the encryption safe harbor does not apply — California explicitly includes an acquired security credential.</p>
              {triStateRow(keyAcquired, setKeyAcquired, YES_NO)}
            </div>
          </>
        )}
        <div style={{ marginBottom: "20px" }}>
          {labelRow("Was the affected data redacted?")}
          <p style={helperStyle}>Virginia's safe harbor includes redacted data; most states' do not.</p>
          {triStateRow(redacted, setRedacted, YES_NO)}
        </div>
        {redacted === "yes" && (
          <div style={{ marginBottom: "20px" }}>
            {labelRow("Was the information needed to re-identify the redacted data also acquired?")}
            <p style={helperStyle}>If acquired, the redaction safe harbor does not apply.</p>
            {triStateRow(reidentificationAcquired, setReidentificationAcquired, YES_NO)}
          </div>
        )}
        {isNarrow && <div style={{ marginTop: "14px" }}>{renderNote("encryption")}</div>}
      </div>
    );
  };

  // ── EU/UK risk assessment (operative; shown only when an EU/UK jurisdiction
  //    is selected). Three mutually-exclusive rows behaving as radios: clicking
  //    one sets riskLevel and clears the others (selected = riskLevel === value;
  //    "" = none selected). When high-risk data was indicated, the "high" option
  //    carries a quiet "Suggested" mark — a hint, never a pre-selection; the
  //    determination is the user's. Shared by full and quick mode. ──
  const renderRiskAssessment = () => (
    <div style={{ marginBottom: "24px" }}>
      <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 16px", color: "#2C2418", maxWidth: "640px" }}>
        Your assessment of the risk to data subjects' rights and freedoms determines the EU/UK notification obligations — this is a legal judgment for you to make.
      </p>
      <div style={{ display: "grid", gap: "4px" }}>
        {RISK_OPTIONS.map((o) => {
          const suggested = o.value === "high" && highRiskPresent;
          const label = suggested ? (
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
              {o.label}
              <span
                className="mono"
                style={{
                  fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#1B2A3F", opacity: 0.6, background: "#E8DDC4",
                  padding: "2px 8px", borderRadius: "6px",
                }}
              >
                Suggested
              </span>
            </span>
          ) : o.label;
          return (
            <div key={o.value}>
              {checkRow(riskLevel === o.value, label, () => setRiskLevel(o.value), { desc: o.desc })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── GDPR Art. 34(3)(a) unintelligibility (S5; EU/UK only, near the risk
  //    section). Dedicated tri-state input that replaced the derived
  //    encryptionApplied. No 128-bit floor — a qualitative standard. ──
  const renderGdprUnintelligibility = () => (
    <div style={{ marginBottom: "24px" }}>
      {labelRow("Were appropriate technical measures (e.g. encryption) applied that render the data unintelligible to unauthorised persons?")}
      <p style={{ fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", color: "#2C2418", opacity: 0.7, maxWidth: "640px" }}>
        Under Art. 34(3)(a), individual notification may be exempt where such measures rendered the data unintelligible. Does NOT affect Art. 33 authority notification.
      </p>
      {triStateRow(gdprUnintelligibility, setGdprUnintelligibility, YES_NO)}
    </div>
  );

  // ── Harm assessment (operative; shown only when a selected jurisdiction
  //    carries a harmGate — CT/DE/CO/VA as encoded). Three mutually-exclusive
  //    rows like the risk question; "Not assessed" ("") is the default. The
  //    answer attests a documented determination under the applicable
  //    statutory standards (shown in the "Applicable standards" card); the
  //    tool never draws the conclusion. No prefill or shared state in either
  //    direction with the risk question. ──
  const renderHarmAssessment = () => {
    const euUk = jurisdictions.eu || jurisdictions.uk;
    return (
      <div style={{ marginBottom: "24px" }}>
        {labelRow("Has an appropriate investigation determined that the applicable statutory harm or misuse standard is satisfied?")}
        <p style={{ fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 16px", color: "#2C2418", opacity: 0.7, maxWidth: "640px" }}>
          Distinct from the EU/UK risk assessment{euUk ? " above" : ""}, which addresses risk to data subjects' rights and freedoms under the GDPR. This question addresses the harm and misuse standards of{" "}
          <span style={{ color: "#1B2A3F", fontWeight: 500, opacity: 1 }}>{joinList(harmGatedSelected.map((j) => j.name))}</span>
          {" "}— each standard is shown at right.
        </p>
        <div style={{ display: "grid", gap: "4px" }}>
          {HARM_OPTIONS.map((o) => (
            <div key={o.value || "unset"}>
              {checkRow(harmAssessment === o.value, o.label, () => setHarmAssessment(o.value), { desc: o.desc })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // "Applicable standards" explainer card (parchment counsel-note family,
  // beside the harm question): one entry per selected harm-gated
  // jurisdiction, standard verbatim in quotes with its citation — sourced
  // from harmGate data via harmStandardsFor, never hardcoded. Colorado
  // renders one entry per DISTINCT standard, tagged (Residents / AG).
  const renderHarmStandardsNote = () => (
    <aside className="counsel-note">
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "10px", color: "#1B2A3F" }}>
        <Info size={14} />
        <span className="serif" style={{ fontSize: "16px", lineHeight: 1.3, color: "#1B2A3F" }}>
          Applicable standards
        </span>
      </div>
      {harmGatedSelected.map((jur, idx) => {
        const entries = harmStandardsFor(jur);
        return (
          <div key={jur.id} style={{ marginBottom: idx === harmGatedSelected.length - 1 ? 0 : "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "#1B2A3F", marginBottom: "4px" }}>{jur.name}</div>
            {entries.map((e, i) => (
              <div key={i} style={{ marginBottom: i === entries.length - 1 ? 0 : "8px" }}>
                {entries.length > 1 && (
                  <div className="mono" style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#2C2418", opacity: 0.6, marginBottom: "2px" }}>
                    {e.tag}
                  </div>
                )}
                <p style={{ fontSize: "13px", lineHeight: 1.6, margin: "0 0 2px" }}>“{e.standard}”</p>
                <div className="mono" style={{ fontSize: "11px", opacity: 0.7, color: "#2C2418" }}>{e.citation}</div>
              </div>
            ))}
          </div>
        );
      })}
    </aside>
  );

  // ── Deadline obligations (the analysis; shown only on the review) ──
  const renderObligations = () => {
    // Structured refusal (JDC 2026-08-22): incomplete facts render NOTHING
    // here — never a zero-state banner (a refusal is not "no obligations").
    // The refusal is logged by the effect above; the submit gate makes this
    // unreachable in practice.
    if (engineRefusal) return null;
    // pending = EU/UK obligations awaiting a risk assessment. While present, the
    // consolidated pending card speaks and BOTH zero-state banners are silenced.
    const hasPending = pending.length > 0;
    const pendingJurisdictions = [...new Set(pending.map((p) => p.jurisdiction))];
    // Reason-aware green banner: distinguish risk-assessment suppression from
    // encryption suppression (and the mixed case where both are present).
    const riskSuppressed = suppressed.some((s) => s.suppression_type === "risk_assessment");
    const encryptionSuppressed = suppressed.some(
      (s) => s.suppression_type === "breach_definition" || s.suppression_type === "unintelligibility_exemption"
    );
    // Harm suppression is read from the mechanism array, not the flat type —
    // on a double-suppressed row encryption owns the flat fields.
    const harmSuppressed = suppressed.some((s) => !!harmMechanismOf(s));
    const greenBanner =
      riskSuppressed && !encryptionSuppressed && !harmSuppressed
        ? {
            headline: "No notification obligations apply under the risk assessment provided.",
            body: "The breach was assessed as not meeting the notification threshold; document the assessment and the reasoning.",
          }
        : encryptionSuppressed && !riskSuppressed && !harmSuppressed
        ? {
            headline: "No notification obligations apply under the facts provided.",
            body: "Based on the encryption fact reported, every obligation that would otherwise apply has been suppressed — either because the breach falls outside the statutory definition (U.S. states) or because individual notification is exempted by an unintelligibility-of-data provision (EU/UK GDPR Art. 34(3)(a)). Confirm encryption met each jurisdiction's standard before relying on this analysis.",
          }
        : harmSuppressed && !riskSuppressed && !encryptionSuppressed
        ? {
            headline: "No notification obligations apply under the harm determination recorded.",
            body: "Each suppressed obligation rests on counsel's documented determination, applied under that statute's own standard. Document the determination contemporaneously.",
          }
        : {
            headline: "No notification obligations apply under the facts provided.",
            body: "Every obligation that would otherwise apply has been suppressed — by the encryption fact reported, the risk assessment, and/or the harm determination recorded. See the bases below.",
          };

    // ── Jurisdiction-first grouping (presentation only; engine output unmoved) ──
    // The shared helper regroups the flat engine buckets into one block per
    // jurisdiction. `pending` is deliberately NOT grouped — it stays the
    // consolidated banner above, so a pending-only jurisdiction yields no block.
    // blockSections() returns each block's non-empty card-type groups in the
    // shared within-block order. Cross-block order comes from the shared
    // urgency comparator by default (identical to the memo's, by
    // construction); the A–Z toggle choice is the screen's only divergence.
    const groups = orderedResultGroups;

    // NY/MA still-computing explainer — non-null only when a harm
    // determination is recorded and NY/MA is selected; renders once, above
    // the first explainer-carrying block in the rendered order.
    const harmExplainer = harmNonGateDisplay(harmAssessment, jurisdictions);
    const harmExplainerBlockId = harmExplainer
      ? groups.find((b) => harmExplainer.jurisdictionIds.includes(b.jurisdictionId))?.jurisdictionId
      : null;

    // Card renderers — markup IDENTICAL to the former outcome-first sections,
    // only relocated into the per-jurisdiction blocks. No copy or style change.
    const renderActiveCard = (d, i, blockActive, extraStyle, anchorId) => {
      const timeRemaining = d.deadline ? d.deadline.getTime() - now.getTime() : null;
      // Notification record for this obligation. A recorded card stops being a
      // live matter: no countdown, no urgent/missed treatment — the stripe and
      // the "Notified {date}" line speak instead. Moss is reserved EXCLUSIVELY
      // for obligations with a computed due date where the notified calendar
      // date is at-or-before it; everything else — notified after due, or an
      // obligation with no computed due date ("without unreasonable delay" and
      // kin) — takes the neutral Mist-stripe / Ink-text treatment. Moss on a
      // no-deadline obligation would assert timeliness under a substantive
      // standard the tool does not evaluate (JDC ruling 2026-07-24). Dates
      // only — never a computed lateness delta, on screen or in the PDF
      // (durable decision).
      const recKey = notifKey(d);
      const rec = notifications[recKey];
      const notifiedDate = rec ? parseDateOnly(rec.notified_on) : null;
      // Local-midnight vs. due-instant comparison = calendar-date on-or-before.
      const recOnTime = rec ? !!(d.deadline && notifiedDate && notifiedDate.getTime() <= d.deadline.getTime()) : null;
      const isMissed = !rec && timeRemaining !== null && timeRemaining < 0;
      const isUrgent = !rec && timeRemaining !== null && timeRemaining > 0 && timeRemaining < 24 * 3600 * 1000;
      // Closed incidents render as record, not as live matter (JDC ruling
      // 2026-07-21): no ticking countdown, no overdue/urgency treatment
      // anywhere — every dated card shows a static Mist "Due {date}" in the
      // countdown slot instead (a future deadline on a discharged matter is
      // equally moot, so non-missed cards get the same treatment). Missed
      // cards keep their dark record styling but the Ember stripe renders
      // Mist; the urgent (Ember/cream) variant is neutralized entirely. Keys
      // off the live status state, so flipping the top-bar dropdown restyles
      // the cards immediately in both directions — no resubmit.
      const isClosed = status === "closed";
      // Dependent ("cascading") deadline — read straight from the engine's basis
      // string. We confirm the named parent actually fired in the same
      // jurisdiction (now within this block's active cards) before labeling.
      const depMatch = d.basis && d.basis.match(/—\s*(.+?)\s+from notification of\s+(.+?)\s*$/);
      const depParent = depMatch
        ? blockActive.find((p) => p !== d && p.jurisdiction === d.jurisdiction && p.authority === depMatch[2])
        : null;
      const depLabel = depParent
        ? `${depMatch[1]} after notifying residents`
        : null;
      return (
        <div
          key={i}
          id={anchorId}
          className={`deadline-card ${isMissed ? "missed" : isUrgent && !isClosed ? "urgent" : ""}`}
          style={{
            scrollMarginTop: `${NAV_CLEARANCE}px`,
            ...extraStyle,
            ...(isClosed && isMissed ? { borderLeftColor: "#9FAEC2" } : {}),
            // Recorded stripe: Moss only when a computed due date was met;
            // neutral Mist otherwise (notified after due, or no computed due
            // date). Live (unrecorded) stripes are unchanged.
            ...(rec ? { borderLeftColor: recOnTime ? "#5A6E4A" : "#9FAEC2" } : {}),
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "start" }}>
            <div>
              <div className="serif" style={{ fontSize: "26px", fontWeight: 400, lineHeight: 1.15, marginBottom: "12px", letterSpacing: "-0.01em" }}>
                Notify {d.authority}
              </div>
              <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>{nowrapCitations(d.basis)}</div>
              <div className="rule-text">{d.conditional}</div>
              {d.source_url && (
                <a
                  href={d.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500,
                    marginTop: "14px", color: "inherit", textDecoration: "none",
                    borderBottom: "1px solid currentColor", paddingBottom: "2px", opacity: 0.8,
                  }}
                >
                  View primary source ↗
                </a>
              )}
            </div>
            <div style={{ textAlign: "right", minWidth: "200px" }}>
              {rec ? (
                /* Recorded: the countdown/deadline slot shows the notified
                   date; the due date drops to the Mist secondary line. Applies
                   identically on closed incidents (same treatment, per spec). */
                <>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: recOnTime ? "#5A6E4A" : "#2C2418" }}>
                    Notified {fmtDateOnly(rec.notified_on)}
                  </div>
                  {d.deadline && (
                    <div style={{ fontSize: "11.5px", color: "#9FAEC2", marginTop: "5px" }}>
                      Due {fmtDueDate(d.deadline)}
                    </div>
                  )}
                </>
              ) : d.deadline ? (
                <>
                  {/* Missed cards carry no section-mark: the Ember "…overdue"
                      countdown is the whole overdue statement (ruled 2026-07-18).
                      Closed incidents suppress it on every card, mirroring that. */}
                  {!isMissed && !isClosed && (
                    <div className="section-mark" style={{ marginBottom: "6px" }}>
                      Time remaining
                    </div>
                  )}
                  {isClosed ? (
                    /* Static record date in the countdown slot — same mono/size/
                       placement, regular weight, Mist. The inline color overrides
                       the .deadline-card.missed .mono Bone rule. */
                    <div className="mono" style={{ fontSize: "26px", fontWeight: 400, letterSpacing: "-0.02em", color: "#9FAEC2" }}>
                      Due {fmtDueDate(d.deadline)}
                    </div>
                  ) : (
                    <>
                      {/* Overdue countdown renders in Ember; the inline color deliberately
                          overrides the .deadline-card.missed .mono Bone rule.
                          Magnitude-tiered precision (2026-08-23) — the exact
                          instant is the Due line beneath. */}
                      <Countdown
                        deadline={d.deadline}
                        now={now}
                        onCrossZero={refreshNow}
                        className="mono"
                        style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em", ...(isMissed ? { color: "#C76E3A" } : {}) }}
                      />
                      {/* Hidden when closed: it would repeat the static date above.
                          Promoted due line (JDC 2026-07-25): mono 13px/500 Ember at
                          full opacity on both the white live card and the Midnight
                          overdue card — the inline color overrides the .missed Bone
                          rule, same pattern as the countdown above. */}
                      <div className="mono" style={{ fontSize: "13px", fontWeight: 500, color: "#C76E3A", marginTop: "6px" }}>
                        Due {fmtDueDateTime(d.deadline)}
                      </div>
                    </>
                  )}
                  {depLabel && (
                    <div className="mono" style={{ fontSize: "11px", opacity: 0.6, marginTop: "4px", maxWidth: "200px", marginLeft: "auto" }}>
                      ({depLabel}; date assumes they're notified on their deadline)
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", border: "1px solid currentColor" }}>
                  <AlertTriangle size={14} />
                  <div className="section-mark">No fixed notification deadline</div>
                </div>
              )}
            </div>
          </div>
          {renderNotificationFooter(d, recKey, rec, isMissed && !isClosed)}
        </div>
      );
    };

    // Notification-record footer strip on every computed deadline card (never
    // on suppressed or counsel-review cards): a hairline, then a quiet
    // text-link → inline horizontal editor → recorded "Edit date" link.
    // `isDark` = the live-overdue card's Midnight surface, where the spec's
    // Midnight-on-white footer colors would vanish — those elements flip to
    // their light equivalents there (legibility adaptation only).
    const renderNotificationFooter = (d, recKey, rec, isDark) => {
      const editorOpen = notifEditing === recKey;
      const openEditor = () => {
        setNotifEditing(recKey);
        setNotifDraft(rec ? rec.notified_on : "");
      };
      const closeEditor = () => {
        setNotifEditing(null);
        setNotifDraft("");
      };
      const saveNotified = () => {
        if (!notifDraft) return;
        persistNotifications({
          ...notifications,
          [recKey]: { notified_on: notifDraft, recorded_at: new Date().toISOString() },
        });
        closeEditor();
      };
      const linkStyle = (color, borderColor) => ({
        background: "none", border: "none", padding: "0 0 1px", margin: 0,
        fontFamily: "'Inter', sans-serif", fontSize: "12.5px", color,
        borderBottom: `1px solid ${borderColor}`, cursor: "pointer",
      });
      return (
        <div
          style={{
            marginTop: "14px",
            borderTop: isDark ? "1px solid rgba(250,248,242,0.18)" : "1px solid rgba(27,42,63,0.10)",
            paddingTop: "10px",
          }}
        >
          {editorOpen ? (
            /* Horizontal inline editor — deliberately NOT the label-above
               convention: label sits to the LEFT of the date input. */
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span className="section-mark" style={isDark ? { color: "#FAF8F2", opacity: 0.85 } : undefined}>
                Notified on
              </span>
              <input
                type="date"
                value={notifDraft}
                onChange={(e) => setNotifDraft(e.target.value)}
                aria-label="Date notified"
                style={{
                  background: "#FAF8F2", border: "1px solid rgba(27,42,63,0.3)", borderRadius: 0,
                  padding: "7px 10px", fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#2C2418",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={saveNotified}
                disabled={!notifDraft}
                style={{
                  background: isDark ? "#FAF8F2" : "#1B2A3F", color: isDark ? "#1B2A3F" : "#FAF8F2",
                  border: "none", borderRadius: "8px", padding: "8px 16px",
                  fontFamily: "'Inter', sans-serif", fontSize: "12.5px", fontWeight: 500,
                  cursor: notifDraft ? "pointer" : "not-allowed", opacity: notifDraft ? 1 : 0.5,
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={closeEditor}
                style={{
                  background: "none", border: "none", padding: "4px 0", margin: 0,
                  fontFamily: "'Inter', sans-serif", fontSize: "12.5px", color: "#9FAEC2", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : rec ? (
            <button type="button" onClick={openEditor} style={linkStyle("#9FAEC2", "rgba(159,174,194,0.5)")}>
              Edit date
            </button>
          ) : (
            <button
              type="button"
              onClick={openEditor}
              style={
                isDark
                  ? linkStyle("#FAF8F2", "rgba(250,248,242,0.4)")
                  : linkStyle("#1B2A3F", "rgba(27,42,63,0.3)")
              }
            >
              Record notification date
            </button>
          )}
        </div>
      );
    };

    // Contingent-deadline card (intake phase 2; Mist differentiation, JDC
    // 2026-08-16). The existing deadline-card vocabulary — authority title,
    // mono citation, condition sentence body, primary-source link — but the
    // card is never confusable with a firm deadline: a Mist left accent bar
    // (both dated and null-clock), a "Contingent on resident count" badge on
    // dated cards, and the due line qualified "If required, due …" (matching
    // the memo). The qualifier line renders Mist while the conditional date
    // is not yet past and flips to Ember when it is; the countdown numerals
    // are Ink at ALL times (JDC contrast ruling (b), 2026-08-16: Mist
    // numerals at countdown size read too faint on white; JDC ruling
    // 2026-08-23: Ember never applies to a contingent counter, past or not —
    // the qualifier line alone carries the past-date signal). The SURFACE
    // stays white with the Mist bar; the urgent cream tint and the Midnight
    // overdue slab remain exclusive to firm cards. Color is reinforcement
    // only: the badge and the "If required" wording carry the contingency.
    // Deliberately NO record-notification footer: nothing has been
    // determined to notify against yet.
    const renderContingentCard = (c, key, extraStyle, anchorId) => {
      const due = c.conditional_deadline;
      const timeRemaining = due ? due.getTime() - now.getTime() : null;
      const isClosed = status === "closed";
      const isMissed = timeRemaining !== null && timeRemaining < 0;
      const qualifierColor = isMissed && !isClosed ? "#C76E3A" : "#9FAEC2";
      return (
        <div
          key={key}
          id={anchorId}
          className="deadline-card"
          style={{ scrollMarginTop: `${NAV_CLEARANCE}px`, ...extraStyle, borderLeftColor: "#9FAEC2" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "start" }}>
            <div>
              <div className="serif" style={{ fontSize: "20px", fontWeight: 400, lineHeight: 1.2, marginBottom: "10px", letterSpacing: "-0.01em" }}>
                {c.authority}
              </div>
              <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>{nowrapCitations(c.citation)}</div>
              <div className="rule-text">{c.condition}</div>
              {c.source_url && (
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500,
                    marginTop: "14px", color: "inherit", textDecoration: "none",
                    borderBottom: "1px solid currentColor", paddingBottom: "2px", opacity: 0.8,
                  }}
                >
                  View primary source ↗
                </a>
              )}
            </div>
            <div style={{ textAlign: "right", minWidth: "200px" }}>
              {due ? (
                <>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", border: "1px solid currentColor", marginBottom: "10px" }}>
                    <AlertTriangle size={14} />
                    <div className="section-mark">Contingent on resident count</div>
                  </div>
                  {!isMissed && !isClosed && (
                    <div className="section-mark" style={{ marginBottom: "6px" }}>Time remaining</div>
                  )}
                  {isClosed ? (
                    <div className="mono" style={{ fontSize: "26px", fontWeight: 400, letterSpacing: "-0.02em", color: "#9FAEC2" }}>
                      If required, due {fmtDueDate(due)}
                    </div>
                  ) : (
                    <>
                      {/* Contingent counters are Ink at all times — Ember never
                          applies to a contingent counter, past or not (JDC
                          ruling 2026-08-23, "middle form"); only the qualifier
                          line beneath takes Ember once the conditional date
                          has passed. */}
                      <Countdown
                        deadline={due}
                        now={now}
                        onCrossZero={refreshNow}
                        className="mono"
                        style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em", color: "#2C2418" }}
                      />
                      <div className="mono" style={{ fontSize: "13px", fontWeight: 500, color: qualifierColor, marginTop: "6px" }}>
                        If required, due {fmtDueDateTime(due)}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", border: "1px solid currentColor" }}>
                  <AlertTriangle size={14} />
                  <div className="section-mark">No fixed notification deadline</div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    // Service card (ratified mock, 2026-07-26): white card in the existing
    // deadline-card idiom (border, shadow, 4px Midnight stripe), serif title =
    // authority, mono citation subtitle, condition body. The right slot is a
    // "Service period" mark over the statutory duration — spelled-out units,
    // verbatim from service_duration_display — with a quiet Mist sub-line.
    // Deliberately: NO countdown, NO record-notification footer, NO Ember
    // anywhere, and no dark variant (services have no overdue concept). Closed
    // incidents render service cards unchanged.
    const renderServiceCard = (s, key) => (
      <div key={key} className="deadline-card" style={{ marginTop: "16px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "start" }}>
          <div>
            <div className="serif" style={{ fontSize: "18px", fontWeight: 400, lineHeight: 1.25, marginBottom: "10px", letterSpacing: "-0.01em" }}>
              {s.authority}
            </div>
            <div className="mono" style={{ fontSize: "12.5px", opacity: 0.7, marginBottom: "10px" }}>{nowrapCitations(s.citation)}</div>
            <div style={{ fontSize: "13px", lineHeight: 1.55, color: "#2C2418", opacity: 0.8 }}>{s.condition}</div>
          </div>
          <div style={{ textAlign: "right", minWidth: "200px" }}>
            <div className="section-mark" style={{ marginBottom: "6px" }}>Service period</div>
            <div className="mono" style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em", color: "#1B2A3F" }}>
              {s.service_duration_display}
            </div>
            <div style={{ fontSize: "11.5px", color: "#9FAEC2", marginTop: "5px" }}>minimum · runs with notice</div>
          </div>
        </div>
      </div>
    );

    // Advisory card (ratified mock, 2026-07-26): white card, 1px dashed
    // border, 4px Parchment stripe, alert-triangle glyph (same icon set as the
    // "No fixed notification deadline" badge). Auto-advisories (reason
    // "ssn_unconfirmed") carry the quiet "Edit data categories" text link —
    // screen-only, never printed; declared advisories are guidance with
    // nothing to change, so no link. Title/body composition is shared with the
    // memo via advisoryDisplay in results-grouping.js.
    const renderAdvisoryCard = (a, key) => (
      <div
        key={key}
        style={{
          background: "#fff",
          border: "1px dashed rgba(27,42,63,0.45)",
          borderLeft: "4px solid #E8DDC4",
          borderRadius: "0 12px 12px 0",
          padding: "20px 24px",
          marginTop: "16px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <AlertTriangle size={16} style={{ color: "#1B2A3F", opacity: 0.75, flexShrink: 0, marginTop: "3px" }} />
          <div>
            <div className="serif" style={{ fontSize: "16px", fontWeight: 400, lineHeight: 1.3, letterSpacing: "-0.005em" }}>
              {nowrapCitations(a.title)}
            </div>
            <div style={{ fontSize: "13px", lineHeight: 1.6, opacity: 0.8, marginTop: "8px" }}>{a.body}</div>
            {a.kind === "auto" && (
              <button
                type="button"
                onClick={handleEditDataCategories}
                style={{
                  background: "none", border: "none", padding: "0 0 1px", margin: "12px 0 0",
                  fontFamily: "'Inter', sans-serif", fontSize: "12.5px", color: "#1B2A3F",
                  borderBottom: "1px solid rgba(27,42,63,0.3)", cursor: "pointer",
                }}
              >
                Edit data categories
              </button>
            )}
          </div>
        </div>
      </div>
    );

    const renderSuppressedCard = (s, i) => (
      <div key={i} style={{ background: "#fff", borderLeft: "4px solid #5A6E4A", padding: "20px 24px", borderRadius: "0 12px 12px 0" }}>
        <div className="serif" style={{ fontSize: "20px", fontWeight: 400, lineHeight: 1.2, marginBottom: "10px", letterSpacing: "-0.01em" }}>
          {s.authority}
        </div>
        <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
          {s.suppression_type === "risk_assessment" ? (
            `${s.suppression_citation} — notification threshold not met`
          ) : (
            <>{s.original_citation} → {s.suppression_citation} ({s.suppression_type === "breach_definition" ? "no breach as defined" : "notification exempted by unintelligibility"})</>
          )}
        </div>
        <div className="rule-text">{s.suppression_description}</div>
        {s.source_url && (
          <a
            href={s.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500,
              marginTop: "14px", color: "inherit", textDecoration: "none",
              borderBottom: "1px solid currentColor", paddingBottom: "2px", opacity: 0.8,
            }}
          >
            View primary source ↗
          </a>
        )}
      </div>
    );

    // Harm-suppressed card (harm-gate UI commit, 2026-08-02): the existing
    // suppressed-card idiom (white, Moss stripe) with the verbatim statutory
    // standard as the body — clamped to three lines — and the harm citation
    // in a right slot. VA rows (mechanism character "duty_element") are
    // introduced with the negated-duty-element framing instead of the
    // exemption framing. The harm mechanism is read from suppression_reasons
    // (never by index — encryption owns the flat fields on double-suppressed
    // rows, whose encryption line renders above the standard).
    const renderHarmSuppressedCard = (s, i) => {
      const harm = harmMechanismOf(s);
      if (!harm) return renderSuppressedCard(s, i);
      const isDuty = harm.character === "duty_element";
      return (
        <div key={i} style={{ background: "#fff", borderLeft: "4px solid #5A6E4A", padding: "20px 24px", borderRadius: "0 12px 12px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "start" }}>
            <div>
              <div className="serif" style={{ fontSize: "20px", fontWeight: 400, lineHeight: 1.2, marginBottom: "10px", letterSpacing: "-0.01em" }}>
                {s.authority}
              </div>
              <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
                {s.suppression_type === "harm" ? (
                  s.original_citation
                ) : (
                  /* Double-suppressed: the flat fields carry the encryption
                     mechanism — keep its existing line above the standard. */
                  <>{s.original_citation} → {s.suppression_citation} ({s.suppression_type === "breach_definition" ? "no breach as defined" : "notification exempted by unintelligibility"})</>
                )}
              </div>
              <div
                className="rule-text"
                style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {isDuty ? "Duty element not established: " : "Statutory exemption applied: "}
                “{harm.standard}”
              </div>
              {s.source_url && (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500,
                    marginTop: "14px", color: "inherit", textDecoration: "none",
                    borderBottom: "1px solid currentColor", paddingBottom: "2px", opacity: 0.8,
                  }}
                >
                  View primary source ↗
                </a>
              )}
            </div>
            <div style={{ textAlign: "right", minWidth: "160px" }}>
              <div className="mono" style={{ fontSize: "12px", opacity: 0.7 }}>{harm.citation}</div>
            </div>
          </div>
        </div>
      );
    };

    const renderReviewCard = (r, i, extraStyle, anchorId) => (
      <div key={i} id={anchorId} style={{ background: "#fff", borderLeft: "4px solid #9FAEC2", padding: "20px 24px", borderRadius: "0 12px 12px 0", boxShadow: "0 2px 8px rgba(27,42,63,0.10)", scrollMarginTop: `${NAV_CLEARANCE}px`, ...extraStyle }}>
        <div className="serif" style={{ fontSize: "20px", fontWeight: 400, lineHeight: 1.2, marginBottom: "10px", letterSpacing: "-0.01em" }}>
          {r.authority}
        </div>
        {r.review_citation && (
          <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
{nowrapCitations(`${r.original_citation ? `${r.original_citation} → ` : ""}${r.review_citation}`)}
          </div>
        )}
        <div className="rule-text">{r.review_reason}</div>
        {r.source_url && (
          <a
            href={r.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500,
              marginTop: "14px", color: "inherit", textDecoration: "none",
              borderBottom: "1px solid currentColor", paddingBottom: "2px", opacity: 0.8,
            }}
          >
            View primary source ↗
          </a>
        )}
      </div>
    );

    // Counsel notes now render as one continuous parchment SECTION (no per-note
    // stripe-cards): a single panel whose notes are divided by a hairline rule.
    // The group eyebrow (caveat/sectoral) lives inside the panel at the top of
    // the first note; parallels carry a per-note lead instead. lapEdge adds 8px
    // clearance on the edge a card laps (16 lap − 8) so the text margin there
    // matches the panel's other edges. Cards overhang the panel ~10px each side,
    // so the panel is inset 10px left/right.
    const renderParchmentPanel = ({ key, notes, eyebrow, perNoteLead, lapEdge, marginTop, zIndex = 0, collapsible = false }) => (
      <div
        key={key}
        style={{
          background: "#EBE2C9",
          border: "1px solid rgba(176,160,122,0.45)",
          borderRadius: "9px",
          overflow: "hidden",
          marginLeft: "10px",
          marginRight: "10px",
          marginTop: typeof marginTop === "number" ? `${marginTop}px` : marginTop,
          paddingTop: lapEdge === "top" ? "8px" : undefined,
          // Collapsible (caveat) panels: with note bodies hidden, the last
          // title row needs the same visible space below it as the 12px above
          // the eyebrow (the notes' own padding token). The following card
          // laps 16px over the panel bottom, so symmetric visible space means
          // padding equal to the full lap: 12 (note pad) + 16 − 16 (lap) = 12.
          // Non-collapsible lapped panels keep the original 8px clearance.
          paddingBottom: lapEdge === "bottom" ? (collapsible ? "16px" : "8px") : undefined,
          position: "relative",
          zIndex,
        }}
      >
        {notes.map(({ jurShort, note }, i) => {
          // Collapsible (caveat placement only): the whole title row is a
          // disclosure <button> with a brand-derived caret; body + citation
          // render only when expanded. Non-collapsible panels are unchanged.
          const isExpanded = !collapsible || expandedCaveats.has(note.id);
          const titleText = (
            <span className="serif" style={{ fontSize: "17px", fontWeight: 400, lineHeight: 1.3, letterSpacing: "-0.005em", color: "#2C2418" }}>
              {nowrapCitations(note.title)}
            </span>
          );
          return (
            <div
              key={note.id}
              style={{ padding: "12px 17px", borderTop: i > 0 ? "1px solid rgba(176,160,122,0.5)" : undefined }}
            >
              {(perNoteLead || (i === 0 && eyebrow)) && (
                <div
                  className="mono"
                  style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#9b8e6c", marginBottom: "8px" }}
                >
                  {perNoteLead || eyebrow}
                </div>
              )}
              {collapsible ? (
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleCaveat(note.id)}
                  style={{
                    display: "flex", alignItems: "baseline", gap: "10px", width: "100%",
                    background: "none", border: "none", padding: 0, margin: 0,
                    textAlign: "left", cursor: "pointer", font: "inherit",
                    marginBottom: isExpanded ? "8px" : 0,
                  }}
                >
                  <ArkidelCaret
                    style={{
                      width: "13px", height: "12px", flexShrink: 0, color: "#C76E3A",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                    }}
                  />
                  {titleText}
                </button>
              ) : (
                <div style={{ marginBottom: "8px" }}>{titleText}</div>
              )}
              {isExpanded && (
                <>
                  <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 8px", color: "#2C2418" }}>{note.content}</p>
                  {note.citation && (
                    <div className="mono" style={{ fontSize: "11px", opacity: 0.7, color: "#2C2418" }}>
                      {note.citation}
                      {note.source_url && (
                        <>
                          {" — "}
                          <a href={note.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2C2418", textDecoration: "underline" }}>
                            primary source
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );

    // Per-jurisdiction block body, in placement order:
    //   caveat panel (above) → obligation cards (each with its parallel panel
    //   tucked under) → suppressed cards → sectoral panel (foot).
    // The first card laps UP 16px over the caveat; parallel/sectoral panels tuck
    // UP 16px under the card above. Cards carry z-index above the parchment.
    const PARALLEL_LEAD = "Parallel AG obligation — may also apply";
    const renderBlock = (block) => {
      const out = [];
      const hasCaveat = block.caveatNotes.length > 0;
      if (hasCaveat) {
        out.push(renderParchmentPanel({ key: "caveat", notes: block.caveatNotes, eyebrow: "Pre-Notification Considerations", lapEdge: "bottom", marginTop: 16, collapsible: true }));
      }
      // Within-block order (intake phase 2): active deadline cards →
      // Contingent Deadlines → counsel review → suppressed → notes. The
      // obligations array is active-first then review, so the contingent group
      // is emitted at the boundary — before the first review card, or after
      // the active cards when the block has none.
      const firstReviewIdx = block.obligations.findIndex((ob) => ob.role === "review");
      const contingentAt = firstReviewIdx === -1 ? block.obligations.length : firstReviewIdx;
      const emitContingentGroup = () => {
        if (!block.contingentCards || block.contingentCards.length === 0) return;
        out.push(
          <div key="cont-label" className="section-mark" style={{ margin: "24px 0 10px" }}>
            {CONTINGENT_LABEL}
          </div>
        );
        out.push(
          <p key="cont-explainer" className="rule-text" style={{ margin: "0 4px 4px", maxWidth: "760px" }}>
            {CONTINGENT_EXPLAINER}
          </p>
        );
        block.contingentCards.forEach((c, i) =>
          out.push(
            renderContingentCard(
              c,
              `cont-${i}`,
              { marginTop: "16px", position: "relative", zIndex: 1 },
              obligationAnchorId(block.jurisdictionId, c.authority)
            )
          )
        );
      };
      block.obligations.forEach((ob, idx) => {
        if (idx === contingentAt) emitContingentGroup();
        const first = idx === 0;
        const cardStyle = { marginTop: first ? (hasCaveat ? "-16px" : "16px") : "16px", position: "relative", zIndex: 1 };
        const anchorId = obligationAnchorId(block.jurisdictionId, ob.card.authority);
        out.push(
          ob.role === "active"
            ? renderActiveCard(ob.card, `ob-${idx}`, block.activeCards, cardStyle, anchorId)
            : renderReviewCard(ob.card, `ob-${idx}`, cardStyle, anchorId)
        );
        ob.parallelNotes.forEach((pn, j) =>
          out.push(renderParchmentPanel({ key: `par-${idx}-${j}`, notes: [pn], perNoteLead: PARALLEL_LEAD, lapEdge: "top", marginTop: -16 }))
        );
      });
      if (contingentAt >= block.obligations.length) emitContingentGroup();
      // Service cards after the jurisdiction's deadline cards, then advisory
      // cards after any service cards (ratified placement).
      block.serviceCards.forEach((s, i) => out.push(renderServiceCard(s, `svc-${i}`)));
      block.advisoryCards.forEach((a, i) => out.push(renderAdvisoryCard(a, `adv-${i}`)));
      // Suppressed cards split by mechanism: harm-suppressed rows (any harm
      // reason in suppression_reasons — including double-suppressed rows,
      // where encryption owns the flat fields) get their own group with the
      // ratified label and admonition footer; everything else keeps the
      // existing treatment.
      const harmCards = block.suppressedCards.filter((s) => !!harmMechanismOf(s));
      const plainCards = block.suppressedCards.filter((s) => !harmMechanismOf(s));
      // The first suppressed group label carries the queue summary-line's
      // jump anchor (one per block; plain group first when both render).
      const suppressedAnchor = `suppressed-group-${block.jurisdictionId}`;
      if (plainCards.length > 0) {
        out.push(<div key="sup-label" id={suppressedAnchor} className="section-mark" style={{ margin: "24px 0 12px", scrollMarginTop: `${NAV_CLEARANCE}px` }}>Notification likely not required</div>);
        plainCards.forEach((s, i) =>
          out.push(<div key={`sup-${i}`} style={{ marginTop: i === 0 ? 0 : "12px" }}>{renderSuppressedCard(s, i)}</div>)
        );
      }
      if (harmCards.length > 0) {
        out.push(<div key="hsup-label" id={plainCards.length === 0 ? suppressedAnchor : undefined} className="section-mark" style={{ margin: "24px 0 12px", scrollMarginTop: `${NAV_CLEARANCE}px` }}>Suppressed — harm determination</div>);
        harmCards.forEach((s, i) =>
          out.push(<div key={`hsup-${i}`} style={{ marginTop: i === 0 ? 0 : "12px" }}>{renderHarmSuppressedCard(s, i)}</div>)
        );
        out.push(
          <div key="hsup-foot" className="rule-text" style={{ margin: "12px 4px 0" }}>
            Document the determination contemporaneously. Suppression rests on counsel's attestation, applied under each statute's own standard.
          </div>
        );
      }
      if (block.sectoralNotes.length > 0) {
        out.push(renderParchmentPanel({ key: "sectoral", notes: block.sectoralNotes, eyebrow: "Other Applicable Requirements", lapEdge: null, marginTop: 24 }));
      }
      block.footParallelNotes.forEach((pn, j) =>
        out.push(renderParchmentPanel({ key: `fpar-${j}`, notes: [pn], perNoteLead: PARALLEL_LEAD, lapEdge: null, marginTop: j === 0 && block.sectoralNotes.length === 0 ? 24 : 12 }))
      );
      return out;
    };

    // ── Collapsible block chrome (>3 selected jurisdictions only) ──
    // Collapsed summary row: jurisdiction name + statute sub-line (existing
    // header style), the next relevant date (firm first, else the qualified
    // contingent form), and count chips in the app's chip anatomy (mono caps,
    // 6px radius, solid token fills — the incidents-list StatusChip idiom).
    const fmtDateShort = (d) => fmtDueDate(d);
    const minDateOf = (arr, get) => arr.map(get).sort((a, b) => a - b)[0];
    const blockNextDateLine = (block) => {
      const isClosed = status === "closed";
      const dated = block.activeCards.filter((c) => c.deadline && typeof c.deadline.getTime === "function");
      const unrecorded = dated.filter((c) => !notifications[notifKey(c)]);
      if (unrecorded.length > 0) {
        const min = minDateOf(unrecorded, (c) => c.deadline);
        const overdue = !isClosed && min.getTime() < now.getTime();
        return (
          <span className="mono" style={{ fontSize: "13px", fontWeight: overdue ? 600 : 500, color: overdue ? "#C76E3A" : isClosed ? "#9FAEC2" : "#2C2418" }}>
            Due {fmtDateShort(min)}
          </span>
        );
      }
      if (dated.length > 0) {
        // Every dated obligation is recorded — the date is record, not a live
        // matter, so it takes the neutral Mist treatment (never Ember).
        return (
          <span className="mono" style={{ fontSize: "13px", color: "#9FAEC2" }}>
            Due {fmtDateShort(minDateOf(dated, (c) => c.deadline))}
          </span>
        );
      }
      const contDated = block.contingentCards.filter((c) => c.conditional_deadline && typeof c.conditional_deadline.getTime === "function");
      if (contDated.length > 0) {
        return (
          <span className="mono" style={{ fontSize: "13px", color: "#9FAEC2" }}>
            If required, due {fmtDateShort(minDateOf(contDated, (c) => c.conditional_deadline))}
          </span>
        );
      }
      return null;
    };
    const chipStyle = (bg, fg) => ({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: "6px", whiteSpace: "nowrap",
      background: bg, color: fg,
    });
    const blockChips = (block) => {
      const chips = [];
      if (block.activeCards.length > 0) chips.push({ text: `${block.activeCards.length} due`, bg: "#1B2A3F", fg: "#FAF8F2" });
      if (block.contingentCards.length > 0) chips.push({ text: `${block.contingentCards.length} contingent`, bg: "#9FAEC2", fg: "#1B2A3F" });
      if (block.counselReviewCards.length > 0) chips.push({ text: `${block.counselReviewCards.length} counsel review`, bg: "#E8DDC4", fg: "#2C2418" });
      if (block.suppressedCards.length > 0) chips.push({ text: `${block.suppressedCards.length} suppressed`, bg: "#5A6E4A", fg: "#FAF8F2" });
      if (chips.length === 0) return null;
      return (
        <span style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {chips.map((c) => (
            <span key={c.text} style={chipStyle(c.bg, c.fg)}>{c.text}</span>
          ))}
        </span>
      );
    };

    return (
    <>
      {hasPending && (
        <div style={{ marginBottom: "16px", padding: "24px 28px", background: "#FBF5EE", border: "1px solid rgba(199,110,58,0.4)", borderLeft: "4px solid #C76E3A", borderRadius: "0 12px 12px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", color: "#C76E3A" }}>
            <AlertTriangle size={16} />
            <div className="section-mark" style={{ color: "#C76E3A", opacity: 1 }}>Action needed</div>
          </div>
          <div className="serif" style={{ fontSize: "24px", fontWeight: 400, lineHeight: 1.2, color: "#1B2A3F", marginBottom: "12px" }}>
            Risk assessment required
          </div>
          <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 14px", color: "#2C2418" }}>
            The EU/UK notification obligations can't be determined until you assess the risk to data subjects.
          </p>
          <div className="mono" style={{ fontSize: "12px", color: "#2C2418", opacity: 0.75, marginBottom: "18px" }}>
            {pendingJurisdictions.join(" · ")}
          </div>
          <button className="btn-primary" onClick={handleCompleteRiskAssessment}>
            Complete risk assessment <ArrowRight size={14} />
          </button>
        </div>
      )}

      {!hasPending && review.length === 0 && deadlines.length === 0 && contingent.length === 0 && suppressed.length > 0 && (
        <div style={{ marginBottom: "16px", padding: "24px 28px", background: "#5A6E4A", color: "#FAF8F2", borderRadius: "12px" }}>
          <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>Result</div>
          <div className="serif" style={{ fontSize: "24px", fontWeight: 400, lineHeight: 1.2 }}>
            {greenBanner.headline}
          </div>
          <p style={{ fontSize: "14px", marginTop: "12px", opacity: 0.9, lineHeight: 1.6 }}>
            {greenBanner.body}
          </p>
        </div>
      )}

      {!hasPending && review.length === 0 && deadlines.length === 0 && contingent.length === 0 && suppressed.length === 0 && (
        <div style={{ marginBottom: "16px", padding: "24px 28px", background: "#1B2A3F", color: "#FAF8F2", borderRadius: "12px" }}>
          <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>No deadlines computed</div>
          <p style={{ fontSize: "14px", marginTop: "8px", opacity: 0.9, lineHeight: 1.6 }}>
            No notification obligations apply under the inputs provided. Verify your jurisdiction selections and resident counts.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "44px", marginTop: "16px" }}>
        {groups.map((block) => {
          const expanded = blockExpanded(block);
          return (
          <div key={block.jurisdictionId}>
            {/* NY/MA still-computing explainer (dashed advisory idiom):
                renders ONCE, directly above the first explainer-carrying
                jurisdiction block, only when a harm determination is
                recorded. Composition is shared with the memo via
                harmNonGateDisplay. */}
            {harmExplainer && block.jurisdictionId === harmExplainerBlockId && (
              <div
                style={{
                  background: "#fff",
                  border: "1px dashed rgba(27,42,63,0.45)",
                  borderLeft: "4px solid #E8DDC4",
                  borderRadius: "0 12px 12px 0",
                  padding: "20px 24px",
                  marginBottom: "20px",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <AlertTriangle size={16} style={{ color: "#1B2A3F", opacity: 0.75, flexShrink: 0, marginTop: "3px" }} />
                  <div>
                    <div className="serif" style={{ fontSize: "16px", fontWeight: 400, lineHeight: 1.3, letterSpacing: "-0.005em" }}>
                      {harmExplainer.lead}
                    </div>
                    <div style={{ fontSize: "13px", lineHeight: 1.6, opacity: 0.8, marginTop: "8px" }}>{harmExplainer.body}</div>
                  </div>
                </div>
              </div>
            )}
            {collapsibleBlocks ? (
              /* >3 selected jurisdictions: the block header is a disclosure
                 button. Collapsed, its right side carries the summary (next
                 relevant date + count chips); expanded, the full block follows
                 unchanged. Blocks holding a firm-overdue obligation default
                 expanded (see blockExpanded). */
              <button
                type="button"
                aria-expanded={expanded}
                data-block-header={block.name}
                onClick={() => setBlockExpanded(block.jurisdictionId, !expanded)}
                style={{
                  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "24px",
                  width: "100%", background: "none", border: "none", borderBottom: "1px solid rgba(27,42,63,0.12)",
                  padding: "0 0 10px", margin: "0 0 4px", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "baseline", gap: "12px", minWidth: 0 }}>
                  <ArkidelCaret
                    style={{ width: "13px", height: "12px", flexShrink: 0, color: "#1B2A3F", transform: expanded ? "rotate(90deg)" : "none" }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span className="serif" style={{ display: "block", fontSize: "22px", fontWeight: 400, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{block.name}</span>
                    <span className="mono" style={{ display: "block", fontSize: "12px", opacity: 0.6, marginTop: "4px" }}>{nowrapCitations(block.statuteSubtitle)}</span>
                  </span>
                </span>
                {!expanded && (
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0, paddingTop: "4px" }}>
                    {blockNextDateLine(block)}
                    {blockChips(block)}
                  </span>
                )}
              </button>
            ) : (
              /* ≤3 selected jurisdictions: exactly the pre-scale header — no
                 disclosure affordance, nothing collapses. */
              <div style={{ borderBottom: "1px solid rgba(27,42,63,0.12)", paddingBottom: "10px", marginBottom: "4px" }}>
                <div className="serif" style={{ fontSize: "22px", fontWeight: 400, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{block.name}</div>
                <div className="mono" style={{ fontSize: "12px", opacity: 0.6, marginTop: "4px" }}>{nowrapCitations(block.statuteSubtitle)}</div>
              </div>
            )}
            {expanded && renderBlock(block)}
          </div>
          );
        })}
      </div>
    </>
    );
  };

  // ── Incident log (results view; below the deadline cards). Entries are
  //    record-keeping only — chronological, each toggleable in/out of the memo
  //    (toggling persists immediately; exclusion carries no visual penalty
  //    beyond the unchecked box). Orphaned notification records — recorded
  //    against an obligation a facts edit no longer computes — are retained
  //    (never deleted on recompute) and rendered read-only at the end. ──
  const renderIncidentLog = () => {
    const currentKeys = new Set(deadlines.map((d) => notifKey(d)));
    const orphans = Object.entries(notifications)
      .filter(([key]) => !currentKeys.has(key))
      .map(([key, rec]) => {
        const sep = key.indexOf(":");
        const jurId = sep >= 0 ? key.slice(0, sep) : key;
        const authority = sep >= 0 ? key.slice(sep + 1) : "";
        const jur = JURISDICTIONS.find((j) => j.id === jurId);
        return { key, rec, jurisdiction: jur ? jur.short : jurId, authority };
      });
    const sortedEntries = [...incidentLog].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const draftType = LOG_TYPE_BY_ID[logDraft.type];
    const isComm = draftType?.kind === "communication";
    const resolvedParty = !isComm
      ? null
      : logDraft.party === OTHER_PARTY
      ? logDraft.partyOther.trim()
      : logDraft.party;
    const canAdd = !!(logDraft.date && logDraft.type && (!isComm || resolvedParty));
    // Party options: the authorities from the currently computed deadlines,
    // plus "Other (enter name)" which swaps the select for a text input.
    const authorities = [...new Set(deadlines.map((d) => d.authority))];

    const addEntry = () => {
      if (!canAdd) return;
      const entry = {
        id: crypto.randomUUID(),
        date: logDraft.date,
        type: logDraft.type,
        party: isComm ? resolvedParty : null,
        note: logDraft.note.trim(),
        include_in_memo: true,
        recorded_at: new Date().toISOString(),
      };
      persistIncidentLog([...incidentLog, entry]);
      setLogDraft(EMPTY_LOG_DRAFT);
    };
    const toggleInMemo = (id) =>
      persistIncidentLog(incidentLog.map((e) => (e.id === id ? { ...e, include_in_memo: !e.include_in_memo } : e)));

    // Add-entry field chrome: white, hairline, square corners, 13px Inter.
    const fieldChrome = {
      background: "#fff", border: "1px solid rgba(27,42,63,0.3)", borderRadius: 0,
      padding: "9px 11px", fontFamily: "'Inter', sans-serif", fontSize: "13px",
      color: "#2C2418", outline: "none",
    };
    const rowBorder = "1px solid rgba(27,42,63,0.10)";

    const renderEntryRow = (e) => {
      const t = LOG_TYPE_BY_ID[e.type];
      const typeLabel = t ? t.label : String(e.type || "");
      const lead =
        t?.kind === "communication" ? (
          <>
            <span style={{ color: "#1B2A3F", fontWeight: 500 }}>{e.party}</span>
            <span> · {typeLabel}</span>
          </>
        ) : (
          <span style={{ color: "#1B2A3F", fontWeight: 500 }}>{typeLabel}</span>
        );
      return (
        <div key={e.id} style={{ display: "flex", gap: "16px", alignItems: "flex-start", padding: "14px 20px", borderBottom: rowBorder }}>
          <div className="mono" style={{ width: "96px", flexShrink: 0, fontSize: "12px", color: "#1B2A3F", paddingTop: "2px" }}>
            {fmtDateOnly(e.date)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13.5px", lineHeight: 1.5 }}>{lead}</div>
            {e.note && (
              <div style={{ fontSize: "13px", color: "#2C2418", opacity: 0.8, lineHeight: 1.55, marginTop: "2px" }}>
                {e.note}
              </div>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, cursor: "pointer", paddingTop: "2px" }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", color: "#9FAEC2" }}>In memo</span>
            <input
              type="checkbox"
              checked={!!e.include_in_memo}
              onChange={() => toggleInMemo(e.id)}
              style={{ width: "14px", height: "14px", accentColor: "#1B2A3F", margin: 0 }}
            />
          </label>
        </div>
      );
    };

    return (
      <div style={{ marginTop: "44px" }}>
        <div className="section-mark" style={{ marginBottom: "14px" }}>Incident log</div>
        <div style={{ background: "#fff", border: "1px solid rgba(27,42,63,0.18)", borderRadius: "12px", overflow: "hidden" }}>
          {sortedEntries.map(renderEntryRow)}
          {orphans.map((o) => (
            <div key={o.key} style={{ padding: "14px 20px", borderBottom: rowBorder, fontSize: "13px", lineHeight: 1.55, color: "#2C2418", opacity: 0.7 }}>
              Notified {fmtDateOnly(o.rec.notified_on)} — {o.jurisdiction} / {o.authority} (obligation no longer computed)
            </div>
          ))}
          {/* Add-entry form — Bone strip, fields stacked vertically, labels
              above in the intake form's own label idiom (labelRow). */}
          <div style={{ background: "#FAF8F2", padding: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                {labelRow("Date")}
                <input
                  type="date"
                  value={logDraft.date}
                  onChange={(e) => setLogDraft((prev) => ({ ...prev, date: e.target.value }))}
                  style={{ ...fieldChrome, width: "200px", maxWidth: "100%" }}
                />
              </div>
              <div>
                {labelRow("Type")}
                <select
                  value={logDraft.type}
                  onChange={(e) => setLogDraft((prev) => ({ ...prev, type: e.target.value, party: "", partyOther: "" }))}
                  style={{ ...fieldChrome, width: "320px", maxWidth: "100%" }}
                >
                  <option value="">Select…</option>
                  <optgroup label="Communications">
                    {LOG_TYPES.filter((t) => t.kind === "communication").map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Updates">
                    {LOG_TYPES.filter((t) => t.kind === "update").map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              {isComm && (
                <div>
                  {labelRow("Party")}
                  {logDraft.party === OTHER_PARTY ? (
                    <input
                      value={logDraft.partyOther}
                      onChange={(e) => setLogDraft((prev) => ({ ...prev, partyOther: e.target.value }))}
                      placeholder="Party name"
                      style={{ ...fieldChrome, width: "320px", maxWidth: "100%" }}
                    />
                  ) : (
                    <select
                      value={logDraft.party}
                      onChange={(e) => setLogDraft((prev) => ({ ...prev, party: e.target.value }))}
                      style={{ ...fieldChrome, width: "320px", maxWidth: "100%" }}
                    >
                      <option value="">Select…</option>
                      {authorities.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                      <option value={OTHER_PARTY}>Other (enter name)</option>
                    </select>
                  )}
                </div>
              )}
              <div>
                {labelRow("Note")}
                <textarea
                  rows={2}
                  value={logDraft.note}
                  onChange={(e) => setLogDraft((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g. Response submitted by counsel"
                  style={{ ...fieldChrome, width: "100%", maxWidth: "560px", resize: "vertical", lineHeight: 1.5, display: "block" }}
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={addEntry}
                  disabled={!canAdd}
                  style={{
                    background: "transparent", border: "1px solid #1B2A3F", borderRadius: 0,
                    padding: "9px 18px", fontFamily: "'Inter', sans-serif", fontSize: "13px",
                    fontWeight: 500, color: "#1B2A3F",
                    cursor: canAdd ? "pointer" : "not-allowed", opacity: canAdd ? 1 : 0.45,
                  }}
                >
                  Add entry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Cross-check warning (field-level + re-shown on review) ──
  const crossCheckBanner = () =>
    crossCheckMissing.length > 0 ? (
      <div
        role="alert"
        style={{
          margin: "4px 0 24px",
          padding: "16px 20px",
          background: "#FBF5EE",
          borderLeft: "4px solid #C76E3A",
          borderRadius: "0 12px 12px 0",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
        }}
      >
        <AlertTriangle size={18} style={{ color: "#C76E3A", flexShrink: 0, marginTop: "2px" }} />
        <div style={{ fontSize: "14px", lineHeight: 1.6, color: "#2C2418" }}>
          You selected data elements that imply Q1 categories not currently checked:{" "}
          <strong>{crossCheckMissing.map((t) => TAG_TO_Q1_LABEL[t]).join(", ")}</strong>. If these were involved, add them in Q1 (Data affected) — they affect the deadline calculation.
        </div>
      </div>
    ) : null;

  // ── Save cluster (button + quiet "Saved · time" / visible error). Lives in
  //    the form's top control row — right-aligned, above the fold — in both
  //    full mode (sharing the Expand all / Collapse all row) and quick mode.
  //    When a computed results state exists to return to, a ghost Back-to-
  //    results sits beside Save: it discards unsaved in-memory edits (revert
  //    to last-saved payload) and returns to the results view — no save, no
  //    status transition (JDC ruling 2026-08-02). ──
  const saveControls = () => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {saveError ? (
        <span role="alert" style={{ fontSize: "13px", color: "#C76E3A", lineHeight: 1.4 }}>
          {saveError}
        </span>
      ) : savedAt ? (
        <span style={{ fontSize: "13px", color: "#1B2A3F", opacity: 0.55, whiteSpace: "nowrap" }}>
          Saved · {savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      ) : null}
      {computedSignature !== null && (
        <button
          type="button"
          className="btn-ghost"
          onClick={handleBackToResults}
          disabled={saving}
          style={{ padding: "8px 16px", fontSize: "13px" }}
        >
          <ArrowLeft size={13} /> Back to results
        </button>
      )}
      <button
        type="button"
        className="btn-ghost"
        onClick={handleSave}
        disabled={saving}
        style={{ padding: "8px 16px", fontSize: "13px" }}
      >
        <Save size={13} /> {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Form (full or quick) — rendered in the main column.
  // ─────────────────────────────────────────────────────────────────────────
  const renderForm = () => (
    <>
      {quickMode ? (
        <section style={{ marginBottom: "40px" }}>
          {/* Quick mode has no Expand/Collapse row, so Save gets its own
              right-aligned row in the same top position. */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "16px" }}>
            {saveControls()}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <h2 className="serif" style={{ fontSize: "24px", fontWeight: 400, margin: 0, color: "#1B2A3F", letterSpacing: "-0.01em" }}>
              Notification Inputs
            </h2>
            <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
          </div>
          {renderAwarenessField()}
          {renderJurisdictionsField()}
          {renderQ1()}
          {crossCheckBanner()}
          {renderEncryption()}
          {(jurisdictions.eu || jurisdictions.uk) && (
            <div id="form-risk" style={{ scrollMarginTop: `${NAV_CLEARANCE}px` }}>
              {renderRiskAssessment()}
              {renderGdprUnintelligibility()}
              {isNarrow && renderNote("risk")}
            </div>
          )}
          {/* Harm assessment — after the EU/UK risk question, only when a
              selected jurisdiction carries a harmGate. */}
          {anyHarmGated && (
            <div id="form-harm" style={{ scrollMarginTop: `${NAV_CLEARANCE}px` }}>
              {renderHarmAssessment()}
              {isNarrow && renderHarmStandardsNote()}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Quiet, understated expand/collapse-all control above the section
              list, sharing its row with Save (rightmost). Always visible (the
              left index only renders on wide screens), so it's the reliable
              global control on every width. */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
            <button type="button" className="btn-link" onClick={expandAll}>Expand all</button>
            <span style={{ opacity: 0.3, color: "#1B2A3F", userSelect: "none" }}>·</span>
            <button type="button" className="btn-link" onClick={collapseAll}>Collapse all</button>
            <span style={{ width: "10px" }} aria-hidden="true" />
            {saveControls()}
          </div>

          {/* 1. General information */}
          {collapsibleSection(FORM_SECTIONS[0].id, "01", "General Information", null,
            <>
              {field(
                "Incident reference / title",
                "A descriptive title or reference number for the incident.",
                <input className="form-input" value={record.incidentTitle} onChange={(e) => updateRecord("incidentTitle", e.target.value)} placeholder="e.g. INC-2026-014 — Misdirected payroll export" style={{ maxWidth: "560px" }} />,
                { badge: "Required" }
              )}
              {field(
                "Source of incident",
                "Did the incident involve a system controlled by your organization, or a third-party system?",
                <select className="form-select" value={record.sourceOfIncident} onChange={(e) => updateRecord("sourceOfIncident", e.target.value)} style={{ maxWidth: "280px" }}>
                  <option value="">Select…</option>
                  {SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {field(
                "Incident location",
                "The geographical location of the incident, if available and applicable (e.g., where a laptop was stolen, the location of a data center, or of the individual who caused the incident).",
                <input className="form-input" value={record.incidentLocation} onChange={(e) => updateRecord("incidentLocation", e.target.value)} style={{ maxWidth: "560px" }} />
              )}
              {field(
                "Department reporting",
                "Which organizational unit reported the incident?",
                <input className="form-input" value={record.departmentReporting} onChange={(e) => updateRecord("departmentReporting", e.target.value)} style={{ maxWidth: "560px" }} />
              )}
              {field("Systems & services impacted", null, <textarea className="form-textarea" value={record.systemsImpacted} onChange={(e) => updateRecord("systemsImpacted", e.target.value)} />)}
              {field(
                "Backups — existence & availability",
                "Were the systems in question backed up in any way? Where are they located?",
                <textarea className="form-textarea" value={record.backups} onChange={(e) => updateRecord("backups", e.target.value)} />
              )}
              {field(
                "Which data security principles of the personal data were compromised?",
                null,
                multiCheck(DATA_PRINCIPLES, record.dataPrinciples, (id) => toggleRecordArray("dataPrinciples", id), 1)
              )}
              {field(
                "Type of incident",
                null,
                <>
                  {multiCheck(INCIDENT_TYPES, record.incidentTypes, (id) => toggleRecordArray("incidentTypes", id), 3)}
                  {record.incidentTypes.includes("other") && (
                    <input className="form-input" value={record.incidentTypeOther} onChange={(e) => updateRecord("incidentTypeOther", e.target.value)} placeholder="Specify the type of incident" style={{ marginTop: "12px", maxWidth: "560px" }} />
                  )}
                </>
              )}
            </>
          )}

          {/* 2. How & when discovered */}
          {collapsibleSection(FORM_SECTIONS[1].id, "02", "How & When Discovered", null,
            <>
              {field("Summary of how discovered", null, <textarea className="form-textarea" value={record.howDiscovered} onChange={(e) => updateRecord("howDiscovered", e.target.value)} />)}
              {renderAwarenessField()}
              {field(
                "Did you learn about the incident from a third party?",
                "For example, did one of your organization's vendors report a security incident to you?",
                <select className="form-select" value={record.learnedFromThirdParty} onChange={(e) => updateRecord("learnedFromThirdParty", e.target.value)} style={{ maxWidth: "280px" }}>
                  <option value="">Select…</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              )}
              {record.learnedFromThirdParty === "Yes" && (
                <>
                  {field(
                    "Type of third party",
                    null,
                    <select className="form-select" value={record.thirdPartyType} onChange={(e) => updateRecord("thirdPartyType", e.target.value)} style={{ maxWidth: "280px" }}>
                      <option value="">Select…</option>
                      {THIRD_PARTY_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  {record.thirdPartyType === "Customer" && field("Customer name", null, <input className="form-input" value={record.thirdPartyCustomerName} onChange={(e) => updateRecord("thirdPartyCustomerName", e.target.value)} style={{ maxWidth: "560px" }} />)}
                  {record.thirdPartyType === "Vendor" && field("Vendor name & services", null, <input className="form-input" value={record.thirdPartyVendorName} onChange={(e) => updateRecord("thirdPartyVendorName", e.target.value)} style={{ maxWidth: "560px" }} />)}
                  {record.thirdPartyType === "Individual" && field("Individual name", null, <input className="form-input" value={record.thirdPartyIndividualName} onChange={(e) => updateRecord("thirdPartyIndividualName", e.target.value)} style={{ maxWidth: "560px" }} />)}
                  {record.thirdPartyType === "Other" && field("Other", null, <input className="form-input" value={record.thirdPartyOther} onChange={(e) => updateRecord("thirdPartyOther", e.target.value)} style={{ maxWidth: "560px" }} />)}
                </>
              )}
            </>
          )}

          {/* 3. When the incident occurred */}
          {collapsibleSection(FORM_SECTIONS[2].id, "03", "When the Incident Occurred", "The actual date and time the incident took place, as opposed to when someone in your organization became aware of it.",
            <>
              <div style={{ marginBottom: "20px" }}>
                {checkRow(record.occurrenceNotAvailable, "Information not available", () => updateRecord("occurrenceNotAvailable", !record.occurrenceNotAvailable))}
              </div>
              <div style={{ opacity: record.occurrenceNotAvailable ? 0.45 : 1, pointerEvents: record.occurrenceNotAvailable ? "none" : "auto" }}>
                {field("Occurrence date", null, <input type="date" className="form-input" value={record.occurrenceDate} onChange={(e) => updateRecord("occurrenceDate", e.target.value)} disabled={record.occurrenceNotAvailable} style={{ maxWidth: "280px" }} />)}
                {field("Exact time (incl. time zone)", null, <input className="form-input" value={record.occurrenceTime} onChange={(e) => updateRecord("occurrenceTime", e.target.value)} disabled={record.occurrenceNotAvailable} placeholder="e.g. 14:30 ET" style={{ maxWidth: "280px" }} />)}
                {field("Additional detail", null, <textarea className="form-textarea" value={record.occurrenceDetail} onChange={(e) => updateRecord("occurrenceDetail", e.target.value)} disabled={record.occurrenceNotAvailable} />)}
              </div>
            </>
          )}

          {/* 4. Incident summary */}
          {collapsibleSection(FORM_SECTIONS[3].id, "04", "Incident Summary", null,
            field(
              "Summary of the incident",
              "Write a descriptive summary in your own words. The more detail, the better.",
              <textarea className="form-textarea" style={{ minHeight: "120px" }} value={record.incidentSummary} onChange={(e) => updateRecord("incidentSummary", e.target.value)} />
            )
          )}

          {/* 5. Data affected */}
          {collapsibleSection(FORM_SECTIONS[4].id, "05", "Data Affected", null,
            <>
              {renderJurisdictionsField()}
              {renderQ1()}
              {crossCheckBanner()}
              {renderEncryption()}

              {/* Dynamic data-subject category repeater (record only) */}
              <div style={{ marginTop: "8px" }}>
                {labelRow("Which categories of data subjects were affected?")}
                {record.dataSubjectBlocks.map((b, i) => (
                  <div key={b.id} style={{ border: "1px solid rgba(27,42,63,0.18)", borderRadius: "12px", padding: "20px 22px", marginBottom: "16px", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <span className="section-mark">Category {i + 1}</span>
                      {record.dataSubjectBlocks.length > 1 && (
                        <button type="button" onClick={() => removeBlock(b.id)} className="btn-inline-remove">
                          <X size={13} /> Remove
                        </button>
                      )}
                    </div>
                    {field("Category name", "Name this group of affected people (e.g., Customers, Employees, Newsletter subscribers).", <input className="form-input" value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} placeholder="e.g. Customers" style={{ maxWidth: "420px" }} />)}
                    {field("Approximate count", null, <input type="number" className="form-input" value={b.count} onChange={(e) => updateBlock(b.id, { count: e.target.value })} style={{ maxWidth: "240px" }} />)}
                    {field("Which data elements were affected?", null, multiCheck(DATA_ELEMENTS, b.elements, (elId) => toggleBlockElement(b.id, elId), 2))}
                    <div>
                      {labelRow("Other elements (not listed)")}
                      {b.others.map((o, oi) => (
                        <div key={oi} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
                          <input className="form-input" value={o} onChange={(e) => updateBlockOther(b.id, oi, e.target.value)} placeholder="Describe another data element" style={{ maxWidth: "420px" }} />
                          <button type="button" onClick={() => removeBlockOther(b.id, oi)} className="btn-inline-remove" aria-label="Remove element">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addBlockOther(b.id)} className="btn-link">
                        <Plus size={13} /> add another
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addBlock} className="btn-ghost" style={{ marginTop: "4px" }}>
                  <Plus size={14} /> Add another category of data subjects
                </button>
              </div>
            </>
          )}

          {/* 6. Measures */}
          {collapsibleSection(FORM_SECTIONS[5].id, "06", "Measures", null,
            <>
              {field(
                "Measures taken (incl. mitigation)",
                null,
                <>
                  <textarea className="form-textarea" value={record.measuresTaken} onChange={(e) => updateRecord("measuresTaken", e.target.value)} disabled={record.measuresTakenNotAvailable} style={{ opacity: record.measuresTakenNotAvailable ? 0.45 : 1 }} />
                  <div style={{ marginTop: "12px" }}>
                    {checkRow(record.measuresTakenNotAvailable, "Not available", () => updateRecord("measuresTakenNotAvailable", !record.measuresTakenNotAvailable))}
                  </div>
                </>
              )}
              {field(
                "Measures proposed (incl. proposed mitigation)",
                null,
                <>
                  <textarea className="form-textarea" value={record.measuresProposed} onChange={(e) => updateRecord("measuresProposed", e.target.value)} disabled={record.measuresProposedNotAvailable} style={{ opacity: record.measuresProposedNotAvailable ? 0.45 : 1 }} />
                  <div style={{ marginTop: "12px" }}>
                    {checkRow(record.measuresProposedNotAvailable, "Not available", () => updateRecord("measuresProposedNotAvailable", !record.measuresProposedNotAvailable))}
                  </div>
                </>
              )}
            </>
          )}

          {/* 07. Risk Assessment — appears only with an EU/UK jurisdiction
              selected; appended at the end so the six fixed sections keep their
              numbers (Measures stays 06). Collapsed by default like the rest. */}
          {(jurisdictions.eu || jurisdictions.uk) &&
            collapsibleSection("form-risk", "07", "Risk Assessment", null,
              <>
                {renderRiskAssessment()}
                {renderGdprUnintelligibility()}
                {isNarrow && renderNote("risk")}
              </>
            )}

          {/* Harm Assessment — after the EU/UK risk section, only when a
              selected jurisdiction carries a harmGate. Appended like Risk so
              the six fixed sections keep their numbers; its own number slides
              between 07 and 08 depending on whether Risk renders. */}
          {anyHarmGated &&
            collapsibleSection("form-harm", (jurisdictions.eu || jurisdictions.uk) ? "08" : "07", "Harm Assessment", null,
              <>
                {renderHarmAssessment()}
                {isNarrow && renderHarmStandardsNote()}
              </>
            )}
        </>
      )}

      {/* Submit */}
      {attemptedSubmit && !canCompute && (
        <div role="alert" style={{ marginBottom: "20px", padding: "16px 20px", background: "#FBF5EE", borderLeft: "4px solid #C76E3A", borderRadius: "0 12px 12px 0" }}>
          <div className="section-mark" style={{ color: "#C76E3A", opacity: 1, marginBottom: "8px" }}>Before submitting</div>
          <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 8px", color: "#2C2418" }}>
            To compute notification requirements and timing:
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", lineHeight: 1.7, color: "#2C2418" }}>
            {missingInputs.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        {/* Submit persists before results render; a failed save keeps the
            user here. The save cluster's error slot sits at the top of the
            form, so mirror the message beside the button the user just
            pressed (same treatment, point of action). */}
        {saveError && (
          <span role="alert" style={{ fontSize: "13px", color: "#C76E3A", lineHeight: 1.4 }}>
            {saveError}
          </span>
        )}
        <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : <>Submit &amp; compute deadlines <ArrowRight size={14} /></>}
        </button>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Review (read-only) — rendered in the main column after a valid Submit.
  // ─────────────────────────────────────────────────────────────────────────
  // ── Deadline queue (results view; the FIRST main-column element under the
  //    Review heading, JDC ruling 2026-08-23). Dated rows only: firm
  //    obligations with a computed deadline by date ascending (overdue rows
  //    lead, Ember date), then contingent obligations with a computed
  //    conditional date in the results-surface qualifier form ("If required,
  //    due {date}" — matching the contingent cards; the incidents-list
  //    "≤ {date} · contingent" compact form is NOT used here). Every
  //    obligation with no fixed notification deadline, firm or contingent, is
  //    NOT an obligation row — it compresses to one counsel-register summary
  //    line rendered as the table's final full-width Parchment row
  //    (noClockSummaryLine). Suppressed and counsel-review
  //    obligations stay a summary line beneath the table, never rows.
  //    Renders only when 3+ jurisdiction blocks have a queue-eligible row. A
  //    row click expands its block and scrolls to its card. Status cells read
  //    the shared 60-second `now` — never a per-second tier.
  const renderDeadlineQueue = () => {
    const { rows, noClockCount, suppressedCount, reviewCount, eligibleBlockCount } = deadlineQueue;
    if (eligibleBlockCount < QUEUE_MIN_BLOCKS || rows.length === 0) return null;
    const isClosed = status === "closed";
    const fmtQueueDate = (d) => fmtDueDate(d);
    const thStyle = { textAlign: "left", padding: "10px 16px", borderBottom: "1px solid rgba(27,42,63,0.18)", fontWeight: 500 };
    const tdStyle = { padding: "10px 16px", borderTop: "1px solid rgba(27,42,63,0.08)", verticalAlign: "top" };
    const dateCell = (row) => {
      const past = row.date.getTime() < now.getTime();
      if (row.kind === "contingent") {
        // Qualified, never firm: Mist while the conditional date is not yet
        // past, the same Ember flip as the card's qualifier line once it is
        // (the status cell beside it stays muted either way).
        return (
          <span className="mono" style={{ fontSize: "12.5px", color: past && !isClosed ? "#C76E3A" : "#9FAEC2" }}>
            If required, due {fmtQueueDate(row.date)}
          </span>
        );
      }
      const rec = notifications[notifKey(row.card)];
      const overdue = !rec && !isClosed && past;
      return (
        <span className="mono" style={{ fontSize: "12.5px", fontWeight: overdue ? 600 : 400, color: overdue ? "#C76E3A" : isClosed || rec ? "#9FAEC2" : "#2C2418" }}>
          {fmtQueueDate(row.date)}
        </span>
      );
    };
    const statusCell = (row) => {
      if (row.kind === "contingent") {
        return <span style={{ color: "#9FAEC2" }}>Contingent on resident count</span>;
      }
      const rec = notifications[notifKey(row.card)];
      if (rec) {
        const notifiedDate = parseDateOnly(rec.notified_on);
        const onTime = !!(row.date && notifiedDate && notifiedDate.getTime() <= row.date.getTime());
        return <span style={{ color: onTime ? "#5A6E4A" : "#2C2418" }}>Notified {fmtDateOnly(rec.notified_on)}</span>;
      }
      if (isClosed) return <span style={{ color: "#9FAEC2" }}>—</span>;
      // Same magnitude tiering as the cards, on the shared 60-second clock
      // only — queue cells never attach a per-second interval.
      const remaining = row.date.getTime() - now.getTime();
      return (
        <span className="mono" style={{ fontSize: "12.5px", fontWeight: 500, color: remaining < 0 ? "#C76E3A" : "#2C2418" }}>
          {formatCountdown(remaining)}
        </span>
      );
    };
    return (
      <div style={{ marginBottom: "36px" }}>
        <div className="section-mark" style={{ marginBottom: "14px" }}>Deadline queue</div>
        <div style={{ border: "1px solid rgba(27,42,63,0.18)", background: "#fff", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px", lineHeight: 1.5 }}>
            <thead>
              <tr>
                <th className="section-mark" style={thStyle}>Jurisdiction</th>
                <th className="section-mark" style={thStyle}>Authority</th>
                <th className="section-mark" style={thStyle}>Date</th>
                <th className="section-mark" style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                /* The whole row is a pointer target (onClick), but the
                   ACCESSIBLE control is the real button in the authority
                   cell — the <tr> keeps its table-row semantics. */
                <tr
                  key={`${row.kind}-${row.jurisdictionId}-${row.authority}`}
                  className="queue-row"
                  onClick={() => jumpToObligation(row)}
                >
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{row.jurisdiction}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      aria-label={`Go to ${row.jurisdiction} — ${row.authority}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToObligation(row);
                      }}
                      style={{
                        background: "none", border: "none", padding: 0, margin: 0,
                        font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      {row.authority}
                    </button>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{dateCell(row)}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{statusCell(row)}</td>
                </tr>
              ))}
              {/* No-fixed-deadline summary (JDC addendum 2026-08-23): the
                  table's FINAL row, one full-width Parchment cell — never an
                  obligation row: no date, no status, no countdown, not a
                  jump target, outside the row ordering above. */}
              {noClockCount > 0 && (
                <tr data-queue-summary>
                  <td colSpan={4} style={{ ...tdStyle, background: "#E8DDC4", color: "#2C2418" }}>
                    {noClockSummaryLine(noClockCount)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(suppressedCount > 0 || reviewCount > 0) && (
          <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {suppressedCount > 0 && (
              <button type="button" className="btn-link" onClick={jumpToFirstSuppressed}>
                {suppressedCount} suppressed
              </button>
            )}
            {suppressedCount > 0 && reviewCount > 0 && <span style={{ opacity: 0.3, color: "#1B2A3F", userSelect: "none" }}>·</span>}
            {reviewCount > 0 && (
              <button type="button" className="btn-link" onClick={jumpToFirstReview}>
                {reviewCount} for counsel review
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Block-order toggle (A–Z | Urgency; Urgency is the default), rendered
  //    on the results view: in the right actions rail above Download memo on
  //    wide layouts, and with the restored top controls on narrow ones.
  //    Persisted per incident in incidents.view_state — see the blockOrder
  //    state note: the saved payload never carries view state. The memo
  //    always prints the shared urgency order; selecting A–Z diverges the
  //    screen only.
  const renderOrderToggle = () => (
    <div>
      <div className="section-mark" style={{ marginBottom: "8px" }}>Jurisdiction order</div>
      <div role="radiogroup" aria-label="Jurisdiction block order" style={{ display: "flex", border: "1px solid #1B2A3F", borderRadius: "8px", overflow: "hidden" }}>
        {[{ value: "alpha", label: "A–Z" }, { value: "urgency", label: "Urgency" }].map((o) => {
          const selected = blockOrder === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => persistBlockOrder(o.value)}
              style={{
                flex: 1, padding: "9px 0", border: "none", cursor: "pointer",
                fontFamily: "'Inter', sans-serif", fontSize: "13px", fontWeight: 500, letterSpacing: "0.01em",
                background: selected ? "#1B2A3F" : "transparent", color: selected ? "#FAF8F2" : "#1B2A3F",
                transition: "all 0.2s ease",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Analysis Inputs (results view). Lives in the SIDEBAR below Edit
  //    answers (JDC ruling 2026-08-23) — the same label/value pairs as
  //    before, at the rail's compact scale (.section-mark labels, 13px
  //    values), content preserved in full: the timezone line and the legacy-
  //    payload caveat included. On narrow viewports, where the sidebar
  //    stacks, it renders after the deadline queue, never before it. The
  //    memo's Analysis Inputs section is unchanged.
  const renderAnalysisInputs = () => {
    const recapRow = (label, value) => (
      <div key={label}>
        <div className="section-mark" style={{ marginBottom: "3px" }}>{label}</div>
        <div style={{ fontSize: "13px", lineHeight: 1.5, color: "#2C2418", overflowWrap: "break-word" }}>{value}</div>
      </div>
    );
    return (
      <div>
        <div className="field-mark" style={{ marginBottom: "12px" }}>Analysis inputs</div>
        <div style={{ display: "grid", gap: "12px" }}>
          {recapRow("Awareness", awarenessDate ? fmtDueDateTime(awarenessDate) : "—")}
          {/* Legacy caveat (ruling C) — verbatim, same string as the memo. */}
          {awarenessDate && legacyAwarenessZone && recapRow("Timezone", AWARENESS_TZ_CAVEAT)}
          {recapRow(
            "Jurisdictions",
            JURISDICTIONS.filter((j) => jurisdictions[j.id]).map((j) => {
              const c = residentCounts[j.id];
              // An unestablished count is stated, not left blank — the same
              // fact the memo's Analysis Inputs records.
              const suffix = j.residentField && c
                ? ` (${fmtCount(c)} residents)`
                : j.residentField && residentCountUnknown[j.id]
                ? " (count not established)"
                : "";
              return `${j.short}${suffix}`;
            }).join(" · ") || "—"
          )}
          {recapRow("Data types (Q1)", sensitivity.map((s) => SENSITIVITY_OPTIONS.find((o) => o.id === s)?.label).filter(Boolean).join(" · ") || "—")}
          {anyUSJurisdiction && recapRow("Encryption", encryptionRecap)}
          {(jurisdictions.eu || jurisdictions.uk) &&
            recapRow(
              "Risk assessment",
              riskLevel ? RISK_OPTIONS.find((o) => o.value === riskLevel)?.label : "Not assessed"
            )}
          {anyHarmGated && recapRow("Harm assessment", harmAssessmentSummary(harmAssessment, jurisdictions))}
          {(jurisdictions.eu || jurisdictions.uk) &&
            recapRow(
              "Unintelligibility (Art. 34(3)(a))",
              gdprUnintelligibility === "yes" ? "Measures applied — data rendered unintelligible"
                : gdprUnintelligibility === "no" ? "Not applied"
                : "Not reported"
            )}
          {review.length > 0 &&
            recapRow(
              "Counsel review",
              review.map((r) => `${r.jurisdiction} — ${r.authority}${r.review_citation ? ` (${r.review_citation})` : ""}`).join(" · ")
            )}
        </div>
      </div>
    );
  };

  const renderReview = () => {
    const reportSections = quickMode ? [] : buildIncidentReportSections();
    return (
      <>
        {/* Artifact controls. On the wide layout these live in the sticky
            right-hand actions rail (renderReviewActionsRail) and the heading
            below rises to the top of this column. Below the wide breakpoint
            there's no rail, so we restore them here as a row at the top of the
            content, with the same INCIDENT / title header above them. */}
        {isNarrow && (
          <div style={{ marginBottom: "28px" }}>
            {renderIncidentHeader()}
            <div style={{ display: "flex", gap: "12px", marginTop: "16px", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={handleDownloadMemo} style={{ justifyContent: "center" }}>
                <Download size={14} /> Download memo
              </button>
              <button className="btn-ghost" onClick={handleEdit} style={{ justifyContent: "center" }}>
                <ArrowLeft size={14} /> Edit answers
              </button>
            </div>
            {/* No rail below the wide breakpoint, so the block-order toggle
                joins the restored top controls here. */}
            <div style={{ marginTop: "16px", maxWidth: "280px" }}>{renderOrderToggle()}</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <h2 className="serif" style={{ fontSize: "28px", fontWeight: 400, margin: 0, color: "#1B2A3F", letterSpacing: "-0.01em" }}>
            Review
          </h2>
          <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
          {quickMode && <span className="section-mark" style={{ opacity: 0.6 }}>Breach Clock</span>}
        </div>

        {downloadError && (
          <div role="alert" style={{ marginBottom: "20px", padding: "10px 14px", border: "1px solid #C76E3A", color: "#C76E3A", fontSize: "13px", lineHeight: 1.5, borderRadius: "8px" }}>
            {downloadError}
          </div>
        )}
        {/* Post-submit writes made from review (top-bar status changes,
            notification records, log entries) can still fail while the user
            is here — the save cluster that normally shows saveError lives on
            the form — so surface it in the same error slot style as
            downloadError. (Submit's own save failure never reaches review:
            results render only after confirmed persistence.) */}
        {saveError && (
          <div role="alert" style={{ marginBottom: "20px", padding: "10px 14px", border: "1px solid #C76E3A", color: "#C76E3A", fontSize: "13px", lineHeight: 1.5, borderRadius: "8px" }}>
            {saveError}
          </div>
        )}

        {crossCheckBanner()}

        {/* Staleness banner (JDC ruling 2026-08-02): facts have changed since
            the last explicit compute (live signature differs from the one
            recorded at submit / auto-compute — a flag alone would false-alarm
            after Back-to-results reverts to the exact computed facts). Quiet
            Parchment treatment — informational, no Ember, no icon. Never
            renders immediately post-submit: a successful submit refreshes the
            recorded signature. */}
        {computedSignature !== null && factsSignatureOf(buildPayload()) !== computedSignature && (
          <div
            style={{
              marginBottom: "20px",
              padding: "14px 20px",
              background: "#E8DDC4",
              border: "1px solid rgba(27,42,63,0.18)",
              borderRadius: "12px",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#2C2418",
            }}
          >
            Facts have changed since this analysis — Submit &amp; compute to refresh.
          </div>
        )}

        {/* Deadline queue — the cross-jurisdiction overview and the FIRST
            main-column element under the Review heading (Analysis Inputs now
            lives in the sidebar). Renders only at 3+ eligible blocks. */}
        {renderDeadlineQueue()}
        {/* Narrow: the sidebar stacks, and Analysis Inputs follows the queue
            rather than preceding it. */}
        {isNarrow && <div style={{ marginBottom: "36px" }}>{renderAnalysisInputs()}</div>}

        {/* Computed obligations. Past 3 selected jurisdictions the blocks
            collapse, so the header row gains Expand all / Collapse all in the
            form's section-control idiom. */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div className="section-mark">
            {deadlines.length > 0 ? "Notification deadlines" : "Analysis"}
          </div>
          {collapsibleBlocks && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="button" className="btn-link" onClick={expandAllBlocks}>Expand all</button>
              <span style={{ opacity: 0.3, color: "#1B2A3F", userSelect: "none" }}>·</span>
              <button type="button" className="btn-link" onClick={collapseAllBlocks}>Collapse all</button>
            </div>
          )}
        </div>
        <div className="divider-thick" style={{ marginBottom: "24px" }} />
        {renderObligations()}

        {/* Incident-report recap (full mode only) */}
        {!quickMode && reportSections.length > 0 && (
          <div style={{ marginTop: "44px" }}>
            <div className="section-mark" style={{ marginBottom: "16px" }}>Incident report</div>
            <div style={{ border: "1px solid rgba(27,42,63,0.18)", background: "#fff", padding: "24px 28px", borderRadius: "12px" }}>
              {reportSections.map((entry, i) =>
                entry.type === "group" ? (
                  <div key={i} className="serif" style={{ fontSize: "17px", color: "#1B2A3F", margin: i === 0 ? "0 0 10px" : "22px 0 10px" }}>
                    {entry.title}
                  </div>
                ) : (
                  <div key={i} style={{ marginBottom: "12px" }}>
                    <div className="section-mark" style={{ marginBottom: "4px" }}>{entry.label}</div>
                    <div style={{ fontSize: "14px", lineHeight: 1.6, whiteSpace: entry.multiline ? "pre-wrap" : "normal" }}>{entry.value}</div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Incident log — after the incident report, before Further
            Considerations (JDC ruling 2026-07-24). Renders in both modes:
            quick mode has no recap or further-considerations, so the log
            holds the same relative position, directly after the obligations. */}
        {renderIncidentLog()}

        {/* Further considerations (full mode) */}
        {!quickMode && (
          <div style={{ marginTop: "36px", padding: "28px", background: "#E8DDC4", color: "#2C2418", border: "1px solid rgba(27,42,63,0.18)", borderRadius: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", color: "#1B2A3F" }}>
              <FileWarning size={18} />
              <div className="section-mark" style={{ opacity: 1 }}>Further considerations</div>
            </div>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", lineHeight: 1.7 }}>
              <li>Sectoral regimes (HIPAA, GLBA, NYDFS, financial services) may impose separate obligations not modeled here.</li>
              <li>Employer, insurer, processor, and joint-controller relationships may create contractual notification duties preceding statutory ones.</li>
              <li>Law enforcement holds may permit delay of individual notification in some US jurisdictions — document the request in writing.</li>
              <li>Residents of US states beyond those listed above may be affected; 50-state analysis recommended for any multi-state incident.</li>
              <li>This tool provides a preliminary timeline only and does not constitute legal advice. Confirm all conclusions with qualified counsel.</li>
            </ul>
          </div>
        )}
      </>
    );
  };

  // ── Mode control (top of the rail on desktop, top of the page on narrow;
  //    flows with the page, nothing pinned). Only shown during entry — the
  //    post-submit Download/Edit controls live at the top of the review. ──
  const railControls = () => (
    <div>
      <div className="section-mark" style={{ marginBottom: "10px", opacity: 0.6 }}>Breach Clock</div>
      {checkRow(
        quickMode,
        "Notification requirements and deadlines only",
        () => setQuickMode(!quickMode),
        { desc: "Check this box if you don't need a full incident report." }
      )}
      <div style={{ marginTop: "20px" }}>{renderIncidentVsBreachNote()}</div>
    </div>
  );

  // Incident header for the review — a quiet "INCIDENT" kicker (.section-mark,
  // CSS-uppercased) over the incident reference/title in READABLE case (serif,
  // normal weight, not the letter-spaced mark). The title field is NOT required
  // to submit (handleSubmit gates only on the three operative inputs), so the
  // empty case is real: render the kicker alone, no name line. A long title
  // wraps (break-word) rather than truncating or overflowing the rail.
  const renderIncidentHeader = () => (
    <div>
      <div className="section-mark">Incident</div>
      {record.incidentTitle && (
        <div
          className="serif"
          style={{ fontSize: "18px", lineHeight: 1.3, color: "#1B2A3F", marginTop: "8px", overflowWrap: "break-word" }}
        >
          {record.incidentTitle}
        </div>
      )}
    </div>
  );

  // Review actions rail (wide layout only). Pinned via position:sticky +
  // top:NAV_CLEARANCE INSIDE the plain block grid item that forms the right
  // column — the same proven pattern as the form's section index. (Sticky on a
  // flex *item* is the bug we hit on the index; this column is a grid/block
  // child, so the rail pins reliably.) Full-width Download (primary) over Edit
  // (ghost).
  const renderReviewActionsRail = () => (
    <div style={{ position: "sticky", top: `${NAV_CLEARANCE}px` }}>
      {renderIncidentHeader()}
      <div style={{ marginTop: "20px" }}>{renderOrderToggle()}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
        <button className="btn-primary" onClick={handleDownloadMemo} style={{ width: "100%", justifyContent: "center" }}>
          <Download size={14} /> Download memo
        </button>
        <button className="btn-ghost" onClick={handleEdit} style={{ width: "100%", justifyContent: "center" }}>
          <ArrowLeft size={14} /> Edit answers
        </button>
      </div>
      <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid rgba(27,42,63,0.12)" }}>
        {renderAnalysisInputs()}
      </div>
    </div>
  );

  const main = submitted ? renderReview() : renderForm();

  // ─────────────────────────────────────────────────────────────────────────
  // Main view.
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F2", color: "#2C2418", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        /* Smooth jumps for the section index's in-page anchor links. */
        html { scroll-behavior: smooth; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .serif { font-family: Merriweather, Georgia, serif; }
        h1, h2, h3 { font-family: Merriweather, Georgia, serif; font-weight: 400; }
        .btn-primary {
          background: #1B2A3F; color: #FAF8F2; border: none; padding: 13px 24px;
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;
          letter-spacing: 0.01em; cursor: pointer; border-radius: 8px;
          transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-primary:hover:not(:disabled) { background: #2C3E55; }
        .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }
        .btn-ghost {
          background: transparent; color: #1B2A3F; border: 1px solid #1B2A3F; padding: 13px 24px;
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;
          letter-spacing: 0.01em; cursor: pointer; border-radius: 8px;
          transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-ghost:hover:not(:disabled) { background: #1B2A3F; color: #FAF8F2; }
        .btn-ghost:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-link {
          background: transparent; border: none; padding: 4px 0; cursor: pointer;
          font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; color: #1B2A3F;
          display: inline-flex; align-items: center; gap: 5px; opacity: 0.85;
        }
        .btn-link:hover { opacity: 1; text-decoration: underline; }
        .btn-inline-remove {
          background: transparent; border: none; padding: 4px 6px; cursor: pointer;
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 500; color: #1B2A3F;
          display: inline-flex; align-items: center; gap: 5px; opacity: 0.6; border-radius: 6px;
        }
        .btn-inline-remove:hover { opacity: 1; background: rgba(27,42,63,0.06); }
        /* Deadline-queue rows: clickable jump targets (hover tint matches the
           .check-row idiom). */
        /* Citation tokens in headings never break mid-citation: inline-block
           + nowrap drops the whole token to its own line when it won't fit. */
        .cite { display: inline-block; white-space: nowrap; max-width: 100%; }
        .queue-row { cursor: pointer; transition: background 0.15s ease; }
        .queue-row:hover, .queue-row:focus-visible { background: rgba(27,42,63,0.05); }
        /* Checkbox-row selection idiom */
        .check-row {
          display: flex; align-items: flex-start; gap: 13px; padding: 12px 14px;
          cursor: pointer; border-radius: 8px; transition: background 0.15s ease;
          outline: none;
        }
        .check-row:hover { background: rgba(27,42,63,0.05); }
        .check-row.selected { background: rgba(27,42,63,0.045); }
        .check-row:focus-visible { box-shadow: 0 0 0 2px #C76E3A; }
        .check-box {
          width: 22px; height: 22px; border: 2px solid #1B2A3F; border-radius: 6px;
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          background: #fff; margin-top: 1px; transition: all 0.12s ease; color: #FAF8F2;
        }
        .check-row.selected .check-box { background: #1B2A3F; border-color: #1B2A3F; }
        .check-label { font-size: 15px; line-height: 1.4; display: block; }
        .check-sub { font-size: 11px; letter-spacing: 0.1em; opacity: 0.65; display: block; margin-top: 4px; }
        .check-desc { font-size: 13px; opacity: 0.7; line-height: 1.45; display: block; margin-top: 4px; }
        .form-input, .form-select, .form-textarea {
          width: 100%; border: 1px solid rgba(27,42,63,0.25); border-radius: 8px; background: #fff;
          padding: 11px 13px; font-family: 'Inter', sans-serif; font-size: 15px; color: #2C2418;
          outline: none; transition: border-color 0.15s ease;
        }
        .form-textarea { resize: vertical; line-height: 1.55; min-height: 84px; }
        .form-select {
          -webkit-appearance: none; -moz-appearance: none; appearance: none;
          /* Custom caret inset to match the field's 13px horizontal padding,
             with padding-right sized to keep the value text clear of it. */
          padding-right: 38px;
          background-color: #fff;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4.5l4 4 4-4' fill='none' stroke='%232C2418' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 13px center;
          background-size: 12px;
        }
        /* ── Progressive enhancement: appearance:base-select where supported
           (Chrome/Edge today; Safari/Firefox when they ship). Non-supporting
           browsers skip this whole @supports block and keep the fallback above
           — the styled closed box (appearance:none + custom chevron) plus the
           native pane. Every value below is pulled from the form's existing
           input / hover tokens so the pane reads as part of the same form. ── */
        @supports (appearance: base-select) {
          .form-select, .form-select::picker(select) { appearance: base-select; }
          /* base-select draws its own caret via ::picker-icon, so drop the
             fallback background chevron and restore the inputs' 13px right pad —
             the closed box then shows exactly one caret, sitting where the
             fallback chevron did. */
          .form-select { background-image: none; padding-right: 13px; }
          .form-select::picker-icon {
            content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4.5l4 4 4-4' fill='none' stroke='%232C2418' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
            transition: transform 0.15s ease;
          }
          .form-select:open::picker-icon { transform: rotate(180deg); }
          /* The pane: the inputs' white surface, the text inputs' hairline
             border + 8px radius, the brand's popover shadow (as used by the
             tooltip), and a small inner pad. */
          .form-select::picker(select) {
            background: #fff;
            border: 1px solid rgba(27,42,63,0.25);
            border-radius: 8px;
            box-shadow: 0 6px 18px rgba(27,42,63,0.22);
            padding: 4px;
          }
          .form-select option {
            display: flex; align-items: center; gap: 8px;
            font-family: 'Inter', sans-serif; font-size: 15px; color: #2C2418;
            padding: 11px 13px; border-radius: 4px;
          }
          .form-select option:hover { background: rgba(27,42,63,0.05); }
          .form-select option:checked { background: rgba(27,42,63,0.10); }
          /* Quiet, on-brand check — Midnight, not the heavy native glyph. */
          .form-select option::checkmark { color: #1B2A3F; font-size: 13px; }
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #C76E3A; }
        .form-input:disabled, .form-select:disabled, .form-textarea:disabled {
          opacity: 0.45; cursor: not-allowed; background: #FAF8F2;
        }
        /* Jurisdiction picker: the combobox pane mirrors the base-select
           option pane (white surface, hairline border, 8px radius, popover
           shadow); selected-jurisdiction rows are a quiet white list card. */
        .jur-pane {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 40;
          background: #fff; border: 1px solid rgba(27,42,63,0.25); border-radius: 8px;
          box-shadow: 0 6px 18px rgba(27,42,63,0.22); padding: 4px;
          max-height: 320px; overflow-y: auto;
        }
        .jur-group-label {
          font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 500;
          letter-spacing: 0.14em; text-transform: uppercase; color: #1B2A3F;
          opacity: 0.55; padding: 8px 13px 4px;
        }
        .jur-option { padding: 9px 13px; border-radius: 4px; cursor: pointer; }
        .jur-option.active { background: rgba(27,42,63,0.10); }
        .jur-option-name { display: block; font-size: 14px; color: #2C2418; line-height: 1.35; }
        .jur-option-sub { display: block; font-size: 11px; letter-spacing: 0.06em; opacity: 0.6; margin-top: 2px; }
        .jur-empty { padding: 11px 13px; font-size: 13px; color: #2C2418; opacity: 0.6; }
        .jur-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 16px; }
        .counsel-note {
          background: #E8DDC4; color: #2C2418; padding: 16px 18px;
          border: 1px solid rgba(27,42,63,0.18); border-radius: 12px;
        }
        .deadline-card {
          background: #fff; border-left: 4px solid #1B2A3F; padding: 24px;
          position: relative; overflow: hidden; border-radius: 0 12px 12px 0;
          box-shadow: 0 2px 8px rgba(27,42,63,0.10);
        }
        .deadline-card.urgent { border-left-color: #C76E3A; background: #FBF5EE; }
        .deadline-card.missed { background: #1B2A3F; color: #FAF8F2; border-left-color: #C76E3A; }
        .deadline-card.missed .mono { color: #FAF8F2; }
        .divider-thick { height: 1px; background: #1B2A3F; width: 100%; opacity: 0.25; }
        .rule-text { font-size: 13px; line-height: 1.6; opacity: 0.75; }
        .section-mark {
          font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500;
          letter-spacing: 0.18em; text-transform: uppercase; color: #1B2A3F; opacity: 0.7;
        }
        /* Firmer small-caps for functional labels (form fields + the review's
           Analysis-inputs recap rows). Distinct from the quieter .section-mark,
           which stays on decorative marks and group headers. */
        .field-mark {
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase; color: #1B2A3F; opacity: 0.85;
        }
        /* Collapsible-section header: the whole row is the toggle. Negative
           horizontal margin + padding lets the hover tint extend past the
           content edges while the number/heading still align with the body. */
        .section-toggle {
          display: flex; align-items: center; gap: 12px;
          cursor: pointer; user-select: none; outline: none;
          padding: 10px 12px; margin-left: -12px; margin-right: -12px;
          border-radius: 8px; transition: background 0.15s ease;
        }
        .section-toggle:hover { background: rgba(27,42,63,0.035); }
        .section-toggle:focus-visible { box-shadow: 0 0 0 2px #C76E3A; }
        /* Body fades/slides in on expand; collapse is instant (the children
           unmount). No overflow clipping, so field tooltips/popovers show. */
        @keyframes sectionBodyIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .section-body-anim { animation: sectionBodyIn 0.2s ease; }
        @media (prefers-reduced-motion: reduce) {
          .section-body-anim { animation: none; }
        }
      `}</style>

      {/* Three-column page grid: a 1fr left gutter holds the sticky section
          index, the centred middle column keeps the content at its existing
          1180px width (the index lives in the margin and never narrows it), and
          a 1fr right gutter balances it. On narrow screens the grid collapses
          to the single content column. */}
      <div style={{ display: isNarrow ? "block" : "grid", gridTemplateColumns: isNarrow ? undefined : "160px minmax(0, 1180px) 1fr" }}>
        {/* Left track: a plain block grid item. It stretches to the full grid
            row height (the form column), giving the sticky index a tall
            containing block. Deliberately NOT a flex container — position:sticky
            on a flex *item* has spotty cross-browser support; as a normal block
            child the nav sticks reliably. The nav right-aligns itself with
            margin-left:auto so it hugs the content's left edge. */}
        {!isNarrow && (
          <div style={{ paddingLeft: "32px" }}>
            {showSectionIndex && renderSectionIndex()}
          </div>
        )}
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: isNarrow ? "24px 20px 40px" : "32px 40px 60px 8px" }}>
        {/* The former masthead strip (descriptor line + "PRELIMINARY — NOT
            LEGAL ADVICE" eyebrow + hairline) was removed; the tool content now
            starts directly under the AppShell top bar. The disclaimer function
            lives in the footer ("Preliminary triage only") and the global
            footer disclaimer. The "incident vs. breach" note lives in the rail
            (renderIncidentVsBreachNote). */}

        {/* Two-column shell (collapses to one column on narrow screens).
            Nothing is pinned: the whole page scrolls as one. On desktop the
            rail carries the mode control then the titled counsel notes, all in
            normal document order. */}
        {isNarrow ? (
          <div>
            {!submitted && <div style={{ marginBottom: "32px" }}>{railControls()}</div>}
            {main}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)" }}>
            <div style={{ paddingRight: "40px", minWidth: 0 }}>
              {main}
            </div>
            <div style={{ paddingLeft: "40px", borderLeft: "1px solid rgba(27,42,63,0.18)", minWidth: 0 }}>
              {submitted && renderReviewActionsRail()}
              {!submitted && (
                <>
                  {railControls()}
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "28px" }}>
                    {renderNote("awareness")}
                    {renderNote("q1")}
                    {renderNote("encryption")}
                    {(jurisdictions.eu || jurisdictions.uk) && renderNote("risk")}
                    {anyHarmGated && renderHarmStandardsNote()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <footer style={{ marginTop: "80px", paddingTop: "32px", borderTop: "1px solid rgba(27,42,63,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="section-mark" style={{ opacity: 0.5 }}>Arkidel · Respond</div>
          <button
            onClick={() => setShowTests(true)}
            className="section-mark"
            style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              opacity: 0.5, borderBottom: "1px solid currentColor", color: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.5; }}
          >
            Tests
          </button>
          <div className="section-mark" style={{ opacity: 0.5 }}>Preliminary triage only</div>
        </footer>
      </div>
      </div>
    </div>
  );
}
