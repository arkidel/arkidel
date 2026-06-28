// Signed-in application shell — phase 1 (visual scaffold only).
//
// A full-height flex row: a collapsible left module rail (Midnight) beside the
// wrapped route's content region (Bone canvas). This is the chrome for the
// product surfaces (Respond today, Map and the rest later); it replaces the
// marketing masthead/footer Layout for those routes. The route is slotted via
// <Outlet/>, mirroring how Layout wraps the public routes in App.jsx.
//
// Out of scope this phase (do not build here): persisting expand/collapse
// (phase 2), the account menu + sign-out + account page (phase 3), and the org
// switcher + the Map route (phase 4). The TODOs below mark where each attaches.
//
// ArkidelLogo and ArkidelGlyph are consumed, never redrawn — they own the rune
// and the module figures respectively; color flows in via `currentColor`.

import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ChevronsRight, ChevronsLeft } from "lucide-react";
import ArkidelLogo from "./ArkidelLogo.jsx";
import ArkidelGlyph from "./ArkidelGlyph.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";

// Brand palette (named tokens from CLAUDE.md). Inlined here because the rail is
// product chrome styled like BreachClock — inline styles, not Tailwind.
const MIDNIGHT = "#1B2A3F";
const BONE = "#FAF8F2";
const PARCHMENT = "#E8DDC4";
const MIST = "#9FAEC2";
const AVATAR_BG = "#2C3E55"; // lightened Midnight, per palette

const COLLAPSED_WIDTH = 72;
const EXPANDED_WIDTH = 210;

// Per-browser UI preference — purely client-side (no Supabase, no auth
// coupling). Survives reloads; resets only if the user clears storage.
const RAIL_EXPANDED_KEY = "arkidel.shell.railExpanded";

// Module rail entries. Respond navigates to its live route; Map is rendered as
// a non-navigating placeholder until the Map route lands (phase 4) — `to: null`.
// TODO(phase 4): give Map a real `to` once the Map route exists.
const MODULES = [
  { module: "respond", label: "Respond", to: "/breach-clock" },
  { module: "map", label: "Map", to: null },
];

export default function AppShell() {
  // Lazy initializer reads the stored preference synchronously, so the rail
  // paints in its saved state on the first render with no collapsed→expanded
  // flash. Defaults to collapsed when absent or unreadable (private mode, etc.).
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(RAIL_EXPANDED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const { user } = useAuth();

  // Persist on change. Wrapped so a storage failure can never break the toggle.
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_EXPANDED_KEY, String(expanded));
    } catch {
      // ignore — storage disabled or full; the rail still works in-session.
    }
  }, [expanded]);

  // Avatar initial: full_name doesn't exist yet (phase 3), so derive from the
  // email when one is trivially in scope, else a neutral placeholder glyph.
  const avatarInitial = user?.email ? user.email.trim().charAt(0).toUpperCase() : "·";

  const railWidth = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BONE }}>
      <nav
        aria-label="Modules"
        style={{
          flex: `0 0 ${railWidth}px`,
          width: railWidth,
          background: MIDNIGHT,
          position: "sticky",
          top: 0,
          height: "100vh",
          alignSelf: "flex-start",
          display: "flex",
          flexDirection: "column",
          transition: "width .26s ease",
          overflow: "hidden",
        }}
      >
        {/* BRAND */}
        <Link
          to="/"
          aria-label="Arkidel home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            height: 79,
            padding: expanded ? "0 18px" : 0,
            justifyContent: expanded ? "flex-start" : "center",
            color: PARCHMENT,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {/* ArkidelLogo sizes off className (no style prop), like Layout. */}
          <ArkidelLogo frame className="w-[33px] h-[33px] shrink-0" />
          {expanded && (
            <span
              style={{
                fontFamily: "Merriweather, serif",
                fontSize: 19,
                letterSpacing: "1.2px",
                color: PARCHMENT,
                whiteSpace: "nowrap",
              }}
            >
              Arkidel
            </span>
          )}
        </Link>

        <RailDivider />

        {/* MODULES */}
        <div style={{ display: "flex", flexDirection: "column", paddingTop: 8 }}>
          {MODULES.map((m) => (
            <ModuleItem
              key={m.module}
              module={m.module}
              label={m.label}
              to={m.to}
              expanded={expanded}
              active={m.to != null && location.pathname.startsWith(m.to)}
            />
          ))}
        </div>

        {/* SPACER */}
        <div style={{ flex: 1 }} />

        {/* EXPAND TOGGLE */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            height: 48,
            padding: expanded ? "0 22px" : 0,
            justifyContent: expanded ? "flex-start" : "center",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: MIST,
            font: "inherit",
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
          }}
        >
          {expanded ? (
            <>
              <ChevronsLeft size={20} aria-hidden="true" />
              <span style={{ whiteSpace: "nowrap" }}>Collapse</span>
            </>
          ) : (
            <ChevronsRight size={20} aria-hidden="true" />
          )}
        </button>

        <RailDivider />

        {/* ACCOUNT FOOT — static stub. TODO(phase 3): attach the account menu
            (sign-out, account page / set full_name) to this control. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            height: 64,
            padding: expanded ? "0 16px" : 0,
            justifyContent: expanded ? "flex-start" : "center",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden={user?.email ? undefined : "true"}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: AVATAR_BG,
              border: "1.5px solid rgba(232,221,196,.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: PARCHMENT,
              fontFamily: "Merriweather, serif",
              fontSize: 14,
            }}
          >
            {avatarInitial}
          </span>
          {expanded && (
            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
              <div
                style={{
                  color: BONE,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.email ?? "Not signed in"}
              </div>
              <div
                style={{
                  color: MIST,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Account
              </div>
            </div>
          )}
          {expanded && (
            <ChevronsRight size={16} aria-hidden="true" style={{ color: MIST, flexShrink: 0 }} />
          )}
        </div>
      </nav>

      {/* CONTENT REGION — renders the wrapped route. Keeps the Bone canvas. */}
      <div style={{ flex: 1, minWidth: 0, background: BONE }}>
        <Outlet />
      </div>
    </div>
  );
}

function RailDivider() {
  return (
    <div
      style={{
        height: 1,
        background: "rgba(232,221,196,.14)",
        margin: "0 14px",
        flexShrink: 0,
      }}
    />
  );
}

// One module rail item. Active = brighter glyph in Bone + a Parchment edge-bar
// at the rail's left edge; inactive = Mist glyph, no bar. Respond links; Map is
// a non-navigating placeholder (`to == null`) rendered as a plain element so it
// carries no href until its route exists.
function ModuleItem({ module, label, to, expanded, active }) {
  const color = active ? BONE : MIST;

  const inner = (
    <>
      {/* Active edge-bar at the rail's left edge. */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            background: PARCHMENT,
            borderRadius: "0 3px 3px 0",
          }}
        />
      )}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
        }}
      >
        <ArkidelGlyph module={module} frame style={{ width: 36, height: 36 }} />
      </span>
      {expanded ? (
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            color,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      ) : (
        // Visually-hidden accessible name when the label is hidden.
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {label}
        </span>
      )}
    </>
  );

  const itemStyle = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 14,
    height: 54,
    padding: expanded ? "0 18px" : 0,
    justifyContent: expanded ? "flex-start" : "center",
    textDecoration: "none",
    background: "transparent",
    border: "none",
    width: "100%",
    cursor: to ? "pointer" : "default",
  };

  if (to) {
    return (
      <Link to={to} aria-label={label} aria-current={active ? "page" : undefined} style={itemStyle}>
        {inner}
      </Link>
    );
  }

  // Placeholder (Map): non-navigating, no href. Marked disabled for AT.
  return (
    <div role="link" aria-label={label} aria-disabled="true" style={itemStyle}>
      {inner}
    </div>
  );
}
