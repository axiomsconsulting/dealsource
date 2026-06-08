-- investor_type on personas (replaces per-row mortgage_rate/ltv/stress_rate inputs with
-- a classification that drives lender criteria centrally — see src/lib/analysis/lender-criteria.ts).
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS investor_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (investor_type IN ('individual', 'ltd_company', 'group_holding', 'portfolio_landlord', 'first_time_landlord'));

-- Make the old per-row columns optional (data kept, no longer written by the app).
ALTER TABLE public.personas ALTER COLUMN mortgage_rate DROP NOT NULL;
ALTER TABLE public.personas ALTER COLUMN ltv DROP NOT NULL;
ALTER TABLE public.personas ALTER COLUMN stress_rate DROP NOT NULL;

-- article4_status on properties — stores the verified Article 4 direction status for the
-- property's postcode, populated by the UK Planning Data API lookup (lookupArticle4ByPostcode).
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS article4_status TEXT
    CHECK (article4_status IN ('inside', 'partial', 'unknown'));

-- Notify PostgREST to reload its schema cache so both columns are visible immediately
-- without a server restart.
NOTIFY pgrst, 'reload schema';
