-- Structured market comparables and area statistics extracted from the Property Filter JSON
-- when a user pastes it in, so sold-price comparables and any area-level stats from the
-- listing feed are available for price benchmarking without a separate API call.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS market_data JSONB;
