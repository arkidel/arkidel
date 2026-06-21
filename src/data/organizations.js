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

// Create an organization owned by the signed-in user.
//
// created_by is set to the current user's id so the step-3 WITH CHECK
// (created_by = auth.uid()) passes. The handle_new_organization AFTER INSERT
// trigger then writes the creator's 'owner' membership in the same transaction,
// which is why the insert-returning select below is readable: by the time the
// RETURNING row is evaluated, the membership exists and the is_org_member SELECT
// policy passes.
export async function createOrganization(name) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) {
    throw new Error("You must be signed in to create an organization.");
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, created_by: user.id })
    .select(ORG_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}
