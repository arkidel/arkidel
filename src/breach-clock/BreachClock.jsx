// =============================================================================
// BREACH CLOCK — unified incident form (single React component).
//
// One form, not a step wizard. The five engine-driving inputs (awareness;
// jurisdictions + resident counts; Q1 personal-data types; encryption) are
// ordinary fields interspersed with incident-record fields. The form produces
// the existing deadline analysis (live, surfaced at the top) and — in full
// mode — feeds a new "Incident report" section into the downloadable PDF.
//
// Operative vs. record. Five inputs feed the engine; they're grouped under the
// OPERATIVE_KEYS flag below so quick mode and the Q1/Q2 cross-check can target
// them. They are NOT labeled "required/operative" in the default full view —
// the form prompts for what's missing rather than badging fields. Everything
// else is a record field: captured into the incident report, never seen by the
// engine.
//
// Quick mode is a focusing view, not a separate workflow: one shared state,
// toggling only hides/shows sections, entered data persists both ways. When on,
// only the operative fields and the deadline result show.
//
// Engine wiring is unchanged. computeDeadlines / isHighRisk and the five inputs
// (awarenessDate, jurisdictions, residentCounts, sensitivity, encryptionApplied)
// keep the exact interface they had in the wizard — this file relocates the
// fields and reuses the same state/handlers. Substantive legal changes still
// belong in data.js, never here. Verify the engine with the in-app Tests view
// (footer link) after any change near the wiring.
// =============================================================================

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Scale, FileWarning, Info, Download } from "lucide-react";
import { JURISDICTIONS } from "./data.js";
import { isHighRisk, computeDeadlines, runTests, TEST_AWARENESS } from "./engine.js";
import { generateMemoPdf } from "./memo-pdf.js";
import usePageTitle from "../usePageTitle.js";

// Engine inputs. Grouped so quick mode (show only these) and the cross-check
// can reference the operative set without re-listing it inline. Not surfaced to
// the user as a label — see the module header.
const OPERATIVE_KEYS = ["awareness", "jurisdictions", "residentCounts", "sensitivity", "encryption"];

// Q1 personal-data categories — these ARE the engine `sensitivity` input; IDs
// must match what engine.js treats as high-risk. The two non-high-risk extras
// (location, communications) are kept for record completeness; the engine
// ignores any id outside its HIGH_RISK_CATEGORIES set.
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

// Q2 data-subject categories. Each tagged data type rolls up (via `tag`) to a
// Q1 sensitivity category — the cross-check warns when a tag is selected here
// whose Q1 category is not. Only gov_id / financial / health / special /
// credentials are reachable from Q2; biometric and children are Q1-only.
const DATA_SUBJECT_CATEGORIES = [
  { id: "customers", label: "Customers" },
  { id: "employees", label: "Employees & temp workers" },
  { id: "visitors", label: "Website & social visitors" },
  { id: "other", label: "Other category" },
];

const CUSTOMER_DATA_TYPES = [
  { id: "name", label: "Name" },
  { id: "dob", label: "Date of birth" },
  { id: "contact", label: "Contact details" },
  { id: "gov_id", label: "Government ID", tag: "gov_id" },
  { id: "financial", label: "Payment/financial", tag: "financial" },
  { id: "special", label: "Special-category", tag: "special" },
];

const EMPLOYEE_DATA_TYPES = [
  { id: "name", label: "Name" },
  { id: "contact", label: "Contact details" },
  { id: "gov_id", label: "Government ID", tag: "gov_id" },
  { id: "financial", label: "Payroll/bank", tag: "financial" },
  { id: "health", label: "Health/sick-leave", tag: "health" },
  { id: "performance", label: "Performance/disciplinary" },
  { id: "credentials", label: "Credentials", tag: "credentials" },
  { id: "special", label: "Special-category", tag: "special" },
];

const VISITOR_DATA_TYPES = [
  { id: "ip", label: "IP address" },
  { id: "profile", label: "Profile details" },
  { id: "message", label: "Message contents" },
  { id: "engagement", label: "Engagement" },
  { id: "analytics", label: "Analytics/demographics" },
];

// Q1 category label for each Q2 tag — used in the cross-check warning text.
const TAG_TO_Q1_LABEL = {
  gov_id: "Government IDs",
  financial: "Financial",
  health: "Health or medical information",
  special: "Special category",
  credentials: "Authentication credentials",
};

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
  // 5. Data affected — Q2 (record only)
  dataSubjectCategories: [],
  customersCount: "",
  customersDataTypes: [],
  customersOther: "",
  employeesCount: "",
  employeesDataTypes: [],
  employeesOther: "",
  visitorsCount: "",
  visitorsDataTypes: [],
  visitorsOther: "",
  otherLabel: "",
  otherCount: "",
  otherDataAffected: "",
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

export default function BreachClock() {
  usePageTitle("Breach Clock");
  const [showTests, setShowTests] = useState(false);
  const [quickMode, setQuickMode] = useState(false);

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
  const [record, setRecord] = useState(() => ({ ...EMPTY_RECORD }));

  const [riskLevel, setRiskLevel] = useState("");
  const [now, setNow] = useState(new Date());
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const updateRecord = (key, value) => setRecord((r) => ({ ...r, [key]: value }));
  const toggleRecordArray = (key, id) =>
    setRecord((r) => {
      const arr = r[key] || [];
      return { ...r, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });

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

  // ── Minimal operative inputs for a live result (mirrors the old canAdvance) ──
  const hasAwareness = !!awarenessDate && awarenessDate <= now;
  const hasJurisdiction = anyJurisdiction;
  const hasSensitivity = sensitivity.length > 0;
  const canCompute = hasAwareness && hasJurisdiction && hasSensitivity;

  const missingInputs = [];
  if (!hasAwareness) missingInputs.push("the date & time of awareness");
  if (!hasJurisdiction) missingInputs.push("at least one affected jurisdiction");
  if (!hasSensitivity) missingInputs.push("at least one type of personal data involved");

  // ── Q1 ⇄ Q2 cross-check ──
  // Collect Q2 tags that are selected, then flag any whose Q1 category is not.
  const selectedQ2Tags = new Set();
  const collectTags = (catId, types, defs) => {
    if (!record.dataSubjectCategories.includes(catId)) return;
    types.forEach((id) => {
      const def = defs.find((d) => d.id === id);
      if (def?.tag) selectedQ2Tags.add(def.tag);
    });
  };
  collectTags("customers", record.customersDataTypes, CUSTOMER_DATA_TYPES);
  collectTags("employees", record.employeesDataTypes, EMPLOYEE_DATA_TYPES);
  // visitors carry no tagged types.
  const crossCheckMissing = [...selectedQ2Tags].filter((tag) => !sensitivity.includes(tag));

  const sensitivityLabelsForMemo = sensitivity
    .map((s) => SENSITIVITY_OPTIONS.find((o) => o.id === s)?.label)
    .filter(Boolean)
    // Strip trailing parentheticals for the printed memo.
    .map((label) => label.replace(/\s*\([^)]*\)\s*$/, ""));

  const labelsFor = (opts, ids) => ids.map((id) => opts.find((o) => o.id === id)?.label).filter(Boolean);

  // Build the ordered incident-report structure consumed by the PDF generator.
  // Only populated fields survive; "information not available" groups drop out.
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

    // 1. General information
    const incidentTypeLabels = INCIDENT_TYPES.filter((t) => t.id !== "other" && record.incidentTypes.includes(t.id)).map((t) => t.label);
    if (record.incidentTypes.includes("other")) {
      incidentTypeLabels.push(record.incidentTypeOther.trim() ? `Other: ${record.incidentTypeOther.trim()}` : "Other");
    }
    pushGroup("General information", [
      { label: "Incident reference / title", value: record.incidentTitle },
      { label: "Source of incident", value: record.sourceOfIncident },
      { label: "Incident location", value: record.incidentLocation },
      { label: "Department reporting", value: record.departmentReporting },
      { label: "Systems & services impacted", value: record.systemsImpacted, multiline: true },
      { label: "Backups — existence & availability", value: record.backups, multiline: true },
      { label: "Data security principles compromised", value: labelsFor(DATA_PRINCIPLES, record.dataPrinciples).join(", ") },
      { label: "Type of incident", value: incidentTypeLabels.join(", ") },
    ]);

    // 2. How & when discovered
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
    pushGroup("How & when discovered", discovery);

    // 3. When the incident occurred (skip entirely if marked unavailable)
    if (!record.occurrenceNotAvailable) {
      pushGroup("When the incident occurred", [
        { label: "Occurrence date", value: record.occurrenceDate },
        { label: "Exact time (incl. time zone)", value: record.occurrenceTime },
        { label: "Additional detail", value: record.occurrenceDetail, multiline: true },
      ]);
    }

    // 4. Incident summary
    pushGroup("Incident summary", [
      { label: "Summary of the incident", value: record.incidentSummary, multiline: true },
    ]);

    // 5. Data affected — Q2 categories of data subjects (record only)
    const q2 = [];
    if (record.dataSubjectCategories.includes("customers")) {
      q2.push({ label: "Customers — approximate count", value: record.customersCount });
      q2.push({ label: "Customers — data types", value: labelsFor(CUSTOMER_DATA_TYPES, record.customersDataTypes).join(", ") });
      q2.push({ label: "Customers — other", value: record.customersOther });
    }
    if (record.dataSubjectCategories.includes("employees")) {
      q2.push({ label: "Employees & temp workers — count", value: record.employeesCount });
      q2.push({ label: "Employees & temp workers — data types", value: labelsFor(EMPLOYEE_DATA_TYPES, record.employeesDataTypes).join(", ") });
      q2.push({ label: "Employees & temp workers — other", value: record.employeesOther });
    }
    if (record.dataSubjectCategories.includes("visitors")) {
      q2.push({ label: "Website & social visitors — count", value: record.visitorsCount });
      q2.push({ label: "Website & social visitors — data types", value: labelsFor(VISITOR_DATA_TYPES, record.visitorsDataTypes).join(", ") });
      q2.push({ label: "Website & social visitors — other", value: record.visitorsOther });
    }
    if (record.dataSubjectCategories.includes("other")) {
      q2.push({ label: "Other category — label", value: record.otherLabel });
      q2.push({ label: "Other category — count", value: record.otherCount });
      q2.push({ label: "Other category — data affected", value: record.otherDataAffected, multiline: true });
    }
    pushGroup("Data affected — categories of data subjects", q2);

    // 6. Measures
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
        // Quick mode → deadline analysis only. Full mode → include the report.
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

  const reset = () => {
    setQuickMode(false);
    setAwareness("");
    setJurisdictions(Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false])));
    setResidentCounts(Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""])));
    setSensitivity([]);
    setEncryptionApplied(false);
    setRecord({ ...EMPTY_RECORD });
    setRiskLevel("");
    setDownloadError("");
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
                ← Back to Breach Clock
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
      {tooltip && <Info size={13} style={{ color: "#1B2A3F", opacity: 0.5, flexShrink: 0, cursor: "help" }} title={tooltip} aria-label={tooltip} />}
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

  const multiSelect = (options, selectedArr, onToggle, cols = 2) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "10px" }}>
      {options.map((o) => {
        const sel = selectedArr.includes(o.id);
        return (
          <div
            key={o.id}
            className={`checkbox-card ${sel ? "selected" : ""}`}
            onClick={() => onToggle(o.id)}
            style={{ padding: "12px 16px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "14px" }}>{o.label}</div>
                {o.desc && <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "3px", lineHeight: 1.4 }}>{o.desc}</div>}
              </div>
              {sel && <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: "1px" }} />}
            </div>
          </div>
        );
      })}
    </div>
  );

  const toggleCard = (label, checked, onChange, desc) => (
    <div
      className={`checkbox-card ${checked ? "selected" : ""}`}
      onClick={() => onChange(!checked)}
      style={{ padding: "14px 18px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 500 }}>{label}</div>
          {desc && <div style={{ fontSize: "13px", lineHeight: 1.5, opacity: 0.8, marginTop: "4px" }}>{desc}</div>}
        </div>
        {checked && <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: "2px" }} />}
      </div>
    </div>
  );

  const sectionHeading = (num, title, tooltip) => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
      <span className="mono" style={{ fontSize: "13px", color: "#1B2A3F", opacity: 0.55 }}>{num}</span>
      <h2 className="serif" style={{ fontSize: "24px", fontWeight: 400, margin: 0, color: "#1B2A3F", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {tooltip && <Info size={15} style={{ color: "#1B2A3F", opacity: 0.45, flexShrink: 0, cursor: "help" }} title={tooltip} aria-label={tooltip} />}
      <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
    </div>
  );

  // ── Operative field renderers (shared by full + quick mode) ──
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
      <aside style={{ background: "#E8DDC4", color: "#2C2418", padding: "18px 22px", marginTop: "14px", border: "1px solid rgba(27,42,63,0.18)", borderRadius: "12px", maxWidth: "640px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", color: "#1B2A3F" }}>
          <Info size={15} />
          <div className="section-mark" style={{ opacity: 1 }}>Counsel's note</div>
        </div>
        <p style={{ fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
          Under Art. 33 GDPR, the clock starts at <strong>awareness</strong>, not discovery — interpreted as reasonable certainty that a security incident has compromised personal data. Earlier signals (anomalies, suspicions) may begin an investigation period but typically do not yet start the 72-hour clock. If you are uncertain which moment qualifies, document your reasoning and consider using the earliest defensible timestamp.
        </p>
      </aside>
    </div>
  );

  const renderJurisdictionsField = () => {
    const visibleCounts = JURISDICTIONS.filter((j) => j.residentField && jurisdictions[j.id]);
    return (
      <div style={{ marginBottom: "24px" }}>
        {labelRow("Which jurisdictions' residents are affected?")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
          {JURISDICTIONS.map((jur) => (
            <div
              key={jur.id}
              className={`checkbox-card ${jurisdictions[jur.id] ? "selected" : ""}`}
              onClick={() => toggleJurisdiction(jur.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "20px", fontWeight: 500, marginBottom: "6px" }}>{jur.name}</div>
                  <div className="mono" style={{ fontSize: "11px", letterSpacing: "0.1em", opacity: 0.7 }}>{jur.statute}</div>
                </div>
                {jurisdictions[jur.id] && <CheckCircle2 size={20} />}
              </div>
            </div>
          ))}
        </div>
        {visibleCounts.length > 0 && (
          <div style={{ marginTop: "24px", padding: "24px", border: "1px solid rgba(27,42,63,0.18)", background: "#fff", borderRadius: "12px" }}>
            {labelRow("Residents affected — statutory-threshold count", "The number of this jurisdiction's residents whose data was affected. Used to test statutory notification thresholds — distinct from the per-category data-subject counts below.")}
            <div style={{ display: "grid", gridTemplateColumns: visibleCounts.length === 1 ? "1fr" : "repeat(2, 1fr)", gap: "28px", marginTop: "4px" }}>
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
      {labelRow(
        "Did the incident involve any of the following types of personal data?",
        "These types of personal data are directly relevant to determining whether you must notify applicable regulators about an incident identified as a personal data breach."
      )}
      {multiSelect(SENSITIVITY_OPTIONS, sensitivity, toggleSensitivity, 2)}
    </div>
  );

  const renderEncryption = () => (
    <div style={{ marginBottom: "24px" }}>
      {labelRow("Was the compromised data encrypted, with an uncompromised key?")}
      <div
        className={`checkbox-card ${encryptionApplied ? "selected" : ""}`}
        onClick={() => setEncryptionApplied(!encryptionApplied)}
        style={{ padding: "18px 22px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "6px" }}>
              The compromised data was encrypted, and the encryption key was not also compromised.
            </div>
            <div style={{ fontSize: "13px", lineHeight: 1.5, opacity: 0.8 }}>
              Properly encrypted data with an uncompromised key may suppress some or all notification obligations. The mechanism varies by jurisdiction — most U.S. state statutes (CA, TX, CO, MA among modeled) exclude encrypted data from the breach definition itself; EU and UK GDPR provide a conditional Art. 34(3)(a) exemption from individual notification only. Specific standards vary (e.g., Massachusetts requires 128-bit or higher).
            </div>
          </div>
          {encryptionApplied && <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: "2px" }} />}
        </div>
      </div>
    </div>
  );

  // ── The live deadline result (shown in both modes, at the top) ──
  const renderResultBody = () => {
    if (!canCompute) {
      return (
        <div style={{ padding: "24px 28px", background: "#1B2A3F", color: "#FAF8F2", borderRadius: "12px" }}>
          <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "10px" }}>
            Awaiting inputs
          </div>
          <p style={{ fontSize: "15px", lineHeight: 1.6, margin: "0 0 12px" }}>
            To calculate notification requirements and timing, provide:
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", lineHeight: 1.7, opacity: 0.92 }}>
            {missingInputs.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      );
    }

    return (
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
                  <div style={{ textAlign: "right", minWidth: "240px" }}>
                    {d.deadline ? (
                      <>
                        <div className="section-mark" style={{ marginBottom: "6px" }}>
                          {isMissed ? "Overdue by" : "Time remaining"}
                        </div>
                        <div className="mono" style={{ fontSize: "28px", fontWeight: 500, letterSpacing: "-0.02em" }}>
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
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main view — one unified form.
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
        .checkbox-card {
          border: 1px solid #1B2A3F; padding: 18px 20px; cursor: pointer;
          transition: all 0.15s ease; background: transparent; border-radius: 12px;
        }
        .checkbox-card:hover { background: rgba(27,42,63,0.04); }
        .checkbox-card.selected { background: #1B2A3F; color: #FAF8F2; }
        .form-input, .form-select, .form-textarea {
          width: 100%; border: 1px solid rgba(27,42,63,0.25); border-radius: 8px; background: #fff;
          padding: 11px 13px; font-family: 'Inter', sans-serif; font-size: 15px; color: #2C2418;
          outline: none; transition: border-color 0.15s ease;
        }
        .form-textarea { resize: vertical; line-height: 1.55; min-height: 84px; }
        .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #C76E3A; }
        .form-input:disabled, .form-select:disabled, .form-textarea:disabled {
          opacity: 0.45; cursor: not-allowed; background: #FAF8F2;
        }
        .deadline-card {
          background: #fff; border-left: 4px solid #1B2A3F; padding: 24px;
          position: relative; overflow: hidden; border-radius: 0 12px 12px 0;
        }
        .deadline-card.urgent { border-left-color: #C76E3A; background: #FBF5EE; }
        .deadline-card.missed { background: #1B2A3F; color: #FAF8F2; border-left-color: #C76E3A; }
        .deadline-card.missed .mono { color: #FAF8F2; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        .divider-thick { height: 1px; background: #1B2A3F; width: 100%; opacity: 0.25; }
        .rule-text { font-size: 13px; line-height: 1.6; opacity: 0.75; }
        .q2-expand {
          margin-top: 14px; margin-left: 4px; padding: 18px 0 4px 20px;
          border-left: 2px solid rgba(27,42,63,0.15);
        }
        .section-mark {
          font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500;
          letter-spacing: 0.18em; text-transform: uppercase; color: #1B2A3F; opacity: 0.7;
        }
      `}</style>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "60px 40px" }}>
        {/* Header */}
        <header style={{ marginBottom: "28px" }}>
          <h1 className="serif" style={{ fontSize: "36px", margin: 0, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, color: "#1B2A3F" }}>
            Breach Clock
          </h1>
          <p style={{ fontSize: "15px", marginTop: "12px", maxWidth: "640px", lineHeight: 1.6, fontWeight: 400, color: "#2C2418" }}>
            A triage tool for calculating breach-notification deadlines from the moment of awareness. Currently covers {JURISDICTIONS.map((j) => j.short).join(", ").replace(/, ([^,]*)$/, ", and $1")}.
          </p>
        </header>

        {/* On-ramp disclaimer */}
        <div
          role="note"
          style={{
            borderTop: "1px solid rgba(27,42,63,0.18)",
            borderBottom: "1px solid rgba(27,42,63,0.18)",
            padding: "14px 0",
            marginBottom: "32px",
            fontSize: "14px",
            lineHeight: 1.55,
            color: "#1B2A3F",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          For preliminary triage purposes only. Breach Clock does not provide legal advice. Results must be confirmed by qualified counsel.
        </div>

        {/* Form intro note — standout, not a field */}
        <div
          role="note"
          style={{
            background: "#E8DDC4",
            border: "1px solid rgba(27,42,63,0.18)",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "28px",
            display: "flex",
            gap: "14px",
            alignItems: "flex-start",
          }}
        >
          <Info size={18} style={{ color: "#1B2A3F", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, color: "#2C2418" }}>
            This form uses the term "incident" rather than "personal data breach" in most cases. While all security incidents are not personal data breaches, all personal data breaches are security incidents. The question of whether a security incident constitutes a personal data breach under applicable law is a legal question that must be determined by qualified privacy counsel.
          </p>
        </div>

        {/* Quick mode toggle */}
        <div style={{ marginBottom: "32px" }}>
          {toggleCard(
            "I don't want a full incident report — I just need notification requirements and timing.",
            quickMode,
            setQuickMode,
            "Quick mode shows only the fields that drive the deadline calculation. Anything you enter is kept if you switch back to the full incident report — nothing is re-entered."
          )}
        </div>

        {/* Live deadline result — surfaced at the top, present in both modes */}
        <section style={{ marginBottom: "48px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
            <div className="section-mark">
              {canCompute && deadlines.length > 0 ? "Notification deadlines" : "Deadline analysis"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <button
                onClick={handleDownloadMemo}
                disabled={!canCompute}
                style={{
                  background: "transparent",
                  border: "1px solid #1B2A3F",
                  borderRadius: "8px",
                  padding: "9px 14px",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: canCompute ? "pointer" : "not-allowed",
                  opacity: canCompute ? 1 : 0.4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s ease",
                  color: "#1B2A3F",
                }}
                onMouseEnter={(e) => { if (canCompute) { e.currentTarget.style.background = "#1B2A3F"; e.currentTarget.style.color = "#FAF8F2"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#1B2A3F"; }}
              >
                <Download size={13} /> {quickMode ? "Download analysis" : "Download report"}
              </button>
              {canCompute && deadlines.length > 0 && (
                <div className="pulse section-mark" style={{ color: "#C76E3A", opacity: 1 }}>● Live</div>
              )}
            </div>
          </div>
          {downloadError && (
            <div
              role="alert"
              style={{
                marginBottom: "16px", padding: "10px 14px", border: "1px solid #C76E3A",
                color: "#C76E3A", background: "transparent", fontFamily: "'Inter', sans-serif",
                fontSize: "13px", lineHeight: 1.5, borderRadius: "8px",
              }}
            >
              {downloadError}
            </div>
          )}
          <div className="divider-thick" style={{ marginBottom: "24px" }} />
          {renderResultBody()}
        </section>

        {/* ───────── QUICK MODE ───────── */}
        {quickMode && (
          <section style={{ marginBottom: "40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
              <h2 className="serif" style={{ fontSize: "24px", fontWeight: 400, margin: 0, color: "#1B2A3F", letterSpacing: "-0.01em" }}>
                Notification inputs
              </h2>
              <div style={{ flex: 1, height: "1px", background: "rgba(27,42,63,0.18)" }} />
            </div>
            {renderAwarenessField()}
            {renderJurisdictionsField()}
            {renderQ1()}
            {renderEncryption()}
          </section>
        )}

        {/* ───────── FULL FORM ───────── */}
        {!quickMode && (
          <>
            {/* 1. General information */}
            <section style={{ marginBottom: "56px" }}>
              {sectionHeading("01", "General Information")}
              {field(
                "Incident reference / title",
                "A descriptive title or reference number for the incident.",
                <input
                  className="form-input"
                  value={record.incidentTitle}
                  onChange={(e) => updateRecord("incidentTitle", e.target.value)}
                  placeholder="e.g. INC-2026-014 — Misdirected payroll export"
                  style={{ maxWidth: "560px" }}
                />,
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
              {field(
                "Systems & services impacted",
                null,
                <textarea className="form-textarea" value={record.systemsImpacted} onChange={(e) => updateRecord("systemsImpacted", e.target.value)} />
              )}
              {field(
                "Backups — existence & availability",
                "Were the systems in question backed up in any way? Where are they located?",
                <textarea className="form-textarea" value={record.backups} onChange={(e) => updateRecord("backups", e.target.value)} />
              )}
              {field(
                "Which data security principles of the personal data were compromised?",
                null,
                multiSelect(DATA_PRINCIPLES, record.dataPrinciples, (id) => toggleRecordArray("dataPrinciples", id), 1)
              )}
              {field(
                "Type of incident",
                null,
                <>
                  {multiSelect(INCIDENT_TYPES, record.incidentTypes, (id) => toggleRecordArray("incidentTypes", id), 3)}
                  {record.incidentTypes.includes("other") && (
                    <input
                      className="form-input"
                      value={record.incidentTypeOther}
                      onChange={(e) => updateRecord("incidentTypeOther", e.target.value)}
                      placeholder="Specify the type of incident"
                      style={{ marginTop: "12px", maxWidth: "560px" }}
                    />
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
                {toggleCard("Information not available", record.occurrenceNotAvailable, (v) => updateRecord("occurrenceNotAvailable", v))}
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

              {/* Q1 ⇄ Q2 cross-check warning (non-blocking) */}
              {crossCheckMissing.length > 0 && (
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
                    You selected data types below that imply categories not checked in Q1 above:{" "}
                    <strong>{crossCheckMissing.map((t) => TAG_TO_Q1_LABEL[t]).join(", ")}</strong>. If these were involved, add them in Q1 — they affect the deadline calculation.
                  </div>
                </div>
              )}

              {renderEncryption()}

              {/* Q2 — categories of data subjects (record only) */}
              {field(
                "Which categories of data subjects were affected?",
                null,
                <div style={{ display: "grid", gap: "12px" }}>
                  {DATA_SUBJECT_CATEGORIES.map((cat) => {
                    const sel = record.dataSubjectCategories.includes(cat.id);
                    return (
                      <div key={cat.id}>
                        <div
                          className={`checkbox-card ${sel ? "selected" : ""}`}
                          onClick={() => toggleRecordArray("dataSubjectCategories", cat.id)}
                          style={{ padding: "14px 18px" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: "15px" }}>{cat.label}</div>
                            {sel && <CheckCircle2 size={16} />}
                          </div>
                        </div>

                        {sel && cat.id === "customers" && (
                          <div className="q2-expand">
                            {field("Approximate count", null, <input type="number" className="form-input" value={record.customersCount} onChange={(e) => updateRecord("customersCount", e.target.value)} style={{ maxWidth: "240px" }} />)}
                            {field("Data types", null, multiSelect(CUSTOMER_DATA_TYPES, record.customersDataTypes, (id) => toggleRecordArray("customersDataTypes", id), 2))}
                            {field("Other", null, <input className="form-input" value={record.customersOther} onChange={(e) => updateRecord("customersOther", e.target.value)} style={{ maxWidth: "560px" }} />)}
                          </div>
                        )}
                        {sel && cat.id === "employees" && (
                          <div className="q2-expand">
                            {field("Count", null, <input type="number" className="form-input" value={record.employeesCount} onChange={(e) => updateRecord("employeesCount", e.target.value)} style={{ maxWidth: "240px" }} />)}
                            {field("Data types", null, multiSelect(EMPLOYEE_DATA_TYPES, record.employeesDataTypes, (id) => toggleRecordArray("employeesDataTypes", id), 2))}
                            {field("Other", null, <input className="form-input" value={record.employeesOther} onChange={(e) => updateRecord("employeesOther", e.target.value)} style={{ maxWidth: "560px" }} />)}
                          </div>
                        )}
                        {sel && cat.id === "visitors" && (
                          <div className="q2-expand">
                            {field("Count", null, <input type="number" className="form-input" value={record.visitorsCount} onChange={(e) => updateRecord("visitorsCount", e.target.value)} style={{ maxWidth: "240px" }} />)}
                            {field("Data types", null, multiSelect(VISITOR_DATA_TYPES, record.visitorsDataTypes, (id) => toggleRecordArray("visitorsDataTypes", id), 2))}
                            {field("Other", null, <input className="form-input" value={record.visitorsOther} onChange={(e) => updateRecord("visitorsOther", e.target.value)} style={{ maxWidth: "560px" }} />)}
                          </div>
                        )}
                        {sel && cat.id === "other" && (
                          <div className="q2-expand">
                            {field("Label", null, <input className="form-input" value={record.otherLabel} onChange={(e) => updateRecord("otherLabel", e.target.value)} style={{ maxWidth: "560px" }} />)}
                            {field("Count", null, <input type="number" className="form-input" value={record.otherCount} onChange={(e) => updateRecord("otherCount", e.target.value)} style={{ maxWidth: "240px" }} />)}
                            {field("Data affected", null, <textarea className="form-textarea" value={record.otherDataAffected} onChange={(e) => updateRecord("otherDataAffected", e.target.value)} />)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
                    {toggleCard("Not available", record.measuresTakenNotAvailable, (v) => updateRecord("measuresTakenNotAvailable", v))}
                  </div>
                </>
              )}
              {field(
                "Measures proposed (incl. proposed mitigation)",
                null,
                <>
                  <textarea className="form-textarea" value={record.measuresProposed} onChange={(e) => updateRecord("measuresProposed", e.target.value)} disabled={record.measuresProposedNotAvailable} style={{ opacity: record.measuresProposedNotAvailable ? 0.45 : 1 }} />
                  <div style={{ marginTop: "12px" }}>
                    {toggleCard("Not available", record.measuresProposedNotAvailable, (v) => updateRecord("measuresProposedNotAvailable", v))}
                  </div>
                </>
              )}
            </section>

            {/* Further considerations */}
            <div style={{ marginBottom: "16px", padding: "28px", background: "#E8DDC4", color: "#2C2418", border: "1px solid rgba(27,42,63,0.18)", borderRadius: "12px" }}>
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
          </>
        )}

        {/* Start over */}
        <div style={{ marginTop: "40px" }}>
          <button className="btn-ghost" onClick={reset}>
            <ArrowLeft size={14} /> Start over
          </button>
        </div>

        <footer style={{ marginTop: "80px", paddingTop: "32px", borderTop: "1px solid rgba(27,42,63,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="section-mark" style={{ opacity: 0.5 }}>Arkidel · Breach Clock</div>
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
