// Shared account menu: AvatarCircle trigger + popover.
//
// One component for every surface that shows the account entry point (landing
// header, app rail foot). Signed in: identity header, Account, Sign out —
// the same items and a11y contract as the former rail-foot menu (Escape closes
// and returns focus to the trigger; click-outside closes; first item focused
// on open; Tab is the only traversal). Signed out: a single Sign in link.
//
// Session state is read via the provider-independent auth/session helpers
// (getSession on mount + an onAuthStateChange subscription, unsubscribed on
// unmount) so the component works standalone on pages with no OrgProvider — it
// deliberately depends on neither OrgProvider nor useAuth. The identity block
// shows the profile full name (email only as a fallback) over the org name.
// Both prefer caller props (the rail passes what it already holds); whatever
// isn't passed is fetched lazily on first menu open through the data layer —
// and cached per user id, so re-opens never refetch.
//
// The popover self-places off the trigger's viewport position: upward when
// the trigger sits in the lower half (rail foot), downward otherwise (header),
// right-aligned when the trigger is in the right half.

import { forwardRef, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSession, onAuthStateChange, signOut } from "../auth/session.js";
import { getMyOrganizations } from "../data/organizations.js";
import { getProfile } from "../data/profiles.js";
import AvatarCircle from "./AvatarCircle.jsx";

// Brand palette (named tokens from CLAUDE.md), matching the rail's inline
// styling — the panel reads as product chrome on any surface.
const BONE = "#FAF8F2";
const MIST = "#9FAEC2";
const MENU_BG = "#2C3E55"; // popover panel — one shade above the Midnight rail
const MENU_ITEM_HOVER = "#35495F"; // subtle lift for hovered/focused items

const MENU_WIDTH = 220;
const GAP = 8;

// Optional trigger extensions: `children` renders inside the trigger button
// after the AvatarCircle (pass a function to receive the open state — the rail
// uses this for its name/"Account" row and open-state chevron), and
// `triggerStyle` merges over the button's base style (the rail widens the
// trigger to the full foot row). With neither, the trigger is the bare circle.
export default function AccountMenu({ size = 34, displayName, orgName, triggerStyle, children }) {
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({});
  const [lit, setLit] = useState(false);
  // Lazily-fetched identity, cached per user id (userId marks which user the
  // fetch belongs to, so a sign-out/sign-in invalidates it naturally).
  const [identity, setIdentity] = useState({ userId: null, name: null, orgName: null });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const firstItemRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getSession().then(({ data }) => {
      if (active) setSession(data.session ?? null);
    });
    const {
      data: { subscription },
    } = onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  // Line 1: profile full name, from the prop or the lazy fetch; the email is
  // only the no-profile-name fallback. Line 2: org name, or omitted entirely.
  const name = displayName || identity.name || user?.email || "Not signed in";
  const org = orgName || identity.orgName || null;

  // Fetch whatever identity the caller didn't pass as props: the profile full
  // name (profiles table) and the first org's name (single-org assumption,
  // matching OrgProvider's activeOrg). Runs once per user id; results land in
  // the cache above.
  async function loadIdentity(u) {
    setIdentity({ userId: u.id, name: null, orgName: null });
    const [profile, orgs] = await Promise.all([
      displayName
        ? Promise.resolve(null)
        : getProfile(u.id).catch(() => null),
      orgName ? Promise.resolve([]) : getMyOrganizations().catch(() => []),
    ]);
    setIdentity((prev) =>
      // Discard a resolved fetch for a stale user (signed out mid-flight).
      prev.userId === u.id
        ? {
            userId: u.id,
            name: profile?.full_name ?? null,
            orgName: orgs[0]?.name ?? null,
          }
        : prev
    );
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (user && identity.userId !== user.id && (!displayName || !orgName)) {
      loadIdentity(user);
    }
    // Anchor the fixed-position panel to the trigger's current viewport rect.
    const rect = triggerRef.current.getBoundingClientRect();
    const openUp = rect.top > window.innerHeight / 2;
    const alignRight = rect.left + rect.width / 2 > window.innerWidth / 2;
    setPos({
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      ...(alignRight
        ? { right: Math.max(8, window.innerWidth - rect.right) }
        : { left: Math.max(8, rect.left) }),
    });
    setOpen(true);
  }

  // Dismiss listeners live only while the menu is open. Escape closes and
  // returns focus to the trigger; a mousedown outside both the panel and the
  // trigger closes (the trigger is excluded so its own click stays a toggle,
  // not a close-then-reopen).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onMouseDown(e) {
      if (menuRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  // On open, move focus to the first menuitem.
  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onMouseEnter={() => setLit(true)}
        onMouseLeave={() => setLit(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          borderRadius: "50%",
          color: lit || open ? BONE : MIST,
          transition: "color .15s ease",
          font: "inherit",
          textAlign: "left",
          // No `outline: none` — the UA focus ring stays as the visible
          // keyboard-focus affordance, matching the rail's buttons.
          ...triggerStyle,
        }}
      >
        <AvatarCircle size={size} />
        {typeof children === "function" ? children(open) : children}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          style={{
            position: "fixed",
            zIndex: 40,
            width: MENU_WIDTH,
            ...pos,
            background: MENU_BG,
            border: "1px solid rgba(159,174,194,.25)",
            borderRadius: 12,
            boxShadow: "0 10px 28px rgba(0,0,0,.35)",
            padding: 7,
          }}
        >
          {user ? (
            <>
              {/* Identity header — presentational, not a menuitem. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 8px 10px",
                  color: MIST,
                }}
              >
                <AvatarCircle size={30} />
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
                    {name}
                  </div>
                  {org && (
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
                      {org}
                    </div>
                  )}
                </div>
              </div>

              <AccountMenuItem
                ref={firstItemRef}
                to="/account"
                onClick={() => setOpen(false)}
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
                  setOpen(false);
                  // Await the session clear before navigating: /sign-in
                  // forwards signed-in users to /app, so navigating while the
                  // session is still live would bounce through /app first
                  // (ruled 2026-07-17: sign-out lands on /sign-in,
                  // deterministically).
                  await signOut();
                  navigate("/sign-in");
                }}
              >
                Sign out
              </AccountMenuItem>
            </>
          ) : (
            <AccountMenuItem
              ref={firstItemRef}
              to="/sign-in"
              onClick={() => setOpen(false)}
            >
              Sign in
            </AccountMenuItem>
          )}
        </div>
      )}
    </>
  );
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
