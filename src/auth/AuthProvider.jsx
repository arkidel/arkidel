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
  // The signed-in user's own profile row (full_name + nickname only — the
  // rest of the row isn't needed in-app). Null when signed out or not yet
  // fetched. The
  // row already exists (created by the signup trigger), so the app only ever
  // selects and updates it — never inserts.
  const [profile, setProfile] = useState(null);

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

  // Fetch the profile row whenever the signed-in user changes. maybeSingle so
  // a missing row reads as null rather than throwing. Mirrors the session
  // effect's `active` race-guard so a resolved fetch from a stale user is
  // discarded.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    let active = true;
    supabase
      .from("profiles")
      .select("full_name, nickname")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProfile(data ?? null);
      });

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  // Update the signed-in user's own profile row. RLS scopes the write to the
  // caller's row; the app never inserts (the row already exists).
  async function updateProfile(patch) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", session.user.id)
      .select("full_name, nickname")
      .maybeSingle();
    if (!error && data) setProfile(data);
    return { error };
  }

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      updateProfile,
      loading,
      // Passwordless magic-link sign-in. The link returns the user to
      // /auth/callback, where detectSessionInUrl establishes the session.
      // (The /auth/callback path must be on the Supabase redirect allowlist;
      // that allowlist alignment happens at the staging step.)
      signInWithMagicLink(email, { emailRedirectTo } = {}) {
        return supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo:
              emailRedirectTo ?? `${window.location.origin}/auth/callback`,
          },
        });
      },
      signOut() {
        return supabase.auth.signOut();
      },
    }),
    [session, profile, loading]
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
