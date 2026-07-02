// Signed-in application shell.
//
// A full-height flex row: a collapsible left module rail (Midnight) beside the
// wrapped route's content region (Bone canvas). This is the chrome for the
// product surfaces (Respond today, Map and the rest later); it replaces the
// marketing masthead/footer Layout for those routes. The route is slotted via
// <Outlet/>, mirroring how Layout wraps the public routes in App.jsx.
//
// The account foot is now a menu trigger (phase 3b): signed in, it opens an
// upward popover with Account + Sign out; signed out, it routes straight to
// /sign-in. Still out of scope: the org switcher + the Map route (phase 4).
//
// ArkidelLogo and ArkidelGlyph are consumed, never redrawn — they own the rune
// and the module figures respectively; color flows in via `currentColor`.

import { forwardRef, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronsRight, ChevronsLeft, ChevronsUp } from "lucide-react";
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
const MENU_BG = "#2C3E55"; // popover panel — one shade above the rail
const MENU_ITEM_HOVER = "#35495F"; // subtle lift for hovered/focused items

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
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  // Account menu (signed-in only). Refs on the trigger and the panel drive
  // click-outside detection and focus return on Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const firstItemRef = useRef(null);

  // Persist on change. Wrapped so a storage failure can never break the toggle.
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_EXPANDED_KEY, String(expanded));
    } catch {
      // ignore — storage disabled or full; the rail still works in-session.
    }
  }, [expanded]);

  // Dismiss listeners live only while the menu is open. Escape closes and
  // returns focus to the trigger; a mousedown outside both the panel and the
  // trigger closes (the trigger is excluded so its own click stays a toggle,
  // not a close-then-reopen).
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onMouseDown(e) {
      if (menuRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuOpen]);

  // On open, move focus to the first menuitem (Account).
  useEffect(() => {
    if (menuOpen) firstItemRef.current?.focus();
  }, [menuOpen]);

  // Identity shown in the foot. Prefer the profile's full name: first+last
  // initials when it has two or more words ("James Cormier" → "JC"), else its
  // first letter; fall back to the email's first letter, then a neutral glyph.
  const avatarInitial = initialsFor(profile?.full_name, user?.email);
  // Primary name line: full name when set, else the sign-in email.
  const displayName = profile?.full_name || user?.email || "Not signed in";

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

        {/* ACCOUNT FOOT — menu trigger when signed in, direct /sign-in link
            when signed out. Resting layout matches the former static stub. */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (user) setMenuOpen((v) => !v);
            else navigate("/sign-in");
          }}
          aria-haspopup={user ? "menu" : undefined}
          aria-expanded={user ? menuOpen : undefined}
          aria-label={expanded ? undefined : user ? "Account menu" : "Sign in"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            height: 64,
            padding: expanded ? "0 16px" : 0,
            justifyContent: expanded ? "flex-start" : "center",
            flexShrink: 0,
            width: "100%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
            // No `outline: none` — the UA focus ring stays as the visible
            // keyboard-focus affordance on the Midnight rail.
          }}
        >
          <span
            aria-hidden="true"
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
        </button>

        {/* ACCOUNT MENU — opens upward from the foot. Rendered position:fixed
            because the rail's overflow:hidden (needed for the width transition)
            would clip an absolutely-positioned fly-out in the collapsed state;
            the rail is sticky at full viewport height, so the foot's geometry
            is deterministic. Expanded: above the foot, inside the rail width.
            Collapsed: up-and-right past the rail's edge (72px can't hold it). */}
        {user && menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            style={{
              position: "fixed",
              zIndex: 40,
              ...(expanded
                ? { left: 10, bottom: 70, width: EXPANDED_WIDTH - 20 }
                : { left: COLLAPSED_WIDTH + 8, bottom: 12, width: 220 }),
              background: MENU_BG,
              border: "1px solid rgba(159,174,194,.25)",
              borderRadius: 12,
              boxShadow: "0 10px 28px rgba(0,0,0,.35)",
              padding: 7,
            }}
          >
            {/* Identity header — presentational, not a menuitem. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px 10px",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: MIDNIGHT,
                  border: "1.5px solid rgba(232,221,196,.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: PARCHMENT,
                  fontFamily: "Merriweather, serif",
                  fontSize: 12,
                }}
              >
                {avatarInitial}
              </span>
              <div style={{ minWidth: 0, lineHeight: 1.3 }}>
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
                  {displayName}
                </div>
                {user.email && (
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
                    {user.email}
                  </div>
                )}
              </div>
            </div>

            <AccountMenuItem
              ref={firstItemRef}
              to="/account"
              onClick={() => setMenuOpen(false)}
            >
              Account
            </AccountMenuItem>

            <div
              role="separator"
              style={{
                height: 1,
                background: "rgba(159,174,194,.15)",
                margin: "5px 2px",
              }}
            />

            <AccountMenuItem
              onClick={async () => {
                setMenuOpen(false);
                await signOut();
                navigate("/");
              }}
            >
              Sign out
            </AccountMenuItem>
          </div>
        )}
      </nav>

      {/* CONTENT REGION — renders the wrapped route. Keeps the Bone canvas. */}
      <div style={{ flex: 1, minWidth: 0, background: BONE }}>
        <Outlet />
      </div>
    </div>
  );
}

// Avatar initials. From a full name: first + last initial when it has two or
// more words ("James Cormier" → "JC"), else the single first letter. Falls back
// to the email's first letter, then a neutral placeholder glyph. Always upper.
function initialsFor(fullName, email) {
  const name = (fullName ?? "").trim();
  if (name) {
    const words = name.split(/\s+/);
    const letters =
      words.length >= 2 ? words[0][0] + words[words.length - 1][0] : words[0][0];
    return letters.toUpperCase();
  }
  if (email) return email.trim().charAt(0).toUpperCase();
  return "·";
}

// One account-menu action. Renders a router <Link> when `to` is given, else a
// <button>. Hover and keyboard focus share the same subtle background lift
// (inline styles can't express :hover, so it's a small state). Deliberately no
// roving tabindex / arrow keys — Escape + click-outside + Tab is the contract.
const AccountMenuItem = forwardRef(function AccountMenuItem(
  { to, onClick, children },
  ref
) {
  const [lit, setLit] = useState(false);

  const style = {
    display: "block",
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    background: lit ? MENU_ITEM_HOVER : "transparent",
    color: BONE,
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    lineHeight: 1.3,
    textAlign: "left",
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
  };
  const handlers = {
    onMouseEnter: () => setLit(true),
    onMouseLeave: () => setLit(false),
    onFocus: () => setLit(true),
    onBlur: () => setLit(false),
  };

  if (to) {
    return (
      <Link ref={ref} role="menuitem" to={to} onClick={onClick} style={style} {...handlers}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} type="button" role="menuitem" onClick={onClick} style={style} {...handlers}>
      {children}
    </button>
  );
});

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
