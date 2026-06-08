-- Fix share_token to use URL-safe characters.
-- Standard base64 uses +, /, = which break URL routing when embedded in path segments.
-- Replace: / -> _, + -> -, remove =
-- Also change the column DEFAULT so new tokens are URL-safe from day one.

-- 1. Update any existing tokens that contain URL-unsafe characters
UPDATE public.deal_sheets
SET share_token = replace(replace(replace(share_token, '/', '_'), '+', '-'), '=', '')
WHERE share_token ~ '[/+=]';

-- 2. Change the DEFAULT to generate URL-safe base64 tokens for new rows
ALTER TABLE public.deal_sheets
  ALTER COLUMN share_token
  SET DEFAULT replace(replace(replace(encode(gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'), '=', '');

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
