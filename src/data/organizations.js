// Organizations data-access module.
//
// Part of the data-access boundary: this file (and the client module) are the
// only places that import the Supabase client. Components/providers call these
// named functions, never supabase.from(...) directly. See README.md.
//
// All access is RLS-scoped server-side (step-3 migration): a user only ever
// sees the organizations they belong to, and inserts must set
// created_by = auth.uid(). Nothing here re-implements those rules; it relies on
// them.

import { supabase } from "../lib/supabase.js";

// Columns we read back for an organization. Kept in one place so the select and
// the insert-returning agree.
const ORG_COLUMNS = "id, name, created_by, created_at";

// The organizations the signed-in user belongs to. RLS scopes the result to the
// caller's own orgs, so a brand-new user gets an empty list (not an error).
export async function getMyOrganizations() {
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Create an organization owned by the given user.
//
// The caller supplies the signed-in user's id (from the auth context) rather
// than this module round-tripping supabase.auth.getUser() — under the
// auth-state flux of a fresh sign-in that round-trip is another moving part,
// and the caller already holds the user. created_by must equal auth.uid() for
// the step-3 WITH CHECK to pass; the read-back is admitted by the SELECT
// policy's created_by arm.
export async function createOrganization(name, userId) {
  if (!userId) {
    throw new Error("You must be signed in to create an organization.");
  }
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, created_by: userId })
    .select(ORG_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
