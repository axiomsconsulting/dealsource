
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Personas
CREATE TABLE public.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'BTL',
  cash_available_gbp NUMERIC NOT NULL DEFAULT 60000,
  target_rent_gbp NUMERIC NOT NULL DEFAULT 1200,
  min_beds INT NOT NULL DEFAULT 3,
  max_beds INT NOT NULL DEFAULT 4,
  min_bed_size_ft NUMERIC NOT NULL DEFAULT 8,
  ignore_eras TEXT[] NOT NULL DEFAULT ARRAY['Victorian','Edwardian'],
  require_parking BOOLEAN NOT NULL DEFAULT true,
  require_gas_boiler BOOLEAN NOT NULL DEFAULT true,
  min_epc TEXT NOT NULL DEFAULT 'C',
  allow_epc_de_if_neighbours_c BOOLEAN NOT NULL DEFAULT true,
  max_offer_gbp NUMERIC NOT NULL DEFAULT 180000,
  target_offer_gbp NUMERIC NOT NULL DEFAULT 150000,
  mortgage_rate NUMERIC NOT NULL DEFAULT 0.055,
  stress_rate NUMERIC NOT NULL DEFAULT 0.08,
  ltv NUMERIC NOT NULL DEFAULT 0.75,
  refurb_buffer_gbp NUMERIC NOT NULL DEFAULT 15000,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personas TO authenticated;
GRANT ALL ON public.personas TO service_role;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own personas" ON public.personas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Properties
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  address TEXT NOT NULL,
  postcode TEXT,
  city TEXT,
  property_type TEXT,
  beds INT,
  baths INT,
  area_sqm NUMERIC,
  tenure TEXT,
  epc_rate TEXT,
  asking_price_gbp NUMERIC,
  source TEXT NOT NULL DEFAULT 'manual',
  source_link TEXT,
  agent_name TEXT,
  csv_row JSONB,
  pf_json JSONB,
  hide_address BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX properties_user_idx ON public.properties(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own properties" ON public.properties FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Analyses
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties ON DELETE CASCADE,
  persona_id UUID REFERENCES public.personas ON DELETE SET NULL,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  negotiation JSONB NOT NULL DEFAULT '[]'::jsonb,
  deal_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(property_id, persona_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own analyses" ON public.analyses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER personas_touch BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER properties_touch BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER analyses_touch BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
