
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS share_defaults JSONB NOT NULL DEFAULT '{"redact":true,"hide_address":false,"hide_photos":false,"include_refurb_breakdown":true,"include_risk_flags":true}'::jsonb;

CREATE TABLE IF NOT EXISTS public.peer_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(replace(replace(encode(extensions.gen_random_bytes(18),'base64'),'/','_'),'+','-'),'=',''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS peer_shares_owner_idx ON public.peer_shares(owner_user_id);
CREATE INDEX IF NOT EXISTS peer_shares_property_idx ON public.peer_shares(property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.peer_shares TO authenticated;
GRANT ALL ON public.peer_shares TO service_role;
GRANT SELECT ON public.peer_shares TO anon;
ALTER TABLE public.peer_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own peer shares" ON public.peer_shares FOR ALL TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "public read active peer share" ON public.peer_shares FOR SELECT TO anon USING (is_active = true);
