ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS survey_findings jsonb NOT NULL DEFAULT '{}'::jsonb;
