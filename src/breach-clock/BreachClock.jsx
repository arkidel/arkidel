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

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Scale, FileWarning, Info, Download, Check, Plus, X, ChevronDown } from "lucide-react";
import { JURISDICTIONS } from "./data.js";
import { isHighRisk, computeDeadlines, runTests, TEST_AWARENESS } from "./engine.js";
import { groupResultsByJurisdiction } from "./results-grouping.js";
import { generateMemoPdf } from "./memo-pdf.js";
import usePageTitle from "../usePageTitle.js";

// Engine inputs. Grouped so quick mode (show only these) and the cross-check
// can reference the operative set without re-listing it inline.
const OPERATIVE_KEYS = ["awareness", "jurisdictions", "residentCounts", "sensitivity", "encryption"];

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
// only renders for an EU/UK jurisdiction). Drives Expand all / Collapse all;
// setting form-risk open while it isn't rendered is harmless.
const ALL_SECTION_IDS = [...FORM_SECTIONS.map((s) => s.id), "form-risk"];

// The global top nav (src/components/Layout.jsx) is position:static — it scrolls
// away with the page rather than staying fixed — so the sticky index only needs
// a small breathing-room offset, not full nav-height clearance. The same value
// is the sections' scroll-margin-top so a jumped-to heading isn't flush to the
// viewport edge. (If that nav is ever made sticky, bump this to ~its height.)
const NAV_CLEARANCE = 32;

// Q1 personal-data categories — these ARE the engine `sensitivity` input; IDs
// must match what engine.js treats as high-risk. location/communications are
// kept for record completeness; the engine ignores ids outside its high-risk set.
const SENSITIVITY_OPTIONS = [
  { id: "identifiers", label: "Identifiers (name, email, address)" },
  { id: "gov_id", label: "Government IDs (SSN, passport, driver's license)" },
  { id: "financial", label: "Financial (account, card, credentials)" },
  { id: "health", label: "Health or medical information" },
  { id: "biometric", label: "Biometric or genetic data" },
  { id: "children", label: "Data concerning children" },
  { id: "special", label: "Other sensitive / special-category data", desc: "e.g., racial or ethnic origin, political opinions, religious or philosophical beliefs, trade-union membership, sex life or sexual orientation" },
  { id: "credentials", label: "Authentication credentials (passwords, tokens)" },
  { id: "location", label: "Precise geolocation" },
  { id: "communications", label: "Private communications content" },
];

// EU/UK risk-assessment levels — the operative `riskLevel` input. The value
// strings match what engine.js gates on (riskRequired → "risk"|"high";
// highRiskRequired → "high"; "" = unset → pending). Shared by the on-screen
// control (renderRiskAssessment) and the review recap.
const RISK_OPTIONS = [
  { value: "unlikely", label: "Unlikely to result in a risk", desc: "No notification required. Document the assessment under Art. 33(5)." },
  { value: "risk", label: "Likely to result in a risk", desc: "Notify the supervisory authority within 72 hours. No individual notification." },
  { value: "high", label: "Likely to result in a high risk", desc: "Notify the authority within 72 hours and affected data subjects without undue delay." },
];

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

export default function BreachClock() {
  usePageTitle("Respond");
  const [showTests, setShowTests] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
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
  const [jurisdictions, setJurisdictions] = useState(
    () => Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false]))
  );
  const [residentCounts, setResidentCounts] = useState(
    () => Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""]))
  );
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

  // ── Record state (incident report only; never seen by the engine) ──
  const [record, setRecord] = useState(() => ({ ...EMPTY_RECORD, dataSubjectBlocks: [makeBlock()] }));

  const [riskLevel, setRiskLevel] = useState("");
  const [now, setNow] = useState(new Date());
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
  const indexSections = [
    ...FORM_SECTIONS,
    ...((jurisdictions.eu || jurisdictions.uk) ? [{ id: "form-risk", label: "Risk" }] : []),
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
  }, [showSectionIndex, jurisdictions.eu, jurisdictions.uk]);

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

  const toggleJurisdiction = (k) => setJurisdictions({ ...jurisdictions, [k]: !jurisdictions[k] });
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

  const parseAwareness = () => {
    if (!awareness) return null;
    const d = new Date(awareness);
    return isNaN(d.getTime()) ? null : d;
  };
  const awarenessDate = parseAwareness();

  const formatDuration = (ms) => {
    const neg = ms < 0;
    const abs = Math.abs(ms);
    const totalSec = Math.floor(abs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    parts.push(`${hours.toString().padStart(2, "0")}h`);
    parts.push(`${mins.toString().padStart(2, "0")}m`);
    parts.push(`${secs.toString().padStart(2, "0")}s`);
    return (neg ? "−" : "") + parts.join(" ");
  };

  // ── Deadlines — same pure engine the test harness calls ──
  // riskLevel feeds the EU/UK risk gating; `pending` carries the GDPR
  // obligations awaiting a risk assessment (neither fired nor suppressed). An
  // unset assessment surfaces as a pending result, so it is deliberately NOT
  // part of canCompute / the submit gate below.
  // `review` (Stage 2 quad-state bucket) carries obligations whose outcome turns
  // on a substantive legal judgment the engine does not make. Empty until Stage 4
  // routes the MA second-trigger here.
  const { deadlines, suppressed, pending, review } = computeDeadlines({
    awarenessDate,
    jurisdictions,
    residentCounts,
    sensitivity,
    encrypted,
    encryptionStrength,
    redacted,
    keyAcquired,
    reidentificationAcquired,
    gdprUnintelligibility,
    riskLevel,
  });

  // ── Minimal operative inputs required to submit (mirrors the old canAdvance) ──
  const hasAwareness = !!awarenessDate && awarenessDate <= now;
  const hasJurisdiction = anyJurisdiction;
  const hasSensitivity = sensitivity.length > 0;
  const canCompute = hasAwareness && hasJurisdiction && hasSensitivity;

  const missingInputs = [];
  if (!hasAwareness) missingInputs.push("the date & time of awareness");
  if (!hasJurisdiction) missingInputs.push("at least one affected jurisdiction");
  if (!hasSensitivity) missingInputs.push("at least one type of personal data involved");

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
      const facts = {
        awarenessDate,
        jurisdictions,
        residentCounts,
        sensitivity,
        sensitivityLabels: sensitivityLabelsForMemo,
        encryptionSummary: encryptionRecap,
        riskLevel,
        incidentReport: quickMode ? null : buildIncidentReportSections(),
      };
      const pdfBytes = await generateMemoPdf(facts, deadlines, suppressed, review);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateForFilename = (awarenessDate || new Date()).toISOString().slice(0, 10);
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

  const handleSubmit = () => {
    setAttemptedSubmit(true);
    if (!canCompute) {
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
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEdit = () => {
    setSubmitted(false);
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
              Each case feeds a fact pattern to the deadline engine and asserts what should or should not fire. Run automatically every time this page loads.
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
      style={{ position: "sticky", top: `${NAV_CLEARANCE}px`, width: "104px", marginLeft: "auto", marginRight: "24px", paddingTop: "32px" }}
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
      <input
        type="datetime-local"
        className="form-input"
        value={awareness}
        onChange={(e) => setAwareness(e.target.value)}
        max={new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
        style={{ maxWidth: "340px" }}
      />
      {isNarrow && <div style={{ marginTop: "14px" }}>{renderNote("awareness")}</div>}
    </div>
  );

  const renderJurisdictionsField = () => {
    const visibleCounts = JURISDICTIONS.filter((j) => j.residentField && jurisdictions[j.id]);
    return (
      <div style={{ marginBottom: "24px" }}>
        {labelRow("Which jurisdictions' residents are affected?")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px" }}>
          {JURISDICTIONS.map((jur) => (
            <div key={jur.id}>{checkRow(jurisdictions[jur.id], jur.name, () => toggleJurisdiction(jur.id), { sub: jur.statute })}</div>
          ))}
        </div>
        {visibleCounts.length > 0 && (
          <div style={{ marginTop: "20px", padding: "22px", border: "1px solid rgba(27,42,63,0.18)", background: "#fff", borderRadius: "12px" }}>
            {labelRow("Residents affected — statutory-threshold count", "The number of this jurisdiction's residents whose data was affected. Used to test statutory notification thresholds — distinct from the per-category data-subject counts below.")}
            <div style={{ display: "grid", gridTemplateColumns: visibleCounts.length === 1 ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "24px", marginTop: "4px" }}>
              {visibleCounts.map((jur) => {
                const thresholdObligations = jur.obligations.filter((o) => o.gating?.residentThreshold !== undefined);
                return (
                  <div key={jur.id}>
                    <label className="field-mark" style={{ display: "block", marginBottom: "8px" }}>{jur.residentField.stateLabel}</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder={jur.residentField.placeholder || ""}
                      value={residentCounts[jur.id] || ""}
                      onChange={(e) => setResidentCounts({ ...residentCounts, [jur.id]: e.target.value })}
                    />
                    {thresholdObligations.length > 0 && (
                      <div className="rule-text" style={{ marginTop: "8px" }}>
                        {thresholdObligations.map((o, idx) => {
                          const t = o.gating.residentThreshold;
                          const cmp = o.gating.comparator || "gte";
                          const phrase = cmp === "gt" ? `>${t.toLocaleString()}` : `${t.toLocaleString()}+`;
                          return (
                            <div key={idx}>
                              {phrase} triggers {o.thresholdLabel || `${o.authority} notification`}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderQ1 = () => (
    <div style={{ marginBottom: "24px" }}>
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
                  padding: "2px 8px", borderRadius: "999px",
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

  // ── Deadline obligations (the analysis; shown only on the review) ──
  const renderObligations = () => {
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
    const greenBanner =
      riskSuppressed && !encryptionSuppressed
        ? {
            headline: "No notification obligations fire under the risk assessment provided.",
            body: "The breach was assessed as not meeting the notification threshold; document the assessment and the reasoning.",
          }
        : encryptionSuppressed && !riskSuppressed
        ? {
            headline: "No notification obligations fire under the facts provided.",
            body: "Based on the encryption fact reported, every obligation that would otherwise apply has been suppressed — either because the breach falls outside the statutory definition (U.S. states) or because individual notification is exempted by an unintelligibility-of-data provision (EU/UK GDPR Art. 34(3)(a)). Confirm encryption met each jurisdiction's standard before relying on this analysis.",
          }
        : {
            headline: "No notification obligations fire under the facts provided.",
            body: "Every obligation that would otherwise apply has been suppressed — by the encryption fact reported and/or the risk assessment. See the bases below.",
          };

    // ── Jurisdiction-first grouping (presentation only; engine output unmoved) ──
    // The shared helper regroups the flat engine buckets into one block per
    // jurisdiction. `pending` is deliberately NOT grouped — it stays the
    // consolidated banner above, so a pending-only jurisdiction yields no block.
    // blockSections() returns each block's non-empty card-type groups in the
    // shared within-block order (the order knob lives in results-grouping.js).
    const groups = groupResultsByJurisdiction({ deadlines, suppressed, review, jurisdictions });

    // Card renderers — markup IDENTICAL to the former outcome-first sections,
    // only relocated into the per-jurisdiction blocks. No copy or style change.
    const renderActiveCard = (d, i, blockActive, extraStyle) => {
      const timeRemaining = d.deadline ? d.deadline.getTime() - now.getTime() : null;
      const isMissed = timeRemaining !== null && timeRemaining < 0;
      const isUrgent = timeRemaining !== null && timeRemaining > 0 && timeRemaining < 24 * 3600 * 1000;
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
        <div key={i} className={`deadline-card ${isMissed ? "missed" : isUrgent ? "urgent" : ""}`} style={extraStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "start" }}>
            <div>
              <div className="serif" style={{ fontSize: "26px", fontWeight: 400, lineHeight: 1.15, marginBottom: "12px", letterSpacing: "-0.01em" }}>
                Notify {d.authority}
              </div>
              <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>{d.basis}</div>
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
              {d.deadline ? (
                <>
                  <div className="section-mark" style={{ marginBottom: "6px" }}>
                    {isMissed ? "Overdue by" : "Time remaining"}
                  </div>
                  <div className="mono" style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em" }}>
                    {formatDuration(timeRemaining)}
                  </div>
                  <div className="mono" style={{ fontSize: "11px", opacity: 0.6, marginTop: "6px" }}>
                    Due {d.deadline.toLocaleString()}
                  </div>
                  {depLabel && (
                    <div className="mono" style={{ fontSize: "11px", opacity: 0.6, marginTop: "4px", maxWidth: "200px", marginLeft: "auto" }}>
                      ({depLabel}; date assumes they're notified on their deadline)
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", border: "1px solid currentColor" }}>
                  <AlertTriangle size={14} />
                  <div className="section-mark">No fixed hour deadline</div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

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

    const renderReviewCard = (r, i, extraStyle) => (
      <div key={i} style={{ background: "#fff", borderLeft: "4px solid #9FAEC2", padding: "20px 24px", borderRadius: "0 12px 12px 0", boxShadow: "0 2px 8px rgba(27,42,63,0.10)", ...extraStyle }}>
        <div className="serif" style={{ fontSize: "20px", fontWeight: 400, lineHeight: 1.2, marginBottom: "10px", letterSpacing: "-0.01em" }}>
          {r.authority}
        </div>
        {r.review_citation && (
          <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
            {r.original_citation ? `${r.original_citation} → ` : ""}{r.review_citation}
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
    const renderParchmentPanel = ({ key, notes, eyebrow, perNoteLead, lapEdge, marginTop, zIndex = 0 }) => (
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
          paddingBottom: lapEdge === "bottom" ? "8px" : undefined,
          position: "relative",
          zIndex,
        }}
      >
        {notes.map(({ jurShort, note }, i) => (
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
            <div className="serif" style={{ fontSize: "17px", fontWeight: 400, lineHeight: 1.3, marginBottom: "8px", letterSpacing: "-0.005em", color: "#2C2418" }}>
              {note.title}
            </div>
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
          </div>
        ))}
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
        out.push(renderParchmentPanel({ key: "caveat", notes: block.caveatNotes, eyebrow: "Pre-Notification Considerations", lapEdge: "bottom", marginTop: 16 }));
      }
      block.obligations.forEach((ob, idx) => {
        const first = idx === 0;
        const cardStyle = { marginTop: first ? (hasCaveat ? "-16px" : "16px") : "16px", position: "relative", zIndex: 1 };
        out.push(
          ob.role === "active"
            ? renderActiveCard(ob.card, `ob-${idx}`, block.activeCards, cardStyle)
            : renderReviewCard(ob.card, `ob-${idx}`, cardStyle)
        );
        ob.parallelNotes.forEach((pn, j) =>
          out.push(renderParchmentPanel({ key: `par-${idx}-${j}`, notes: [pn], perNoteLead: PARALLEL_LEAD, lapEdge: "top", marginTop: -16 }))
        );
      });
      if (block.suppressedCards.length > 0) {
        out.push(<div key="sup-label" className="section-mark" style={{ margin: "24px 0 12px" }}>Notification likely not required</div>);
        block.suppressedCards.forEach((s, i) =>
          out.push(<div key={`sup-${i}`} style={{ marginTop: i === 0 ? 0 : "12px" }}>{renderSuppressedCard(s, i)}</div>)
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

      {!hasPending && review.length === 0 && deadlines.length === 0 && suppressed.length > 0 && (
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

      {!hasPending && review.length === 0 && deadlines.length === 0 && suppressed.length === 0 && (
        <div style={{ marginBottom: "16px", padding: "24px 28px", background: "#1B2A3F", color: "#FAF8F2", borderRadius: "12px" }}>
          <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>No deadlines computed</div>
          <p style={{ fontSize: "14px", marginTop: "8px", opacity: 0.9, lineHeight: 1.6 }}>
            No obligations fire under the inputs provided. Verify your jurisdiction selections and resident counts.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "44px", marginTop: "16px" }}>
        {groups.map((block) => (
          <div key={block.jurisdictionId}>
            <div style={{ borderBottom: "1px solid rgba(27,42,63,0.12)", paddingBottom: "10px", marginBottom: "4px" }}>
              <div className="serif" style={{ fontSize: "22px", fontWeight: 400, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{block.name}</div>
              <div className="mono" style={{ fontSize: "12px", opacity: 0.6, marginTop: "4px" }}>{block.statuteSubtitle}</div>
            </div>
            {renderBlock(block)}
          </div>
        ))}
      </div>
    </>
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

  // ─────────────────────────────────────────────────────────────────────────
  // Form (full or quick) — rendered in the main column.
  // ─────────────────────────────────────────────────────────────────────────
  const renderForm = () => (
    <>
      {quickMode ? (
        <section style={{ marginBottom: "40px" }}>
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
        </section>
      ) : (
        <>
          {/* Quiet, understated expand/collapse-all control above the section
              list. Always visible (the left index only renders on wide screens),
              so it's the reliable global control on every width. */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <button type="button" className="btn-link" onClick={expandAll}>Expand all</button>
            <span style={{ opacity: 0.3, color: "#1B2A3F", userSelect: "none" }}>·</span>
            <button type="button" className="btn-link" onClick={collapseAll}>Collapse all</button>
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
        </>
      )}

      {/* Submit */}
      {attemptedSubmit && !canCompute && (
        <div role="alert" style={{ marginBottom: "20px", padding: "16px 20px", background: "#FBF5EE", borderLeft: "4px solid #C76E3A", borderRadius: "0 12px 12px 0" }}>
          <div className="section-mark" style={{ color: "#C76E3A", opacity: 1, marginBottom: "8px" }}>Before submitting</div>
          <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 8px", color: "#2C2418" }}>
            To compute notification requirements and timing, provide:
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", lineHeight: 1.7, color: "#2C2418" }}>
            {missingInputs.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <button className="btn-primary" onClick={handleSubmit}>
          Submit &amp; compute deadlines <ArrowRight size={14} />
        </button>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Review (read-only) — rendered in the main column after a valid Submit.
  // ─────────────────────────────────────────────────────────────────────────
  const renderReview = () => {
    const reportSections = quickMode ? [] : buildIncidentReportSections();
    const recapRow = (label, value) => (
      <React.Fragment key={label}>
        <div className="field-mark" style={{ paddingTop: "2px" }}>{label}</div>
        <div style={{ fontSize: "15px", lineHeight: 1.55 }}>{value}</div>
      </React.Fragment>
    );
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

        {crossCheckBanner()}

        {/* Analysis inputs recap */}
        <div className="section-mark" style={{ marginBottom: "14px" }}>Analysis inputs</div>
        <div style={{ border: "1px solid rgba(27,42,63,0.18)", background: "#fff", padding: "24px 28px", marginBottom: "36px", borderRadius: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr", gap: "16px 28px" }}>
            {recapRow("Awareness", awarenessDate ? awarenessDate.toLocaleString() : "—")}
            {recapRow(
              "Jurisdictions",
              JURISDICTIONS.filter((j) => jurisdictions[j.id]).map((j) => {
                const c = residentCounts[j.id];
                const suffix = j.residentField && c ? ` (${fmtCount(c)} residents)` : "";
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

        {/* Computed obligations */}
        <div className="section-mark" style={{ marginBottom: "16px" }}>
          {deadlines.length > 0 ? "Notification deadlines" : "Analysis"}
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
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
        <button className="btn-primary" onClick={handleDownloadMemo} style={{ width: "100%", justifyContent: "center" }}>
          <Download size={14} /> Download memo
        </button>
        <button className="btn-ghost" onClick={handleEdit} style={{ width: "100%", justifyContent: "center" }}>
          <ArrowLeft size={14} /> Edit answers
        </button>
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
        .btn-ghost:hover { background: #1B2A3F; color: #FAF8F2; }
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
      <div style={{ display: isNarrow ? "block" : "grid", gridTemplateColumns: isNarrow ? undefined : "1fr minmax(0, 1180px) 1fr" }}>
        {/* Left track: a plain block grid item. It stretches to the full grid
            row height (the form column), giving the sticky index a tall
            containing block. Deliberately NOT a flex container — position:sticky
            on a flex *item* has spotty cross-browser support; as a normal block
            child the nav sticks reliably. The nav right-aligns itself with
            margin-left:auto so it hugs the content's left edge. */}
        {!isNarrow && (
          <div>
            {showSectionIndex && renderSectionIndex()}
          </div>
        )}
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: isNarrow ? "24px 20px 40px" : "32px 40px 60px" }}>
        {/* Header */}
        <header style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "24px" }}>
            <p style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", fontSize: "14px", color: "#2C2418", maxWidth: "640px", lineHeight: 1.5 }}>
              A triage tool that helps you record incident details, calculate deadlines, and produce an audit-ready memo
            </p>
            <span className="section-mark">Preliminary — Not Legal Advice</span>
          </div>
        </header>

        {/* Single hairline between the masthead and the form. The
            "incident vs. breach" note moved into the rail (renderIncidentVsBreachNote). */}
        <div style={{ borderTop: "1px solid rgba(27,42,63,0.18)", marginBottom: "36px" }} />

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
