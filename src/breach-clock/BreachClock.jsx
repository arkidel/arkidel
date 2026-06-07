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
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Scale, FileWarning, Info, Download, Check, Plus, X } from "lucide-react";
import { JURISDICTIONS } from "./data.js";
import { isHighRisk, computeDeadlines, runTests, TEST_AWARENESS } from "./engine.js";
import { generateMemoPdf } from "./memo-pdf.js";
import usePageTitle from "../usePageTitle.js";

// Engine inputs. Grouped so quick mode (show only these) and the cross-check
// can reference the operative set without re-listing it inline.
const OPERATIVE_KEYS = ["awareness", "jurisdictions", "residentCounts", "sensitivity", "encryption"];

// Collapse the two-column layout below this width (Tailwind `md` = 768px, the
// project's marketing-page mobile breakpoint).
const NARROW_QUERY = "(max-width: 768px)";

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
  { id: "special", label: "Special category (race, religion, sexuality, politics, union)" },
  { id: "credentials", label: "Authentication credentials (passwords, tokens)" },
  { id: "location", label: "Precise geolocation" },
  { id: "communications", label: "Private communications content" },
];

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
  { id: "special", label: "Sensitive/Special-category data (e.g., information about health, race, ethnicity, religion, sexual orientation or sexual life, political or philosophical opinions, trade union membership)", tag: "special" },
];

// Q1 category label for each cross-check tag — used in the warning text.
const TAG_TO_Q1_LABEL = {
  gov_id: "Government IDs",
  financial: "Financial",
  health: "Health or medical information",
  special: "Special category",
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

  // ── Operative state (feeds the engine) — unchanged from the wizard ──
  const [awareness, setAwareness] = useState("");
  const [jurisdictions, setJurisdictions] = useState(
    () => Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false]))
  );
  const [residentCounts, setResidentCounts] = useState(
    () => Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""]))
  );
  const [sensitivity, setSensitivity] = useState([]);
  const [encryptionApplied, setEncryptionApplied] = useState(false);

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
  const highRiskPresent = isHighRisk(sensitivity);

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
  const { deadlines, suppressed } = computeDeadlines({
    awarenessDate,
    jurisdictions,
    residentCounts,
    sensitivity,
    encryptionApplied,
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
        encryptionApplied,
        riskLevel,
        incidentReport: quickMode ? null : buildIncidentReportSections(),
      };
      const pdfBytes = await generateMemoPdf(facts, deadlines, suppressed);
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
    if (!canCompute) return;
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEdit = () => {
    setSubmitted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "60px 40px" }}>
          <header style={{ marginBottom: "48px", borderBottom: "1px solid rgba(27,42,63,0.18)", paddingBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "32px" }}>
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
                }}
              >
                ← Back to Respond
              </button>
            </div>
            <h1 className="serif" style={{ fontSize: "36px", margin: 0, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, color: "#1B2A3F" }}>
              Rules Engine Tests
            </h1>
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
      <span className="section-mark">{text}</span>
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

  const sectionHeading = (num, title, tooltip) => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
      <span className="mono" style={{ fontSize: "13px", color: "#1B2A3F", opacity: 0.55 }}>{num}</span>
      <h2 className="serif" style={{ fontSize: "24px", fontWeight: 400, margin: 0, color: "#1B2A3F", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {tooltip && <InfoTip text={tooltip} size={15} />}
      <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
    </div>
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
    return null;
  };

  // Each note carries a title connecting it to the topic it annotates — the
  // notes flow in document order rather than aligning to their fields, so the
  // title is what carries the connection.
  const NOTE_TITLES = {
    awareness: "Awareness",
    q1: "Data categories",
    encryption: "Encryption",
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
                    <label className="section-mark" style={{ display: "block", marginBottom: "8px" }}>{jur.residentField.stateLabel}</label>
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

  const renderEncryption = () => (
    <div style={{ marginBottom: "24px" }}>
      {labelRow("Was the compromised data encrypted, with an uncompromised key?")}
      {checkRow(
        encryptionApplied,
        "The compromised data was encrypted, and the encryption key was not also compromised.",
        () => setEncryptionApplied(!encryptionApplied)
      )}
      {isNarrow && <div style={{ marginTop: "14px" }}>{renderNote("encryption")}</div>}
    </div>
  );

  // ── Deadline obligations (the analysis; shown only on the review) ──
  const renderObligations = () => (
    <>
      {deadlines.length === 0 && suppressed.length > 0 && (
        <div style={{ marginBottom: "16px", padding: "24px 28px", background: "#5A6E4A", color: "#FAF8F2", borderRadius: "12px" }}>
          <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>Result</div>
          <div className="serif" style={{ fontSize: "24px", fontWeight: 400, lineHeight: 1.2 }}>
            No notification obligations fire under the facts provided.
          </div>
          <p style={{ fontSize: "14px", marginTop: "12px", opacity: 0.9, lineHeight: 1.6 }}>
            Based on the encryption fact reported, every obligation that would otherwise apply has been suppressed — either because the breach falls outside the statutory definition (U.S. states) or because individual notification is exempted by an unintelligibility-of-data provision (EU/UK GDPR Art. 34(3)(a)). Confirm encryption met each jurisdiction's standard before relying on this analysis.
          </p>
        </div>
      )}

      {deadlines.length === 0 && suppressed.length === 0 && (
        <div style={{ marginBottom: "16px", padding: "24px 28px", background: "#1B2A3F", color: "#FAF8F2", borderRadius: "12px" }}>
          <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>No deadlines computed</div>
          <p style={{ fontSize: "14px", marginTop: "8px", opacity: 0.9, lineHeight: 1.6 }}>
            No obligations fire under the inputs provided. Verify your jurisdiction selections and resident counts.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "16px" }}>
        {deadlines.map((d, i) => {
          const timeRemaining = d.deadline ? d.deadline.getTime() - now.getTime() : null;
          const isMissed = timeRemaining !== null && timeRemaining < 0;
          const isUrgent = timeRemaining !== null && timeRemaining > 0 && timeRemaining < 24 * 3600 * 1000;
          return (
            <div key={i} className={`deadline-card ${isMissed ? "missed" : isUrgent ? "urgent" : ""}`}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "32px", alignItems: "start" }}>
                <div>
                  <div className="section-mark" style={{ marginBottom: "10px" }}>{d.jurisdiction}</div>
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
        })}
      </div>

      {(() => {
        const selectedJurs = JURISDICTIONS.filter((j) => jurisdictions[j.id] && j.counselNotes && j.counselNotes.length > 0);
        if (selectedJurs.length === 0) return null;
        return (
          <div style={{ marginTop: "40px" }}>
            <div className="section-mark" style={{ marginBottom: "16px" }}>Jurisdictional notes</div>
            <div style={{ display: "grid", gap: "12px" }}>
              {selectedJurs.flatMap((jur) =>
                jur.counselNotes.map((note) => (
                  <aside key={note.id} style={{ background: "#fff", color: "#2C2418", padding: "20px 24px", borderLeft: "4px solid #E8DDC4", borderRadius: "0 12px 12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", color: "#1B2A3F" }}>
                      <Info size={14} />
                      <div className="section-mark" style={{ opacity: 1 }}>{jur.short}</div>
                    </div>
                    <div className="serif" style={{ fontSize: "18px", fontWeight: 400, lineHeight: 1.3, marginBottom: "10px", letterSpacing: "-0.005em" }}>
                      {note.title}
                    </div>
                    <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 10px" }}>{note.content}</p>
                    {note.citation && (
                      <div className="mono" style={{ fontSize: "11px", opacity: 0.7 }}>
                        {note.citation}
                        {note.source_url && (
                          <>
                            {" — "}
                            <a href={note.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#1B2A3F", textDecoration: "underline" }}>
                              primary source
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </aside>
                ))
              )}
            </div>
          </div>
        );
      })()}

      {suppressed.length > 0 && (
        <div style={{ marginTop: "40px" }}>
          <div className="section-mark" style={{ marginBottom: "16px" }}>
            Notification likely not required — encryption suppression
          </div>
          <div style={{ display: "grid", gap: "12px" }}>
            {suppressed.map((s, i) => (
              <div key={i} style={{ background: "#fff", borderLeft: "4px solid #5A6E4A", padding: "20px 24px", borderRadius: "0 12px 12px 0" }}>
                <div className="section-mark" style={{ marginBottom: "8px" }}>{s.jurisdiction}</div>
                <div className="serif" style={{ fontSize: "20px", fontWeight: 400, lineHeight: 1.2, marginBottom: "10px", letterSpacing: "-0.01em" }}>
                  {s.authority}
                </div>
                <div className="mono" style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
                  {s.original_citation} → {s.suppression_citation} ({s.suppression_type === "breach_definition" ? "no breach as defined" : "notification exempted by unintelligibility"})
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
            ))}
          </div>
        </div>
      )}
    </>
  );

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
        </section>
      ) : (
        <>
          {/* 1. General information */}
          <section style={{ marginBottom: "56px" }}>
            {sectionHeading("01", "General Information")}
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
          </section>

          {/* 2. How & when discovered */}
          <section style={{ marginBottom: "56px" }}>
            {sectionHeading("02", "How & When Discovered")}
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
          </section>

          {/* 3. When the incident occurred */}
          <section style={{ marginBottom: "56px" }}>
            {sectionHeading("03", "When the Incident Occurred", "The actual date and time the incident took place, as opposed to when someone in your organization became aware of it.")}
            <div style={{ marginBottom: "20px" }}>
              {checkRow(record.occurrenceNotAvailable, "Information not available", () => updateRecord("occurrenceNotAvailable", !record.occurrenceNotAvailable))}
            </div>
            <div style={{ opacity: record.occurrenceNotAvailable ? 0.45 : 1, pointerEvents: record.occurrenceNotAvailable ? "none" : "auto" }}>
              {field("Occurrence date", null, <input type="date" className="form-input" value={record.occurrenceDate} onChange={(e) => updateRecord("occurrenceDate", e.target.value)} disabled={record.occurrenceNotAvailable} style={{ maxWidth: "280px" }} />)}
              {field("Exact time (incl. time zone)", null, <input className="form-input" value={record.occurrenceTime} onChange={(e) => updateRecord("occurrenceTime", e.target.value)} disabled={record.occurrenceNotAvailable} placeholder="e.g. 14:30 ET" style={{ maxWidth: "280px" }} />)}
              {field("Additional detail", null, <textarea className="form-textarea" value={record.occurrenceDetail} onChange={(e) => updateRecord("occurrenceDetail", e.target.value)} disabled={record.occurrenceNotAvailable} />)}
            </div>
          </section>

          {/* 4. Incident summary */}
          <section style={{ marginBottom: "56px" }}>
            {sectionHeading("04", "Incident Summary")}
            {field(
              "Summary of the incident",
              "Write a descriptive summary in your own words. The more detail, the better.",
              <textarea className="form-textarea" style={{ minHeight: "120px" }} value={record.incidentSummary} onChange={(e) => updateRecord("incidentSummary", e.target.value)} />
            )}
          </section>

          {/* 5. Data affected */}
          <section style={{ marginBottom: "56px" }}>
            {sectionHeading("05", "Data Affected")}
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
          </section>

          {/* 6. Measures */}
          <section style={{ marginBottom: "56px" }}>
            {sectionHeading("06", "Measures")}
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
          </section>
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
        <div className="section-mark" style={{ paddingTop: "2px" }}>{label}</div>
        <div style={{ fontSize: "15px", lineHeight: 1.55 }}>{value}</div>
      </React.Fragment>
    );
    return (
      <>
        {/* Artifact controls — top of the review content so they're visible on
            submit without scrolling; nothing is pinned, so they scroll away. */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={handleDownloadMemo} style={{ justifyContent: "center" }}>
            <Download size={14} /> Download memo
          </button>
          <button className="btn-ghost" onClick={handleEdit} style={{ justifyContent: "center" }}>
            <ArrowLeft size={14} /> Edit answers
          </button>
        </div>

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
            {recapRow("Encryption", encryptionApplied ? "Applied — suppression evaluated" : "Not reported")}
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
      `}</style>

      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: isNarrow ? "40px 20px" : "60px 40px" }}>
        {/* Header */}
        <header style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "16px" }}>
            <h1
              className="serif"
              style={{
                margin: 0,
                fontWeight: 400,
                fontSize: "18px",
                background: "#1B2A3F",
                color: "#E8DDC4",
                padding: "7px 20px",
                borderRadius: "999px",
                letterSpacing: "0.01em",
                display: "inline-block",
              }}
            >
              Respond
            </h1>
            <span className="section-mark">Preliminary — Not Legal Advice</span>
          </div>
          <p style={{ fontSize: "15px", marginTop: "12px", maxWidth: "640px", lineHeight: 1.6, fontWeight: 400, color: "#2C2418" }}>
            A triage tool that helps you record incident details, calculate deadlines, and produce an audit-ready memo
          </p>
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
              {!submitted && (
                <>
                  {railControls()}
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "28px" }}>
                    {renderNote("awareness")}
                    {renderNote("q1")}
                    {renderNote("encryption")}
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
  );
}
