// Incidents data-access module.
//
// Part of the data-access boundary: this directory (and the auth layer) are the
// only places that import the Supabase client. Components/providers call these
// named functions, never supabase.from(...) directly. See README.md.
//
// All access is RLS-scoped server-side (create_incidents migration): a user
// only ever sees incidents belonging to organizations they are a member of,
// and inserts must carry created_by = auth.uid(). Nothing here re-implements
// those rules; it relies on them. updated_at is maintained by a database
// trigger (moddatetime) — callers never set it.

import { supabase } from "../lib/supabase.js";

// Columns we read back for a single incident. Kept in one place so the select,
// the insert-returning, and the update-returning agree. payload is the full
// saved form state; deadlines are never stored — only inputs.
const INCIDENT_COLUMNS =
  "id, org_id, title, status, payload, notifications, incident_log, schema_version, created_at, updated_at";

// The list view reads the promoted columns PLUS payload: the Respond home
// list computes each row's Next-deadline column client-side from the saved
// inputs (same engine, same completeness gate as the editor — see
// src/breach-clock/facts.js), so the payload is needed at list time now,
// not only when an incident is opened.
const LIST_COLUMNS = "id, title, status, payload, created_at, updated_at";

// Create an incident in the given organization. org_id must be an org the
// caller belongs to (RLS WITH CHECK); created_by defaults to auth.uid() in the
// database. Returns the created row (the read-back is admitted by the
// membership SELECT policy — the caller is already a member at insert time).
// status carries the unsaved form's in-memory lifecycle state into the first
// save (an incident submitted before ever being saved is created 'active',
// not 'draft'); values are constrained by incidents_status_check.
// notifications / incidentLog likewise carry in-memory notification records
// and log entries accumulated before the first save — top-level jsonb columns,
// siblings of payload, never nested inside it (they do not feed the engine).
export async function createIncident(orgId, title, payload, status = "draft", notifications = {}, incidentLog = []) {
  if (!orgId) {
    throw new Error("An organization is required to save an incident.");
  }
  const { data, error } = await supabase
    .from("incidents")
    .insert({ org_id: orgId, title, payload, status, notifications, incident_log: incidentLog })
    .select(INCIDENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Update an incident's title and payload. RLS scopes the write to the caller's
// orgs; updated_at is bumped by the trigger.
export async function updateIncident(id, { title, payload }) {
  const { data, error } = await supabase
    .from("incidents")
    .update({ title, payload })
    .eq("id", id)
    .select(INCIDENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Update an incident's status alone ('draft' | 'active' | 'closed' —
// enforced by the incidents_status_check constraint). Status changes persist
// immediately rather than staging behind Save, so this deliberately touches
// neither title nor payload. RLS scopes the write; updated_at bumps via the
// trigger like any other update.
export async function updateIncidentStatus(id, status) {
  const { data, error } = await supabase
    .from("incidents")
    .update({ status })
    .eq("id", id)
    .select(INCIDENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Update an incident's notification record alone (the `notifications` jsonb
// column — keyed "{jurId}:{authority}", values { notified_on, recorded_at }).
// Like status, notification records persist immediately on change rather than
// staging behind Save, so this deliberately touches nothing else.
export async function updateIncidentNotifications(id, notifications) {
  const { data, error } = await supabase
    .from("incidents")
    .update({ notifications })
    .eq("id", id)
    .select(INCIDENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Update an incident's log alone (the `incident_log` jsonb array). Same
// immediate-persist pattern as updateIncidentStatus / notifications above.
export async function updateIncidentLog(id, incidentLog) {
  const { data, error } = await supabase
    .from("incidents")
    .update({ incident_log: incidentLog })
    .eq("id", id)
    .select(INCIDENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Fetch one incident by id. Returns null when the row doesn't exist OR isn't
// visible to the caller (RLS filters foreign-org rows before PostgREST sees
// them — the two cases are indistinguishable by design, so both read as "not
// found"). A malformed id (not a uuid) is also "not found", not an error:
// Postgres rejects it with 22P02 before any row could match.
export async function getIncident(id) {
  const { data, error } = await supabase
    .from("incidents")
    .select(INCIDENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw error;
  }
  return data;
}

// The org's incidents, newest activity first (matches the DB's
// (org_id, updated_at desc) index). Includes payload for the list's
// Next-deadline column (see LIST_COLUMNS).
export async function listIncidents(orgId) {
  const { data, error } = await supabase
    .from("incidents")
    .select(LIST_COLUMNS)
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Delete an incident. RLS scopes the delete to the caller's orgs; deleting a
// row the caller can't see is a silent no-op (zero rows matched), not an error.
export async function deleteIncident(id) {
  const { error } = await supabase.from("incidents").delete().eq("id", id);
  if (error) throw error;
}
