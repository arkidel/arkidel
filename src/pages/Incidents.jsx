// Incidents list — the org's saved Respond incidents.
//
// Renders inside AppShell (behind RequireAuth + RequireOrg, so activeOrg is
// always present). Reads through the data layer only; each row links to the
// saved incident at /breach-clock/:id. Delete is a two-step confirm inline in
// the row — no modal — and stays on the list after removing the row.
//
// Product chrome styling: inline styles on the Bone canvas with the same
// tokens as BreachClock (white card surface, 12px card radius, hairline rules,
// .section-mark-style spaced caps done inline since BreachClock's <style>
// block isn't in scope here).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { listIncidents, deleteIncident } from "../data/incidents.js";
import { useOrg } from "../org/OrgProvider.jsx";
import usePageTitle from "../usePageTitle.js";
import { useTopBarHeader } from "../components/TopBarContext.jsx";

const MIDNIGHT = "#1B2A3F";
const INK = "#2C2418";
const EMBER = "#C76E3A";
const HAIRLINE = "1px solid rgba(27,42,63,0.18)";

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

// Row grid shared by the header row and every incident row so columns align.
const ROW_COLUMNS = "minmax(0, 1fr) 110px 190px 170px";

export default function Incidents() {
  usePageTitle("Incidents");
  useTopBarHeader({ title: "Incidents" });

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

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError("");
    try {
      await deleteIncident(id);
      setIncidents((rows) => rows.filter((r) => r.id !== id));
      setConfirmingId(null);
    } catch (err) {
      console.error("Incident delete failed:", err);
      setError("Delete failed. The incident is unchanged — try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ background: "#FAF8F2", color: INK, fontFamily: "'Inter', system-ui, sans-serif", minHeight: "60vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 40px 60px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <Link
            to="/breach-clock"
            style={{
              ...linkButtonStyle,
              textDecoration: "none",
              border: `1px solid ${MIDNIGHT}`,
              borderRadius: 8,
              padding: "8px 16px",
              opacity: 1,
            }}
          >
            <Plus size={13} /> New incident
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
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
          <div style={{ ...markStyle, padding: "24px 0" }}>Loading…</div>
        ) : incidents.length === 0 ? (
          <div style={{ padding: "32px 0", fontSize: 15, lineHeight: 1.6 }}>
            No incidents saved yet.{" "}
            <Link to="/breach-clock" style={{ color: MIDNIGHT, fontWeight: 500 }}>
              New incident
            </Link>
          </div>
        ) : (
          <div style={{ background: "#fff", border: HAIRLINE, borderRadius: 12, overflow: "hidden" }}>
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
              <div style={markStyle}>Status</div>
              <div style={markStyle}>Last updated</div>
              <div />
            </div>
            {incidents.map((inc, i) => (
              <div
                key={inc.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: ROW_COLUMNS,
                  gap: 16,
                  alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: i < incidents.length - 1 ? "1px solid rgba(27,42,63,0.10)" : "none",
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
                <div style={{ ...markStyle, opacity: 0.6 }}>{inc.status}</div>
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
        )}
      </div>
    </div>
  );
}
