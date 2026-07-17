// Profiles data-access module.
//
// Part of the data-access boundary: this file (and the client module) are the
// only places that import the Supabase client. Components/providers call these
// named functions, never supabase.from(...) directly. See README.md.
//
// The profile row is RLS-scoped to the caller's own row and already exists
// (created by the signup trigger), so this module only ever selects it.
// AuthProvider keeps its own in-context profile fetch (src/auth/** is inside
// the boundary); this function serves consumers that must work without a
// provider — currently AccountMenu's lazy identity fetch.

import { supabase } from "../lib/supabase.js";

// The signed-in user's profile identity. The caller supplies the user id it
// already holds (from its own session state) rather than this module
// round-tripping supabase.auth.getUser() — same reasoning as
// createOrganization. maybeSingle: a missing row resolves to null, not an
// error.
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
