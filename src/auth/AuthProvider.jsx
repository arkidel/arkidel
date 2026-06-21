// Auth context: session plumbing only.
//
// This is one of the two boundaries allowed to import the Supabase client
// (the other is src/data/**). It owns the session lifecycle and exposes a
// minimal auth surface to the app. It does NOT render any sign-in UI, and it
// deliberately bundles no newsletter or marketing consent — sign-in is a pure
// authentication action.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // Tracks only the initial session load, so consumers can distinguish
  // "still checking" from "checked, no session".
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Load whatever session already exists (persisted, or freshly hydrated
    // from a magic-link callback via detectSessionInUrl).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    // Keep the session in sync with sign-in, sign-out, and token refreshes.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      // Passwordless magic-link sign-in. emailRedirectTo defaults to the
      // current origin for now; this will be aligned with the Supabase
      // redirect allowlist at the staging step.
      signInWithMagicLink(email, { emailRedirectTo } = {}) {
        return supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: emailRedirectTo ?? window.location.origin,
          },
        });
      },
      signOut() {
        return supabase.auth.signOut();
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an <AuthProvider>.");
  }
  return context;
}
