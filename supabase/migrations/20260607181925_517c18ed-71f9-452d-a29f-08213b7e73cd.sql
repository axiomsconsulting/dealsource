
-- 1. personas: AI default toggle
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS ai_default_enabled boolean NOT NULL DEFAULT false;

-- 2. analyses: AI metadata
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS ai_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS ai_used_at timestamptz;

-- 3. photos
CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  is_exterior boolean NOT NULL DEFAULT false,
  ai_findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own photos" ON public.photos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. deal_sheets
CREATE TABLE IF NOT EXISTS public.deal_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'base64'),
  is_public boolean NOT NULL DEFAULT true,
  redact boolean NOT NULL DEFAULT true,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  hero_photo_id uuid REFERENCES public.photos(id) ON DELETE SET NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_sheets TO authenticated;
GRANT SELECT ON public.deal_sheets TO anon;
GRANT ALL ON public.deal_sheets TO service_role;
ALTER TABLE public.deal_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deal sheets" ON public.deal_sheets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public view via token" ON public.deal_sheets FOR SELECT TO anon USING (is_public = true);
CREATE TRIGGER deal_sheets_touch BEFORE UPDATE ON public.deal_sheets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. saved_searches
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  name text NOT NULL,
  postcode_prefix text,
  city text,
  min_beds integer,
  max_beds integer,
  min_price numeric,
  max_price numeric,
  min_deal_score integer NOT NULL DEFAULT 60,
  notify_email text,
  frequency text NOT NULL DEFAULT 'daily',
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved searches" ON public.saved_searches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER saved_searches_touch BEFORE UPDATE ON public.saved_searches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. search_matches (dedupe sent alerts)
CREATE TABLE IF NOT EXISTS public.search_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  saved_search_id uuid NOT NULL REFERENCES public.saved_searches(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  deal_score integer,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (saved_search_id, property_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_matches TO authenticated;
GRANT ALL ON public.search_matches TO service_role;
ALTER TABLE public.search_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own matches" ON public.search_matches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
