// Respond home — the org's saved incidents list (JDC redesign 2026-07-19).
//
// /breach-clock renders this page; the fresh intake form lives at
// /breach-clock/new and each row links to the saved-incident editor at
// /breach-clock/:id. Renders inside AppShell (behind RequireAuth + RequireOrg,
// so activeOrg is always present). Reads through the data layer only. Delete
// is a two-step confirm inline in the row — no modal — and stays on the list
// after removing the row.
//
// The Next-deadline column computes client-side from each row's saved payload:
// the SAME completeness gate the editor uses (computableGate in
// src/breach-clock/facts.js — extracted, not duplicated) and the same pure
// engine, taking the soonest computed obligation deadline. Firm deadlines
// govern; a contingent obligation (unestablished resident count) surfaces only
// when its conditional date is the nearest one, and then as "≤ {date} ·
// contingent". Static per load — no ticking on this page.
//
// Product chrome styling: inline styles on the Bone canvas with the same
// tokens as BreachClock (white card surface, 12px card radius, Parchment card
// border, .section-mark-style spaced caps done inline since BreachClock's
// <style> block isn't in scope here).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { listIncidents, deleteIncident } from "../data/incidents.js";
import { JURISDICTIONS } from "../breach-clock/data.js";
import { formatDateInZone, isValidTimeZone } from "../breach-clock/timezone.js";
import { computeDeadlines } from "../breach-clock/engine.js";
import { computableGate, factsFromPayload } from "../breach-clock/facts.js";
import { useOrg } from "../org/OrgProvider.jsx";
import usePageTitle from "../usePageTitle.js";
import { useTopBarHeader } from "../components/TopBarContext.jsx";

const MIDNIGHT = "#1B2A3F";
const BONE = "#FAF8F2";
const PARCHMENT = "#E8DDC4";
const INK = "#2C2418";
const EMBER = "#C76E3A";
const MIST = "#9FAEC2";
const MOSS = "#5A6E4A";
const HAIRLINE = "1px solid rgba(27,42,63,0.18)";
const MONO_STACK = "'JetBrains Mono', ui-monospace, monospace";

const markStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: MIDNIGHT,
  opacity: 0.7,
};

const linkButtonStyle = {
  background: "transparent",
  border: "none",
  padding: "4px 0",
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  fontWeight: 500,
  color: MIDNIGHT,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  opacity: 0.85,
};

// "Jul 11, 2026 · 4:32 PM" — quiet, scannable last-activity stamp.
const fmtUpdated = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
};

// Postal-style jurisdiction abbreviations — UI display only, deliberately NOT
// in data.js (presentation, not substance). EU/UK render as-is; an id missing
// from the map falls back to its uppercased form so a future jurisdiction
// degrades readably rather than disappearing.
const JURISDICTION_ABBR = {
  eu: "EU",
  uk: "UK",
  ca: "CA",
  tx: "TX",
  co: "CO",
  ma: "MA",
  ny: "NY",
  va: "VA",
  de: "DE",
};

// "DE" / "DE · MA" / "DE · MA · CA +2", in canonical data.js order.
// Empty/absent selection → null (rendered as the Mist em-dash).
const jurisdictionLabel = (payload) => {
  const selected = payload?.jurisdictions || {};
  const abbrs = JURISDICTIONS.filter((j) => selected[j.id]).map(
    (j) => JURISDICTION_ABBR[j.id] || j.id.toUpperCase()
  );
  if (abbrs.length === 0) return null;
  if (abbrs.length <= 3) return abbrs.join(" · ");
  return `${abbrs.slice(0, 3).join(" · ")} +${abbrs.length - 3}`;
};

// Soonest obligation deadline across the incident's jurisdictions, or null
// when the draft fails the editor's completeness gate or nothing carries a
// date. The column is about FIRM deadlines: contingent obligations (a
// threshold-gated duty held on an unestablished resident count) count only
// when their conditional date is the nearest one — including the case where
// there are no firm dates at all — and the cell then says so rather than
// presenting the date as settled.
const nextDeadline = (payload, now) => {
  const p = payload || {};
  if (!computableGate(p, now).canCompute) return null;
  const result = computeDeadlines(factsFromPayload(p));
  // Structured refusal (JDC 2026-08-22): treat exactly like "not computable"
  // — the em-dash — never as "nothing due".
  if (!result || result.error) return null;
  // The date prints in the incident's declared zone (ruling B); a legacy
  // record without one falls to the viewer's zone, as before.
  const tz = isValidTimeZone(p.awarenessTz) ? p.awarenessTz : null;
  const soonest = (list, key) => {
    const times = list.filter((x) => x[key]).map((x) => x[key].getTime());
    return times.length ? Math.min(...times) : null;
  };
  const firm = soonest(result.deadlines, "deadline");
  const cont = soonest(result.contingent || [], "conditional_deadline");
  if (firm === null && cont === null) return null;
  if (firm === null || (cont !== null && cont < firm)) {
    return { date: new Date(cont), contingent: true, tz };
  }
  return { date: new Date(firm), contingent: false, tz };
};

// Status chip — the app's chip anatomy (mono caps, 6px radius per the
// recorded radius scale) with solid token fills per lifecycle state
// (treatment C, JDC ruling 2026-07-21): Draft is Parchment with Ink text;
// Active is solid Moss with Bone text; Closed is solid Mist with Midnight
// text.
const STATUS_CHIP = {
  draft: { background: PARCHMENT, color: INK },
  active: { background: MOSS, color: BONE },
  closed: { background: MIST, color: MIDNIGHT },
};

const StatusChip = ({ status }) => (
  <span
    style={{
      fontFamily: MONO_STACK,
      fontSize: 10,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      padding: "2px 8px",
      borderRadius: 6,
      whiteSpace: "nowrap",
      ...(STATUS_CHIP[status] || STATUS_CHIP.draft),
    }}
  >
    {status}
  </span>
);

// Next-deadline cell: upcoming → plain "Feb 21, 2026"; overdue → static
// whole-days "Nd overdue" in semibold Ember mono (the table-scale echo of the
// results page's overdue countdown); not computable → Mist em-dash. A closed
// incident's row is muted: never the Ember overdue treatment — when
// computable, the plain due date renders in Mist; otherwise the em-dash.
// A contingent nearest date (intake phase 2) renders "≤ {date} · contingent"
// in Mist and NEVER takes the overdue treatment: the obligation turns on a
// resident count that has not been established, so the table must not assert
// that anything is due, let alone late.
const NextDeadlineCell = ({ next, now, muted }) => {
  if (!next) return <span style={{ color: MIST }}>—</span>;
  const dateText = formatDateInZone(next.date, next.tz);
  if (next.contingent) {
    return (
      /* Wraps rather than nowraps — the qualified form is longer than the
         110px column and reads fine over two lines. */
      <span style={{ fontSize: 13, color: MIST, lineHeight: 1.35 }}>
        ≤ {dateText} · contingent
      </span>
    );
  }
  if (muted) {
    return <span style={{ fontSize: 13, color: MIST }}>{dateText}</span>;
  }
  if (next.date.getTime() < now.getTime()) {
    const days = Math.floor((now.getTime() - next.date.getTime()) / 86400000);
    return (
      <span style={{ fontFamily: MONO_STACK, fontWeight: 600, fontSize: 13, color: EMBER, whiteSpace: "nowrap" }}>
        {days}d overdue
      </span>
    );
  }
  return <span style={{ fontSize: 13 }}>{dateText}</span>;
};

// Row grid shared by the header row and every incident row so columns align:
// Title | Jurisdictions | Status | Next deadline | Last updated | Delete.
// The delete column keeps the previous 170px — the two-step confirm cluster
// ("Delete? Yes, delete · Cancel") needs it.
const ROW_COLUMNS = "minmax(0, 1fr) 110px 70px 110px 150px 170px";

export default function Incidents() {
  usePageTitle("Respond");
  useTopBarHeader({ title: "Respond" });

  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Two-step delete: the row whose Delete was clicked and is awaiting confirm,
  // and the row whose delete request is in flight.
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await listIncidents(orgId);
        if (!cancelled) setIncidents(rows);
      } catch (err) {
        console.error("Incidents list failed to load:", err);
        if (!cancelled) setError("Couldn't load incidents. Try reloading the page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Derived per-row display data, computed once per list load (static "now" —
  // the overdue figure deliberately does not tick here). Sort order is the
  // data layer's updated_at desc; nothing re-sorts by deadline.
  const rows = useMemo(() => {
    const now = new Date();
    return incidents.map((inc) => ({
      ...inc,
      _now: now,
      _next: nextDeadline(inc.payload, now),
      _jur: jurisdictionLabel(inc.payload),
    }));
  }, [incidents]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError("");
    try {
      await deleteIncident(id);
      setIncidents((prev) => prev.filter((r) => r.id !== id));
      setConfirmingId(null);
    } catch (err) {
      console.error("Incident delete failed:", err);
      setError("Delete failed. The incident is unchanged — try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ background: BONE, color: INK, fontFamily: "'Inter', system-ui, sans-serif", minHeight: "60vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 40px 60px" }}>
        {/* Primary action — filled Midnight, Bone text, 8px radius, left-aligned. */}
        <div style={{ marginBottom: 0 }}>
          <Link
            to="/breach-clock/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: MIDNIGHT,
              color: BONE,
              borderRadius: 8,
              padding: "10px 18px",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <Plus size={13} /> New incident
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 20,
              padding: "10px 14px",
              border: `1px solid ${EMBER}`,
              color: EMBER,
              fontSize: 13,
              lineHeight: 1.5,
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ ...markStyle, padding: "64px 0 24px" }}>Loading…</div>
        ) : incidents.length === 0 ? (
          <div style={{ padding: "40px 0", fontSize: 15, lineHeight: 1.6 }}>
            No incidents saved yet.{" "}
            <Link to="/breach-clock/new" style={{ color: MIDNIGHT, fontWeight: 500 }}>
              New incident
            </Link>
          </div>
        ) : (
          <>
            {/* Eyebrow for the saved stack — the RECENT WORK idiom: spaced
                caps, muted, no rule, sitting directly above the card. */}
            <div style={{ ...markStyle, marginTop: 40, marginBottom: 12 }}>Saved Incidents</div>
            <div style={{ background: "#fff", border: `1px solid ${PARCHMENT}`, borderRadius: 12, overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: ROW_COLUMNS,
                  gap: 16,
                  alignItems: "center",
                  padding: "12px 20px",
                  borderBottom: HAIRLINE,
                }}
              >
                <div style={markStyle}>Title</div>
                <div style={markStyle}>Jurisdictions</div>
                <div style={markStyle}>Status</div>
                <div style={markStyle}>Next deadline</div>
                <div style={markStyle}>Last updated</div>
                <div />
              </div>
              {rows.map((inc, i) => (
                <div
                  key={inc.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: ROW_COLUMNS,
                    gap: 16,
                    alignItems: "center",
                    padding: "14px 20px",
                    borderBottom: i < rows.length - 1 ? "1px solid rgba(27,42,63,0.10)" : "none",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      to={`/breach-clock/${inc.id}`}
                      style={{
                        color: MIDNIGHT,
                        fontSize: 15,
                        fontWeight: 500,
                        textDecoration: "none",
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                    >
                      {inc.title}
                    </Link>
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85, whiteSpace: "nowrap" }}>
                    {inc._jur || <span style={{ color: MIST }}>—</span>}
                  </div>
                  <div>
                    <StatusChip status={inc.status} />
                  </div>
                  <div>
                    <NextDeadlineCell next={inc._next} now={inc._now} muted={inc.status === "closed"} />
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>{fmtUpdated(inc.updated_at)}</div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                    {confirmingId === inc.id ? (
                      <>
                        <span style={{ fontSize: 13, color: EMBER, whiteSpace: "nowrap" }}>Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(inc.id)}
                          disabled={deletingId === inc.id}
                          style={{
                            ...linkButtonStyle,
                            color: EMBER,
                            opacity: deletingId === inc.id ? 0.45 : 1,
                            cursor: deletingId === inc.id ? "default" : "pointer",
                          }}
                        >
                          {deletingId === inc.id ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={deletingId === inc.id}
                          style={linkButtonStyle}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(inc.id)}
                        aria-label={`Delete ${inc.title}`}
                        style={{ ...linkButtonStyle, opacity: 0.6 }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; }}
                      >
                        <X size={13} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
