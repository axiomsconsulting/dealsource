-- Cache for full EPC certificate + improvement-recommendation data fetched from the government's
-- Open Data Communities EPC register, keyed to a property. Cached because the register is rate
-- limited and the data only changes when a new certificate is lodged (years apart).
ALTER TABLE public.properties
  ADD COLUMN epc_data JSONB,
  ADD COLUMN epc_fetched_at TIMESTAMPTZ;
