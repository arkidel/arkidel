// Inverse route guard for the landing page.
//
// The mirror of RequireAuth: renders its children only when NO session
// exists. A signed-in user hitting "/" is sent straight into the app
// (/breach-clock — Respond is the app's main page today; its RequireOrg
// guard forwards no-org users on to /app onboarding, so both cases land
// correctly). While the initial session load is in flight it renders a
// quiet Bone frame rather than deciding — otherwise a signed-in user would
// see a flash of the marketing page before the redirect. The wait is a few
// milliseconds (getSession reads persisted local state), so anonymous
// visitors don't perceive it.
//
// Like RequireAuth, this only consumes useAuth() and never touches the
// Supabase client directly.

import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";

export default function RedirectIfAuthed({ to = "/breach-clock", children }) {
  const { session, loading } = useAuth();

  if (loading) {
    // Don't decide until the session is known. Deliberately textless —
    // flashing "Loading…" on every marketing visit would be worse than a
    // momentary blank canvas.
    return <div className="min-h-screen bg-bone" />;
  }

  if (session) {
    return <Navigate to={to} replace />;
  }

  return children;
}
