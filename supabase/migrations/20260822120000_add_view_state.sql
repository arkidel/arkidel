ALTER TABLE public.incidents
  ADD COLUMN view_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- View-only writes must not bump updated_at (JDC ruling 2026-08-22): the
-- updated_at trigger fires only when something OTHER than view_state changed.
-- The WHEN clause compares the whole row minus view_state (and minus
-- updated_at itself), so any future column is substantive BY DEFAULT and
-- bumps updated_at — only view_state is exempt. Governs future writes only;
-- no existing timestamps are rewritten.
DROP TRIGGER incidents_set_updated_at ON public.incidents;
CREATE TRIGGER incidents_set_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW
  WHEN (to_jsonb(OLD) - 'view_state' - 'updated_at'
        IS DISTINCT FROM
        to_jsonb(NEW) - 'view_state' - 'updated_at')
  EXECUTE FUNCTION extensions.moddatetime (updated_at);
