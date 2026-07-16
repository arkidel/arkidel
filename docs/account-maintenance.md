# Account maintenance runbook

Procedures for back-end account changes and deletions. Every action here follows
the same discipline: verify the requester, run the documented procedure, record it
in the request log at the bottom of this file. No ad-hoc SQL against production.

This runbook covers mechanics. Retention periods, legal bases, and policy language
are decided in the privacy policy, which must describe what this runbook actually
does. Where the two conflict, stop and reconcile before acting.

## Identity verification

Before any change or deletion:

1. Request must originate from the account's sign-in email, or the requester must
   demonstrate control of it (reply loop: send a confirmation to the sign-in email
   and require an affirmative reply).
2. For deletions and email changes, a reply-loop confirmation is mandatory even if
   the request already came from the sign-in email.
3. For org-level actions (rename, org deletion), the requester must be an owner of
   the org (check org_members.role).
4. Record the verification method in the request log.

## Changes

### Self-serve (redirect, do not perform manually)
- Full name, nickname: /account page.

### Auth-layer (use the Supabase flow, never manual SQL)
- Sign-in email change: use the Supabase dashboard (Authentication → user →
  update email) or admin API, which requires verification of the new address.
  Never UPDATE auth.users.email directly — the verification step is the security
  control.

### Operator-performed
- Org rename, membership repair, un-wedging stuck states: write the SQL, review it
  against this section, run it via the established Supabase access, record it.
- Org rename: UPDATE public.organizations SET name = $1 WHERE id = $2;

## Deletion

Two distinct requests that customers conflate. Confirm which one is being asked
for before proceeding.

### A. User deletion (a person leaves; the org and its records remain)
1. Verify per above. If the user is the sole owner of an org, this is probably an
   account deletion (see B) — confirm.
2. Delete the auth user (Supabase dashboard: Authentication → user → delete, or
   admin API). Cascades: public.profiles row.
3. org_members rows for the user are removed; incidents the user created remain
   with created_by set to NULL (intentional: org records survive their author).
4. Check processors and storage per the checklist below.
5. Record it.

### B. Account/org deletion (the customer relationship ends)
Two-stage. Stage 1 is immediate; stage 2 runs after the grace window.
Grace window: 30 days. [JDC: confirm or adjust; must match privacy policy.]

Stage 1 — deactivate (same day as verified request):
1. Ban sign-in for all users of the org (Supabase dashboard: Authentication →
   user → ban, or admin API ban_duration). Data becomes inaccessible because
   sessions expire and sign-in is blocked; RLS already prevents anyone else
   seeing it.
2. Record the request date and the scheduled hard-delete date in the log.
3. Confirm to the customer in writing: what is deactivated now, what is deleted
   when, what persists in backups and for how long.

Stage 2 — hard delete (after the grace window, in this order):
1. DELETE FROM public.organizations WHERE id = $1;
   -- cascades: public.incidents, public.org_members (verified 2026-07-16)
2. Delete each auth user that has no remaining org membership (dashboard or
   admin API). Cascades: public.profiles.
3. Storage: delete any objects under the org's or users' paths. Storage objects
   do NOT cascade from Postgres deletes and need this explicit pass.
   [JDC: no storage buckets in use yet — update this step when the first bucket
   ships.]
4. Processors: remove or request deletion of the customer's traces in each
   processor on the processor list. [JDC: maintain the processor list in the
   privacy policy work; as of this writing: Supabase (hosting/auth/db), Vercel
   (hosting/logs). Add Buttondown when the newsletter ships — newsletter
   subscription is consent-separate and is NOT auto-deleted with the account
   unless requested.]
5. Backups: deletion propagates as backups age out on the retention schedule.
   [JDC: record the actual Supabase plan retention here and mirror it in the
   privacy policy.] Do not claim scrubbing of archived backups anywhere.
6. Record completion in the log.

### Deletion requests aimed at incident records only
Incidents describe customers' breach matters and are the most sensitive data in
the product. A customer may ask to delete specific incidents rather than the
account. Verify org ownership, then delete via the product UI where possible
(two-step delete on /incidents) so normal audit behavior applies; SQL only if
the UI cannot express the request.

## Request log

Append one entry per request. Format:

- date · requester · account/org · request · verification method · actions taken
  (SQL or dashboard steps) · completed date · operator

(No entries yet.)
