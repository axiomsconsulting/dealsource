
-- Phase 3 schema additions
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS risk_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS article4_status text,
  ADD COLUMN IF NOT EXISTS article4_source text,
  ADD COLUMN IF NOT EXISTS estimated_rent_pcm numeric,
  ADD COLUMN IF NOT EXISTS rent_source text,
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS refurb_estimate jsonb,
  ADD COLUMN IF NOT EXISTS lease_years_remaining integer,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS ai_payload jsonb,
  ADD COLUMN IF NOT EXISTS ai_version text;

-- Reference table for Article 4 areas
CREATE TABLE IF NOT EXISTS public.article4_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postcode_prefix text NOT NULL,
  council text,
  scope text NOT NULL DEFAULT 'full',
  notes text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS article4_areas_prefix_idx ON public.article4_areas(postcode_prefix);

GRANT SELECT ON public.article4_areas TO anon, authenticated;
GRANT ALL ON public.article4_areas TO service_role;

ALTER TABLE public.article4_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read article4 areas"
  ON public.article4_areas FOR SELECT
  USING (true);

-- Seed common Article 4 HMO areas (representative — extendable)
INSERT INTO public.article4_areas (postcode_prefix, council, scope, notes) VALUES
  ('NG7', 'Nottingham City Council', 'full', 'City-wide Article 4 for HMO C3->C4'),
  ('NG1', 'Nottingham City Council', 'full', 'City-wide Article 4'),
  ('NG2', 'Nottingham City Council', 'full', 'City-wide Article 4'),
  ('NG3', 'Nottingham City Council', 'full', 'City-wide Article 4'),
  ('NG5', 'Nottingham City Council', 'full', 'City-wide Article 4'),
  ('B29', 'Birmingham City Council', 'partial', 'Selly Oak'),
  ('B16', 'Birmingham City Council', 'partial', 'Edgbaston/Harborne edges'),
  ('M14', 'Manchester City Council', 'full', 'Fallowfield/Withington HMO Article 4'),
  ('M13', 'Manchester City Council', 'full', 'HMO Article 4'),
  ('M20', 'Manchester City Council', 'partial', 'Didsbury parts'),
  ('S1', 'Sheffield City Council', 'partial', 'Broomhall/Sharrow'),
  ('S10', 'Sheffield City Council', 'partial', 'Crookesmoor/Crookes'),
  ('S11', 'Sheffield City Council', 'partial', 'Hunters Bar/Ecclesall'),
  ('LS6', 'Leeds City Council', 'full', 'Headingley/Hyde Park HMO Article 4'),
  ('LS2', 'Leeds City Council', 'partial', 'City centre student belt'),
  ('LS4', 'Leeds City Council', 'partial', 'Burley/Kirkstall edges'),
  ('L7', 'Liverpool City Council', 'partial', 'Kensington/Edge Hill'),
  ('L15', 'Liverpool City Council', 'partial', 'Wavertree'),
  ('L17', 'Liverpool City Council', 'partial', 'Aigburth'),
  ('CF24', 'Cardiff Council', 'partial', 'Cathays/Plasnewydd'),
  ('CF11', 'Cardiff Council', 'partial', 'Riverside'),
  ('BS5', 'Bristol City Council', 'partial', 'Easton/St George'),
  ('BS6', 'Bristol City Council', 'partial', 'Cotham/Redland'),
  ('BS7', 'Bristol City Council', 'partial', 'Bishopston/Horfield'),
  ('BN1', 'Brighton & Hove Council', 'partial', 'Lewes Road corridor'),
  ('BN2', 'Brighton & Hove Council', 'partial', 'Hanover/Bevendean'),
  ('PO1', 'Portsmouth City Council', 'partial', 'Central/Southsea'),
  ('PO4', 'Portsmouth City Council', 'partial', 'Southsea'),
  ('PO5', 'Portsmouth City Council', 'partial', 'Southsea'),
  ('SO14', 'Southampton City Council', 'full', 'City-wide HMO Article 4'),
  ('SO15', 'Southampton City Council', 'full', 'City-wide HMO Article 4'),
  ('SO16', 'Southampton City Council', 'full', 'City-wide HMO Article 4'),
  ('SO17', 'Southampton City Council', 'full', 'City-wide HMO Article 4'),
  ('RG1', 'Reading Borough Council', 'partial', 'Central Reading'),
  ('RG6', 'Reading Borough Council', 'partial', 'Earley'),
  ('RG30', 'Reading Borough Council', 'partial', 'Tilehurst edges'),
  ('OX4', 'Oxford City Council', 'full', 'City-wide HMO Article 4'),
  ('OX1', 'Oxford City Council', 'full', 'City-wide HMO Article 4'),
  ('OX2', 'Oxford City Council', 'full', 'City-wide HMO Article 4'),
  ('OX3', 'Oxford City Council', 'full', 'City-wide HMO Article 4'),
  ('MK2', 'Milton Keynes Council', 'partial', 'Bletchley'),
  ('LU1', 'Luton Borough Council', 'partial', 'Central'),
  ('CV1', 'Coventry City Council', 'partial', 'City centre/Earlsdon'),
  ('CV4', 'Coventry City Council', 'partial', 'Canley'),
  ('CV5', 'Coventry City Council', 'partial', 'Earlsdon/Chapelfields'),
  ('NE1', 'Newcastle City Council', 'partial', 'City centre'),
  ('NE2', 'Newcastle City Council', 'partial', 'Jesmond/Heaton'),
  ('NE6', 'Newcastle City Council', 'partial', 'Heaton'),
  ('LE2', 'Leicester City Council', 'partial', 'Clarendon Park/Stoneygate'),
  ('LE3', 'Leicester City Council', 'partial', 'Westcotes'),
  ('PL4', 'Plymouth City Council', 'partial', 'Mutley/Greenbank'),
  ('EX4', 'Exeter City Council', 'partial', 'St James/Pennsylvania'),
  ('TS1', 'Middlesbrough Council', 'partial', 'Central'),
  ('HU5', 'Hull City Council', 'partial', 'Newland Avenue'),
  ('CT1', 'Canterbury City Council', 'partial', 'City centre'),
  ('CT2', 'Canterbury City Council', 'partial', 'Hales Place'),
  ('LN2', 'City of Lincoln Council', 'partial', 'University area'),
  ('LN5', 'City of Lincoln Council', 'partial', 'South common'),
  ('SA1', 'Swansea Council', 'partial', 'Brynmill/Uplands'),
  ('SA2', 'Swansea Council', 'partial', 'Sketty/Uplands')
ON CONFLICT DO NOTHING;
