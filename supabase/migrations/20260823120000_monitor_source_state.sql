-- Change monitoring, stage 1 (JDC rulings 2026-08-23; registry architecture
-- C). Dynamic fetch state for the source registry. Static truth (citations,
-- URLs, rule-field mapping, verified dates, RULESET_VERSION) lives in
-- registry.json, generated from data.js; this table holds only what the
-- nightly monitor learns by fetching, keyed one-way by registry id.
--
-- REQUIRES JDC SIGN-OFF BEFORE APPLY.

CREATE TABLE public.monitor_source_state (
  registry_id          text        PRIMARY KEY,
  ruleset_version      text,
  last_fetched_at      timestamptz,
  http_status          int,
  content_hash         text,
  previous_hash        text,
  changed_at           timestamptz,
  diff_status          text        NOT NULL DEFAULT 'pending'
                       CHECK (diff_status IN ('pending', 'unchanged', 'changed', 'fetch_error', 'manual')),
  consecutive_failures int         NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.monitor_source_state IS
  'Change-monitoring fetch state, one row per registry.json source id. Written only by the monitor role; never by the app.';

-- Not tenant data: lock it away from the API roles entirely. RLS is enabled
-- with no policies for anon/authenticated, so the PostgREST surface sees
-- nothing; the explicit REVOKE also removes the default public-schema grants.
ALTER TABLE public.monitor_source_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monitor_source_state FROM anon, authenticated;

-- Dedicated monitor role: NOT the service role. Created NOLOGIN with no
-- password here — secrets never live in migrations. JDC enables login and
-- sets the password out of band (see the stage-1 report: ALTER ROLE
-- monitor_bot LOGIN PASSWORD '<secret>'), and the value goes only into the
-- Vercel MONITOR_DB_URL env var.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_bot') THEN
    CREATE ROLE monitor_bot NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO monitor_bot;
GRANT SELECT, INSERT, UPDATE ON public.monitor_source_state TO monitor_bot;

-- monitor_bot is subject to RLS (it is neither the owner nor BYPASSRLS), so
-- it needs an explicit permissive policy on exactly this table. It holds no
-- other table grants.
CREATE POLICY monitor_bot_rw ON public.monitor_source_state
  FOR ALL TO monitor_bot
  USING (true)
  WITH CHECK (true);
