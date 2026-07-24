ALTER TABLE public.incidents
  ADD COLUMN notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN incident_log jsonb NOT NULL DEFAULT '[]'::jsonb;
