// Route guard for org-gated tool routes.
//
// Rendered behind RequireAuth and inside the app-wide OrgProvider (the single
// instance mounted at the authed boundary in App.jsx — this guard deliberately
// does NOT mount its own). It applies the same bar as /app: while orgs
// resolve, a quiet placeholder; signed in but no org, a redirect to /app —
// which renders the existing org-onboarding gate (AppArea). There is
// deliberately no second onboarding here; /app owns that flow.
//
// Like RequireAuth, this only reads context and never touches the Supabase
// client directly.

import { Navigate } from "react-router-dom";
import { useOrg } from "./OrgProvider.jsx";

export default function RequireOrg({ children }) {
  const { activeOrg, loading } = useOrg();

  if (loading) {
    // Don't decide until the org list is known — mirrors AppArea's gate.
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-[50vh] flex items-center justify-center bg-bone text-midnight/60 font-sans text-sm"
      >
        Loading…
      </div>
    );
  }

  if (!activeOrg) {
    return <Navigate to="/app" replace />;
  }

  return children;
}
