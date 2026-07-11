// Inverse route guard for public pages that signed-in users should skip.
//
// The mirror of RequireAuth: renders its children only when NO session
// exists. A signed-in user hitting "/" or "/sign-in" is sent straight to
// /app — the signed-in home (its AppArea gate handles the no-org onboarding
// case). While the initial session load is in flight it renders a quiet
// Bone frame rather than deciding — otherwise a signed-in user would see a
// flash of the marketing page before the redirect. The wait is a few
// milliseconds (getSession reads persisted local state), so anonymous
// visitors don't perceive it.
//
// Like RequireAuth, this only consumes useAuth() and never touches the
// Supabase client directly.

import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";

export default function RedirectIfAuthed({ to = "/app", children }) {
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
