// =============================================================================
// BREACH CLOCK — multi-step React component.
//
// Renders the four-step user flow: awareness date → jurisdictions and
// resident counts → sensitivity and encryption facts → review → results
// (with deadline cards, jurisdictional counsel notes, suppressed-obligation
// section, and downloadable HTML memo). Also renders an in-app Tests view
// (footer link) showing the rules engine's pass/fail across the test cases
// in engine.js.
//
// The component is a single 1,200-line function. That's deliberate for v1 —
// it's a multi-step form with shared state, and splitting it into
// sub-components prematurely tends to add ceremony without clarity. When
// adding features, expect to touch this file. When adding jurisdictions or
// updating rules, edit data.js (and verify with the test harness in
// engine.js — never edit this file for substantive legal changes).
// =============================================================================

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Scale, FileWarning, Info, Download } from "lucide-react";
import { JURISDICTIONS } from "./data.js";
import { isHighRisk, computeDeadlines, runTests, TEST_AWARENESS } from "./engine.js";
import { generateMemoPdf } from "./memo-pdf.js";
import usePageTitle from "../usePageTitle.js";

export default function BreachClock() {
  usePageTitle("Breach Clock");
  const [step, setStep] = useState(0);
  const [showTests, setShowTests] = useState(false);
  const [awareness, setAwareness] = useState("");
  const [jurisdictions, setJurisdictions] = useState(
    () => Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false]))
  );
  const [residentCounts, setResidentCounts] = useState(
    () => Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""]))
  );
  const [sensitivity, setSensitivity] = useState([]);
  const [encryptionApplied, setEncryptionApplied] = useState(false);
  const [riskLevel, setRiskLevel] = useState("");
  const [now, setNow] = useState(new Date());
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const sensitivityOptions = [
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

  // ---------------------------------------------------------------------------
  // Deadlines: computed via the module-level pure rules engine. Same function
  // the test harness calls — keeps the UI and tests honest about the same code.
  // ---------------------------------------------------------------------------
  const { deadlines, suppressed } = computeDeadlines({
    awarenessDate,
    jurisdictions,
    residentCounts,
    sensitivity,
    encryptionApplied,
  });


  const canAdvance = () => {
    if (step === 0) return !!awarenessDate && awarenessDate <= now;
    if (step === 1) return anyJurisdiction;
    if (step === 2) return sensitivity.length > 0;
    return true;
  };

  const handleDownloadMemo = async () => {
    setDownloadError("");
    try {
      const facts = {
        awarenessDate,
        jurisdictions,
        residentCounts,
        sensitivity,
        sensitivityLabels: sensitivity
          .map((s) => sensitivityOptions.find((o) => o.id === s)?.label)
          .filter(Boolean)
          // Strip trailing parentheticals for the printed memo:
          // "Identifiers (name, email, address)" → "Identifiers"
          .map((label) => label.replace(/\s*\([^)]*\)\s*$/, "")),
        encryptionApplied,
        riskLevel,
      };
      const pdfBytes = await generateMemoPdf(facts, deadlines, suppressed);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateForFilename = (awarenessDate || new Date()).toISOString().slice(0, 10);
      a.href = url;
      a.download = `breach-notification-analysis-${dateForFilename}.pdf`;
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
    setStep(0);
    setAwareness("");
    setJurisdictions(Object.fromEntries(JURISDICTIONS.map((j) => [j.id, false])));
    setResidentCounts(Object.fromEntries(JURISDICTIONS.filter((j) => j.residentField).map((j) => [j.id, ""])));
    setSensitivity([]);
    setEncryptionApplied(false);
    setRiskLevel("");
  };

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
                <div style={{ background: "#fff", border: "1px solid rgba(27,42,63,0.18)" }}>
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
          transition: all 0.15s ease; background: transparent;
        }
        .checkbox-card:hover { background: rgba(27,42,63,0.04); }
        .checkbox-card.selected { background: #1B2A3F; color: #FAF8F2; }
        .input-field {
          width: 100%; border: none; border-bottom: 1.5px solid #1B2A3F; background: transparent;
          padding: 12px 0; font-family: 'Inter', sans-serif; font-size: 20px; color: #2C2418;
          outline: none;
        }
        .input-field:focus { border-bottom-color: #C76E3A; }
        .radio-row {
          display: flex; align-items: center; padding: 14px 0; cursor: pointer;
          border-bottom: 1px solid rgba(27,42,63,0.12);
        }
        .radio-dot {
          width: 14px; height: 14px; border: 1.5px solid #1B2A3F; border-radius: 50%;
          margin-right: 14px; position: relative; flex-shrink: 0;
        }
        .radio-dot.active { border-color: #C76E3A; }
        .radio-dot.active::after {
          content: ''; position: absolute; top: 2px; left: 2px; width: 6px; height: 6px;
          background: #C76E3A; border-radius: 50%;
        }
        .progress-step {
          width: 32px; height: 32px; border: 1px solid #1B2A3F; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 500;
        }
        .progress-step.active { background: #1B2A3F; color: #FAF8F2; }
        .progress-step.done { background: #5A6E4A; color: #FAF8F2; border-color: #5A6E4A; }
        .progress-line { flex: 1; height: 1px; background: #1B2A3F; opacity: 0.25; margin: 0 8px; }
        .deadline-card {
          background: #fff; border-left: 4px solid #1B2A3F; padding: 24px;
          position: relative; overflow: hidden;
        }
        .deadline-card.urgent {
          border-left-color: #C76E3A;
          background: #FBF5EE;
        }
        .deadline-card.missed {
          background: #1B2A3F; color: #FAF8F2;
          border-left-color: #C76E3A;
        }
        .deadline-card.missed .mono { color: #FAF8F2; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        .divider-thick { height: 1px; background: #1B2A3F; width: 100%; opacity: 0.25; }
        .rule-text { font-size: 13px; line-height: 1.6; opacity: 0.75; }
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

        {/* On-ramp notice — sits directly above the wizard / results so the
            disclaimer is attached to the tool rather than floating in chrome. */}
        <div
          role="note"
          style={{
            borderTop: "1px solid rgba(27,42,63,0.18)",
            borderBottom: "1px solid rgba(27,42,63,0.18)",
            padding: "14px 0",
            marginBottom: "40px",
            fontSize: "14px",
            lineHeight: 1.55,
            color: "#1B2A3F",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          For preliminary triage purposes only. Breach Clock does not provide legal advice. Results must be confirmed by qualified counsel.
        </div>

        {/* Progress */}
        {step < 4 && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: "48px" }}>
            {["Awareness", "Jurisdictions", "Data", "Review"].map((label, i) => (
              <React.Fragment key={label}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div className={`progress-step ${step === i ? "active" : ""} ${step > i ? "done" : ""}`}>
                    {step > i ? <CheckCircle2 size={14} /> : (i + 1).toString().padStart(2, "0")}
                  </div>
                  <div className="section-mark" style={{ opacity: step === i ? 1 : 0.45 }}>
                    {label}
                  </div>
                </div>
                {i < 3 && <div className="progress-line" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* STEP 0 — Awareness */}
        {step === 0 && (
          <section>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "start" }}>
              <div>
                <div className="section-mark" style={{ marginBottom: "16px" }}>
                  Question 01
                </div>
                <h2 className="serif" style={{ fontSize: "32px", fontWeight: 400, lineHeight: 1.2, margin: "0 0 28px", letterSpacing: "-0.01em", color: "#1B2A3F" }}>
                  When did your organization become aware of the breach?
                </h2>
                <label className="section-mark">
                  Date and time of awareness
                </label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={awareness}
                  onChange={(e) => setAwareness(e.target.value)}
                  max={new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  style={{ marginTop: "8px" }}
                />
              </div>
              <aside style={{ background: "#E8DDC4", color: "#2C2418", padding: "28px", marginTop: "40px", border: "1px solid rgba(27,42,63,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", color: "#1B2A3F" }}>
                  <Info size={16} />
                  <div className="section-mark" style={{ opacity: 1 }}>
                    Counsel's note
                  </div>
                </div>
                <p style={{ fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
                  Under Art. 33 GDPR, the clock starts at <strong>awareness</strong>, not discovery — interpreted as reasonable certainty that a security incident has compromised personal data. Earlier signals (anomalies, suspicions) may begin an investigation period but typically do not yet start the 72-hour clock. If you are uncertain which moment qualifies, document your reasoning and consider using the earliest defensible timestamp.
                </p>
              </aside>
            </div>
          </section>
        )}

        {/* STEP 1 — Jurisdictions */}
        {step === 1 && (
          <section>
            <div className="section-mark" style={{ marginBottom: "16px" }}>
              Question 02
            </div>
            <h2 className="serif" style={{ fontSize: "32px", fontWeight: 400, lineHeight: 1.2, margin: "0 0 36px", letterSpacing: "-0.01em", maxWidth: "700px", color: "#1B2A3F" }}>
              Which jurisdictions' residents are affected?
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
              {JURISDICTIONS.map((jur) => (
                <div
                  key={jur.id}
                  className={`checkbox-card ${jurisdictions[jur.id] ? "selected" : ""}`}
                  onClick={() => toggleJurisdiction(jur.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "24px", fontWeight: 500, marginBottom: "6px" }}>{jur.name}</div>
                      <div className="mono" style={{ fontSize: "11px", letterSpacing: "0.1em", opacity: 0.7 }}>
                        {jur.statute}
                      </div>
                    </div>
                    {jurisdictions[jur.id] && <CheckCircle2 size={20} />}
                  </div>
                </div>
              ))}
            </div>
            {(() => {
              const visible = JURISDICTIONS.filter((j) => j.residentField && jurisdictions[j.id]);
              if (visible.length === 0) return null;
              return (
                <div style={{ marginTop: "40px", padding: "24px", border: "1px solid rgba(27,42,63,0.18)", background: "#fff" }}>
                  <div className="section-mark" style={{ marginBottom: "16px" }}>
                    Resident counts
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: visible.length === 1 ? "1fr" : "repeat(2, 1fr)", gap: "32px" }}>
                    {visible.map((jur) => {
                      const thresholdObligations = jur.obligations.filter(
                        (o) => o.gating?.residentThreshold !== undefined
                      );
                      return (
                        <div key={jur.id}>
                          <label className="section-mark">
                            {jur.residentField.stateLabel}
                          </label>
                          <input
                            type="number"
                            className="input-field"
                            placeholder={jur.residentField.placeholder || ""}
                            value={residentCounts[jur.id] || ""}
                            onChange={(e) => setResidentCounts({ ...residentCounts, [jur.id]: e.target.value })}
                          />
                          {thresholdObligations.length > 0 && (
                            <div className="rule-text" style={{ marginTop: "8px" }}>
                              {thresholdObligations.map((o, idx) => {
                                const t = o.gating.residentThreshold;
                                const cmp = o.gating.comparator || "gte";
                                const phrase = cmp === "gt"
                                  ? `>${t.toLocaleString()}`
                                  : `${t.toLocaleString()}+`;
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
              );
            })()}
          </section>
        )}

        {/* STEP 2 — Data */}
        {step === 2 && (
          <section>
            <div className="section-mark" style={{ marginBottom: "16px" }}>
              Question 03
            </div>
            <h2 className="serif" style={{ fontSize: "32px", fontWeight: 400, lineHeight: 1.2, margin: "0 0 36px", letterSpacing: "-0.01em", maxWidth: "800px", color: "#1B2A3F" }}>
              What kind of data was involved?
            </h2>

            <div>
              <div className="section-mark" style={{ marginBottom: "20px" }}>
                Categories of data involved — select all that apply
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                {sensitivityOptions.map(({ id, label }) => (
                  <div
                    key={id}
                    className={`checkbox-card ${sensitivity.includes(id) ? "selected" : ""}`}
                    onClick={() => toggleSensitivity(id)}
                    style={{ padding: "14px 18px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "15px" }}>{label}</div>
                      {sensitivity.includes(id) && <CheckCircle2 size={16} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "48px" }}>
              <div className="section-mark" style={{ marginBottom: "20px" }}>
                Encryption
              </div>
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
          </section>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <section>
            <div className="section-mark" style={{ marginBottom: "16px" }}>
              Confirm
            </div>
            <h2 className="serif" style={{ fontSize: "32px", fontWeight: 400, lineHeight: 1.2, margin: "0 0 36px", letterSpacing: "-0.01em", color: "#1B2A3F" }}>
              Review the inputs before running the clock.
            </h2>
            <div style={{ border: "1px solid rgba(27,42,63,0.18)", background: "#fff", padding: "32px", marginBottom: "32px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px 40px" }}>
                <div className="section-mark">Awareness</div>
                <div style={{ fontSize: "18px" }}>{awarenessDate?.toLocaleString()}</div>
                <div className="section-mark">Jurisdictions</div>
                <div style={{ fontSize: "18px" }}>
                  {JURISDICTIONS
                    .filter((j) => jurisdictions[j.id])
                    .map((j) => {
                      const count = residentCounts[j.id];
                      const suffix = j.residentField && count ? ` (${parseInt(count).toLocaleString()} residents)` : "";
                      return `${j.short}${suffix}`;
                    })
                    .join(" · ")}
                </div>
                <div className="section-mark">Sensitivity</div>
                <div style={{ fontSize: "15px", lineHeight: 1.5 }}>
                  {sensitivity.map((s) => sensitivityOptions.find((o) => o.id === s)?.label).join(" · ")}
                </div>
                <div className="section-mark">Risk indicator</div>
                <div style={{ fontSize: "18px", color: highRiskPresent ? "#C76E3A" : "#2C2418" }}>
                  {highRiskPresent ? "Elevated — likely high risk to data subjects" : "Standard — further assessment required"}
                </div>
                <div className="section-mark">Encryption</div>
                <div style={{ fontSize: "18px", color: encryptionApplied ? "#5A6E4A" : "#2C2418" }}>
                  {encryptionApplied ? "Applied — suppression will be evaluated" : "Not reported — no suppression evaluated"}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STEP 4 — Results */}
        {step === 4 && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
              <div className="section-mark">
                {deadlines.length > 0 ? "Notification deadlines" : "Analysis"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <button
                  onClick={handleDownloadMemo}
                  style={{
                    background: "transparent",
                    border: "1px solid #1B2A3F",
                    borderRadius: "8px",
                    padding: "9px 14px",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.2s ease",
                    color: "#1B2A3F",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#1B2A3F"; e.currentTarget.style.color = "#FAF8F2"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#1B2A3F"; }}
                >
                  <Download size={13} /> Download memo
                </button>
                {deadlines.length > 0 && (
                  <div className="pulse section-mark" style={{ color: "#C76E3A", opacity: 1 }}>
                    ● Live
                  </div>
                )}
              </div>
            </div>
            {downloadError && (
              <div
                role="alert"
                style={{
                  marginBottom: "16px",
                  padding: "10px 14px",
                  border: "1px solid #C76E3A",
                  color: "#C76E3A",
                  background: "transparent",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {downloadError}
              </div>
            )}
            <div className="divider-thick" style={{ marginBottom: "40px" }} />

            {deadlines.length === 0 && suppressed.length > 0 && (
              <div style={{ marginBottom: "32px", padding: "24px 28px", background: "#5A6E4A", color: "#FAF8F2" }}>
                <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>
                  Result
                </div>
                <div className="serif" style={{ fontSize: "26px", fontWeight: 400, lineHeight: 1.2 }}>
                  No notification obligations fire under the facts provided.
                </div>
                <p style={{ fontSize: "14px", marginTop: "12px", opacity: 0.9, lineHeight: 1.6 }}>
                  Based on the encryption fact reported, every obligation that would otherwise apply has been suppressed — either because the breach falls outside the statutory definition (U.S. states) or because individual notification is exempted by an unintelligibility-of-data provision (EU/UK GDPR Art. 34(3)(a)). Confirm encryption met each jurisdiction's standard before relying on this analysis.
                </p>
              </div>
            )}

            {deadlines.length === 0 && suppressed.length === 0 && (
              <div style={{ marginBottom: "32px", padding: "24px 28px", background: "#1B2A3F", color: "#FAF8F2" }}>
                <div className="section-mark" style={{ color: "#FAF8F2", opacity: 0.85, marginBottom: "8px" }}>
                  No deadlines computed
                </div>
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
                        <div className="section-mark" style={{ marginBottom: "10px" }}>
                          {d.jurisdiction}
                        </div>
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
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              fontFamily: "'Inter', sans-serif",
                              fontSize: "13px",
                              fontWeight: 500,
                              marginTop: "14px",
                              color: "inherit",
                              textDecoration: "none",
                              borderBottom: "1px solid currentColor",
                              paddingBottom: "2px",
                              opacity: 0.8,
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
                            <div className="section-mark">
                              No fixed hour deadline
                            </div>
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
                <div style={{ marginTop: "48px" }}>
                  <div className="section-mark" style={{ marginBottom: "16px" }}>
                    Jurisdictional notes
                  </div>
                  <div style={{ display: "grid", gap: "12px" }}>
                    {selectedJurs.flatMap((jur) =>
                      jur.counselNotes.map((note) => (
                        <aside
                          key={note.id}
                          style={{
                            background: "#fff",
                            color: "#2C2418",
                            padding: "20px 24px",
                            borderLeft: "4px solid #E8DDC4",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", color: "#1B2A3F" }}>
                            <Info size={14} />
                            <div className="section-mark" style={{ opacity: 1 }}>
                              {jur.short}
                            </div>
                          </div>
                          <div className="serif" style={{ fontSize: "18px", fontWeight: 400, lineHeight: 1.3, marginBottom: "10px", letterSpacing: "-0.005em" }}>
                            {note.title}
                          </div>
                          <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 10px" }}>
                            {note.content}
                          </p>
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
              <div style={{ marginTop: "48px" }}>
                <div className="section-mark" style={{ marginBottom: "16px" }}>
                  Notification likely not required — encryption suppression
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  {suppressed.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#fff",
                        borderLeft: "4px solid #5A6E4A",
                        padding: "20px 24px",
                      }}
                    >
                      <div className="section-mark" style={{ marginBottom: "8px" }}>
                        {s.jurisdiction}
                      </div>
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
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontFamily: "'Inter', sans-serif",
                            fontSize: "13px",
                            fontWeight: 500,
                            marginTop: "14px",
                            color: "inherit",
                            textDecoration: "none",
                            borderBottom: "1px solid currentColor",
                            paddingBottom: "2px",
                            opacity: 0.8,
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

            <div style={{ marginTop: "48px", padding: "28px", background: "#E8DDC4", color: "#2C2418", border: "1px solid rgba(27,42,63,0.18)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", color: "#1B2A3F" }}>
                <FileWarning size={18} />
                <div className="section-mark" style={{ opacity: 1 }}>
                  Further considerations
                </div>
              </div>
              <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", lineHeight: 1.7 }}>
                <li>Sectoral regimes (HIPAA, GLBA, NYDFS, financial services) may impose separate obligations not modeled here.</li>
                <li>Employer, insurer, processor, and joint-controller relationships may create contractual notification duties preceding statutory ones.</li>
                <li>Law enforcement holds may permit delay of individual notification in some US jurisdictions — document the request in writing.</li>
                <li>Residents of US states beyond those listed above may be affected; 50-state analysis recommended for any multi-state incident.</li>
                <li>This tool provides a preliminary timeline only and does not constitute legal advice. Confirm all conclusions with qualified counsel.</li>
              </ul>
            </div>
          </section>
        )}

        {/* Navigation */}
        <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {step > 0 && step < 4 && (
              <button className="btn-ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step === 4 && (
              <button className="btn-ghost" onClick={reset}>
                <ArrowLeft size={14} /> Start over
              </button>
            )}
          </div>
          <div>
            {step < 3 && (
              <button className="btn-primary" disabled={!canAdvance()} onClick={() => setStep(step + 1)}>
                Continue <ArrowRight size={14} />
              </button>
            )}
            {step === 3 && (
              <button className="btn-primary" onClick={() => setStep(4)}>
                Run the clock <Clock size={14} />
              </button>
            )}
          </div>
        </div>

        <footer style={{ marginTop: "80px", paddingTop: "32px", borderTop: "1px solid rgba(27,42,63,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="section-mark" style={{ opacity: 0.5 }}>
            Arkidel · Breach Clock
          </div>
          <button
            onClick={() => setShowTests(true)}
            className="section-mark"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              opacity: 0.5,
              borderBottom: "1px solid currentColor",
              color: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.5; }}
          >
            Tests
          </button>
          <div className="section-mark" style={{ opacity: 0.5 }}>
            Preliminary triage only
          </div>
        </footer>
      </div>
    </div>
  );
}
