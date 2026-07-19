// App home (/app) — the signed-in landing page, shown by the AppArea gate once
// the user is signed in AND belongs to an organization.
//
// Replaces the former stub wholesale. Renders inside AppShell, so the top bar
// carries the org name (this is the one page whose top-bar title is the org —
// it has no document of its own) and the rail's AccountMenu owns sign-out.
//
// Content: a serif greeting with the current date, a TOOLS card grid (Respond
// live, Map in development), and RECENT WORK — the 3 most recently updated
// incidents via listIncidents, sliced client-side.
//
// Product chrome styling: inline styles on the Bone canvas with the same
// tokens as Incidents.jsx (white card surface, 12px card radius, hairline
// rules, spaced-caps section labels done inline).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listIncidents } from "../data/incidents.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useOrg } from "../org/OrgProvider.jsx";
import usePageTitle from "../usePageTitle.js";
import { useTopBarHeader } from "../components/TopBarContext.jsx";
import ArkidelGlyph from "../components/ArkidelGlyph.jsx";

const MIDNIGHT = "#1B2A3F";
const INK = "#2C2418";
const PARCHMENT = "#E8DDC4";
const HAIRLINE = "1px solid rgba(27,42,63,0.18)";
const ROW_HAIRLINE = "1px solid rgba(27,42,63,0.10)";

const markStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: MIDNIGHT,
  opacity: 0.7,
};

const footerActionStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  fontWeight: 500,
  color: MIDNIGHT,
};

// "Today, 8:29 PM" for same-day activity, "Jul 8" otherwise — tighter than the
// Incidents list's full stamp; this is a glanceable home-page recap.
const fmtUpdated = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Small Midnight tile carrying a module glyph. The tile's 8px softened square
// stands in for the glyph's own frame (frame={false}), so the mark doesn't
// double-box; the glyph inherits Parchment via color.
function GlyphTile({ module }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        background: MIDNIGHT,
        borderRadius: 8,
        color: PARCHMENT,
      }}
    >
      <ArkidelGlyph module={module} frame={false} style={{ width: 30, height: 30 }} />
    </span>
  );
}

export default function AppHome() {
  usePageTitle("Home");

  const { profile } = useAuth();
  const { activeOrg } = useOrg();
  // The one page whose top-bar title is the org name — no eyebrow.
  useTopBarHeader({ title: activeOrg?.name });

  const orgId = activeOrg?.id;

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const rows = await listIncidents(orgId);
        // Newest-first from the data layer; the home shows only the top 3.
        if (!cancelled) setIncidents(rows.slice(0, 3));
      } catch (err) {
        console.error("Recent incidents failed to load:", err);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Greeting name: nickname wins, else the first token of the full name,
  // else the plain greeting.
  const firstName =
    profile?.nickname?.trim() || profile?.full_name?.trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{ background: "#FAF8F2", color: INK, fontFamily: "'Inter', system-ui, sans-serif", minHeight: "60vh" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 40px 60px" }}>
        {/* GREETING */}
        <h1
          style={{
            fontFamily: "'Merriweather', serif",
            fontWeight: 400,
            fontSize: 30,
            letterSpacing: "-0.01em",
            color: MIDNIGHT,
            margin: 0,
          }}
        >
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <div style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>{today}</div>

        {/* TOOLS */}
        <div style={{ ...markStyle, marginTop: 40, marginBottom: 14 }}>Tools</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {/* Respond — live; the whole card is the "New incident →" action,
              linking to the fresh intake form (the list lives at
              /breach-clock, reachable via the rail and "View all"). */}
          <Link
            to="/breach-clock/new"
            style={{
              display: "block",
              background: "#fff",
              border: HAIRLINE,
              borderRadius: 12,
              padding: "20px 22px",
              textDecoration: "none",
              color: INK,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(27,42,63,0.45)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(27,42,63,0.18)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <GlyphTile module="respond" />
              <span style={{ fontFamily: "'Merriweather', serif", fontSize: 19, color: MIDNIGHT }}>
                Respond
              </span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: "14px 0 16px", opacity: 0.8 }}>
              Record incident details, calculate notification deadlines, and
              produce an audit-ready memo.
            </p>
            <div style={footerActionStyle}>New incident →</div>
          </Link>

          {/* Map — in development; deliberately not a link, no hover affordance. */}
          <div
            style={{
              background: "#fff",
              border: HAIRLINE,
              borderRadius: 12,
              padding: "20px 22px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <GlyphTile module="map" />
              <span style={{ fontFamily: "'Merriweather', serif", fontSize: 19, color: MIDNIGHT }}>
                Map
              </span>
              {/* Parchment chip, matching the risk section's "Suggested" tag idiom. */}
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: MIDNIGHT,
                  opacity: 0.6,
                  background: PARCHMENT,
                  padding: "2px 8px",
                  borderRadius: 6,
                  whiteSpace: "nowrap",
                }}
              >
                In development
              </span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: "14px 0 16px", opacity: 0.8 }}>
              Inventory processing activities and data flows across your
              organization.
            </p>
            <div style={{ ...footerActionStyle, fontWeight: 400, opacity: 0.55 }}>Coming soon</div>
          </div>
        </div>

        {/* RECENT WORK */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginTop: 44,
            marginBottom: 6,
          }}
        >
          <div style={markStyle}>Recent work</div>
          <Link to="/breach-clock" style={{ ...footerActionStyle, textDecoration: "none" }}>
            View all →
          </Link>
        </div>

        {loading ? (
          // Quiet placeholder while the list resolves — no spinner text.
          <div
            aria-hidden="true"
            style={{ height: 56, borderTop: ROW_HAIRLINE, background: "rgba(27,42,63,0.03)" }}
          />
        ) : loadFailed ? (
          <div style={{ borderTop: ROW_HAIRLINE, padding: "16px 0", fontSize: 14, opacity: 0.65 }}>
            Couldn't load recent work. Try reloading the page.
          </div>
        ) : incidents.length === 0 ? (
          <div style={{ borderTop: ROW_HAIRLINE, padding: "16px 0", fontSize: 14, opacity: 0.75 }}>
            Nothing saved yet — start with{" "}
            <Link to="/breach-clock" style={{ color: MIDNIGHT, fontWeight: 500 }}>
              Respond
            </Link>
            .
          </div>
        ) : (
          <div>
            {incidents.map((inc) => (
              <div
                key={inc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "13px 0",
                  borderTop: ROW_HAIRLINE,
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
                  <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2 }}>
                    {capitalize(inc.status)} · Respond
                  </div>
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {fmtUpdated(inc.updated_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
