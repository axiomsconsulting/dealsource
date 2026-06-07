-- Replace persona-level mortgage_rate/ltv/stress_rate inputs with an investor_type classification.
-- Lender appetite (rate, max LTV, stress methodology) is driven by HOW an investor borrows
-- (personal name, Ltd co/SPV, portfolio landlord, etc.), not a number each persona has to guess —
-- the app now derives those figures centrally from investor_type (see src/lib/analysis/lender-criteria.ts).
ALTER TABLE public.personas
  ADD COLUMN investor_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (investor_type IN ('individual', 'ltd_company', 'group_holding', 'portfolio_landlord', 'first_time_landlord'));

-- mortgage_rate/ltv/stress_rate columns are kept (existing data, no longer read by the app) so this
-- migration stays non-destructive; they can be dropped in a later cleanup once confirmed unused.
ALTER TABLE public.personas ALTER COLUMN mortgage_rate DROP NOT NULL;
ALTER TABLE public.personas ALTER COLUMN ltv DROP NOT NULL;
ALTER TABLE public.personas ALTER COLUMN stress_rate DROP NOT NULL;
