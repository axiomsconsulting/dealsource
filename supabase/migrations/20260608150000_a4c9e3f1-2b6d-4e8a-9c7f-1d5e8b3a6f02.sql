-- The EPC register has migrated to a new GOV.UK service that authenticates with a single
-- bearer token (issued via GOV.UK One Login) rather than an email + API key pair. Replace the
-- columns added by the previous migration with a single token column. Still on the user's own
-- `profiles` row, still gated by the existing "own profile" RLS policy (auth.uid() = id) — each
-- user's token is readable/writable only by that user, never a shared server-level secret.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS epc_api_email,
  DROP COLUMN IF EXISTS epc_api_key,
  ADD COLUMN IF NOT EXISTS epc_bearer_token TEXT;
