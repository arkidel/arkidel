// Route guard for authenticated areas.
//
// Renders its children only when a session exists. While the initial session
// load is in flight (useAuth().loading), it renders a quiet placeholder rather
// than redirecting — otherwise a logged-in user would see a flash of the
// sign-in page before the session resolves. Unauthenticated users are sent to
// /sign-in.
//
// This is part of the auth layer; it consumes useAuth() and never touches the
// Supabase client directly.

import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    // Don't decide until the session is known.
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex items-center justify-center bg-bone text-midnight/60 font-sans text-sm"
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />;
  }

  return children;
}
