// Signed-in application shell.
//
// A full-height flex row: a collapsible left module rail (Midnight) beside the
// wrapped route's content region (Bone canvas). This is the chrome for the
// product surfaces (Respond today, Map and the rest later); it replaces the
// marketing masthead/footer Layout for those routes. The route is slotted via
// <Outlet/>, mirroring how Layout wraps the public routes in App.jsx.
//
// The account foot is the shared AccountMenu (AvatarCircle trigger + popover):
// signed in, it opens an upward menu with Account + Sign out; signed out, the
// menu offers Sign in. The menu component owns its own session state and a11y
// contract. Still out of scope: the org switcher + the Map route (phase 4).
//
// ArkidelLogo and ArkidelGlyph are consumed, never redrawn — they own the rune
// and the module figures respectively; color flows in via `currentColor`.

import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ChevronsRight, ChevronsLeft, ChevronsUp, Files, Search } from "lucide-react";
import ArkidelLogo from "./ArkidelLogo.jsx";
import ArkidelGlyph from "./ArkidelGlyph.jsx";
import AccountMenu from "./AccountMenu.jsx";
import TopBarContext from "./TopBarContext.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useOrg } from "../org/OrgProvider.jsx";

// Brand palette (named tokens from CLAUDE.md). Inlined here because the rail is
// product chrome styled like BreachClock — inline styles, not Tailwind.
const MIDNIGHT = "#1B2A3F";
const BONE = "#FAF8F2";
const PARCHMENT = "#E8DDC4";
const MIST = "#9FAEC2";

const COLLAPSED_WIDTH = 72;
const EXPANDED_WIDTH = 210;

// Per-browser UI preference — purely client-side (no Supabase, no auth
// coupling). Survives reloads; resets only if the user clears storage.
const RAIL_EXPANDED_KEY = "arkidel.shell.railExpanded";

// Module rail entries. Respond navigates to its live route; Map is rendered as
// a non-navigating placeholder until the Map route lands (phase 4) — `to: null`.
// TODO(phase 4): give Map a real `to` once the Map route exists.
// Incidents is a page, not a module — it carries a lucide `icon` instead of an
// ArkidelGlyph `module` figure, and sits right after Respond since it lists
// Respond's saved work product.
const MODULES = [
  { module: "respond", label: "Respond", to: "/breach-clock" },
  { module: "incidents", label: "Incidents", to: "/incidents", icon: Files },
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
  const { user, profile } = useAuth();
  // The shell renders inside the authed boundary's OrgProvider (App.jsx), so
  // the shared org context is available here; passing the name spares the
  // menu its lazy fetch.
  const { activeOrg } = useOrg();

  // Top-bar header slot ({ eyebrow, title } or null), set by the routed page
  // via useTopBarHeader (TopBarContext). setHeader is referentially stable, so
  // providing it directly re-renders no consumer except on header changes.
  const [header, setHeader] = useState(null);

  // Primary name line in the expanded foot: full name when set, else the
  // sign-in email. The menu's identity line derives the same way internally.
  const displayName = profile?.full_name || user?.email || "Not signed in";

  // Persist on change. Wrapped so a storage failure can never break the toggle.
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_EXPANDED_KEY, String(expanded));
    } catch {
      // ignore — storage disabled or full; the rail still works in-session.
    }
  }, [expanded]);

  const railWidth = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <TopBarContext.Provider value={setHeader}>
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
              icon={m.icon}
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

        {/* ACCOUNT FOOT — the shared AccountMenu, with the trigger widened to
            the full foot row: AvatarCircle takes the old initials dot's place
            at 34px, and when expanded the pre-avatar-unification layout is
            restored via trigger children — name/"Account" text row plus the
            open-state chevron. The popover self-places upward off the foot's
            viewport position (still position:fixed, so the rail's
            overflow:hidden never clips it). displayName passes the
            profile-derived name so the menu's identity line matches the foot. */}
        <AccountMenu
          displayName={profile?.full_name || undefined}
          orgName={activeOrg?.name || undefined}
          triggerStyle={{
            display: "flex",
            gap: 12,
            height: 64,
            padding: expanded ? "0 16px" : 0,
            justifyContent: expanded ? "flex-start" : "center",
            flexShrink: 0,
            width: "100%",
            borderRadius: 0,
          }}
        >
          {(menuOpen) => (
            <>
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
                    {user ? displayName : "Sign in"}
                  </div>
                  {user && (
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
                  )}
                </div>
              )}
              {expanded &&
                (menuOpen ? (
                  <ChevronsUp size={16} aria-hidden="true" style={{ color: MIST, flexShrink: 0 }} />
                ) : (
                  <ChevronsRight size={16} aria-hidden="true" style={{ color: MIST, flexShrink: 0 }} />
                ))}
            </>
          )}
        </AccountMenu>
      </nav>

      {/* CONTENT REGION — renders the wrapped route. Keeps the Bone canvas. */}
      <div style={{ flex: 1, minWidth: 0, background: BONE, display: "flex", flexDirection: "column" }}>
        {/* Slim app top bar — same Bone background as the page, closed by a
            bottom hairline in the tool's section-rule color. Left: the page's
            header slot (small-caps eyebrow over a serif title), fed by the
            routed page through TopBarContext; empty when no page sets it.
            Right: a visual-only search stub (no backend yet — the form exists
            solely to swallow Enter's default submit); a Mist magnifying-glass
            icon inside the field stands in for placeholder text. Deliberately
            tight: the bar grows only enough to fit the two-line title block.
            Future shell features land here. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            // Top stays tight; the 10px bottom gives the title block air
            // before the hairline (paired with the content margin below it).
            padding: "8px 24px 10px",
            borderBottom: "1px solid rgba(27,42,63,0.18)",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {header?.eyebrow && (
              <div
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: MIDNIGHT,
                  opacity: 0.7,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {header.eyebrow}
              </div>
            )}
            {header?.title && (
              <div
                style={{
                  fontFamily: "Merriweather, serif",
                  fontSize: 18,
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  color: MIDNIGHT,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {header.title}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            style={{ margin: 0, position: "relative", flex: "0 1 420px", minWidth: 160 }}
          >
            <Search
              size={14}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: MIST,
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              aria-label="Search"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "#2C2418",
                background: "#FFFFFF",
                border: "1px solid rgba(27,42,63,0.25)",
                borderRadius: 8,
                padding: "4px 10px 4px 32px",
                width: "100%",
                outline: "none",
              }}
            />
          </form>
        </div>
        {/* 16px below the hairline before the routed page begins — with the
            bar's 10px bottom padding this puts ~26px between the title text
            and the page's first content ("On this page" index level). */}
        <div style={{ marginTop: 16 }}>
          <Outlet />
        </div>
      </div>
    </div>
    </TopBarContext.Provider>
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
// carries no href until its route exists. An entry with `icon` (a lucide
// component — page entries like Incidents) renders that instead of the framed
// ArkidelGlyph module figure, centered in the same 36px footprint so the two
// kinds align.
function ModuleItem({ module, label, to, icon: Icon, expanded, active }) {
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
          width: 36,
          height: 36,
        }}
      >
        {Icon ? (
          <Icon size={22} strokeWidth={1.5} />
        ) : (
          <ArkidelGlyph module={module} frame style={{ width: 36, height: 36 }} />
        )}
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
