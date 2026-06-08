-- Per-user EPC register credentials (Open Data Communities API). Stored on the user's own
-- profile row, gated by the existing "own profile" RLS policy (auth.uid() = id) — so each
-- user's key is readable/writable only by that user, never a shared server-level secret.
ALTER TABLE public.profiles
  ADD COLUMN epc_api_email TEXT,
  ADD COLUMN epc_api_key TEXT;
