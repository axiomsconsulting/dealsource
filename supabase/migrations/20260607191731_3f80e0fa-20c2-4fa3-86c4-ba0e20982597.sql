
-- Phase 4 additions

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS seller_context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.deal_sheets
  ADD COLUMN IF NOT EXISTS hide_address boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_photos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_refurb_breakdown boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_risk_flags boolean NOT NULL DEFAULT true;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS risk_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

-- AI batch job tracker
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'library_analysis',
  total integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  property_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_property_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_jobs TO authenticated;
GRANT ALL ON public.ai_jobs TO service_role;

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai_jobs"
  ON public.ai_jobs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_ai_jobs_updated_at
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
