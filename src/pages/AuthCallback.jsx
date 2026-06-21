// Magic-link landing page (/auth/callback).
//
// The Supabase client has detectSessionInUrl on, so it parses the token out of
// the URL and establishes the session as part of the AuthProvider's initial
// load. This page simply waits for that to resolve: it shows a brief "signing
// you in…" state, then redirects to the authenticated area once the session is
// present. If the link carried an error, or no session materialises once the
// load completes, it shows an error with a way back to /sign-in.

import { Link, Navigate } from "react-router-dom";
import usePageTitle from "../usePageTitle.js";
import { useAuth } from "../auth/AuthProvider.jsx";

// Supabase returns auth errors in the URL hash, e.g.
// #error=access_denied&error_description=...
function readHashError() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const description = params.get("error_description");
  const error = params.get("error");
  if (!error && !description) return null;
  return description || error;
}

export default function AuthCallback() {
  usePageTitle("Signing you in");
  const { session, loading } = useAuth();
  const hashError = readHashError();

  // Session established → into the app.
  if (session) {
    return <Navigate to="/app" replace />;
  }

  const failed = hashError || !loading; // error in URL, or load done with no session

  return (
    <div className="min-h-screen flex items-center justify-center bg-bone px-8 text-midnight font-sans">
      <div className="max-w-md text-center">
        {failed ? (
          <>
            <h1 className="font-serif text-3xl mb-3">We couldn't sign you in.</h1>
            <p className="text-base leading-relaxed text-midnight/80 mb-6">
              {hashError
                ? hashError
                : "That sign-in link may have expired or already been used."}
            </p>
            <Link
              to="/sign-in"
              className="text-sm text-midnight underline underline-offset-2 decoration-midnight/40 hover:decoration-midnight transition-colors"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <p role="status" aria-live="polite" className="text-midnight/70">
            Signing you in…
          </p>
        )}
      </div>
    </div>
  );
}
