-- Per-login record, written by the app right after a successful sign-in.
CREATE TABLE public.login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX login_events_user_created_idx ON public.login_events (user_id, created_at);
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own login" ON public.login_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read logins" ON public.login_events FOR SELECT USING (public.is_admin());

-- One row per AI feature invocation, for per-user usage breakdowns.
CREATE TABLE public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX ai_usage_log_user_idx ON public.ai_usage_log (user_id, feature_key, created_at);
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own ai usage" ON public.ai_usage_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read ai usage" ON public.ai_usage_log FOR SELECT USING (public.is_admin());

-- Audit trail for sensitive super-admin actions (e.g. impersonation).
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  target_user_id UUID REFERENCES public.profiles ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit log" ON public.admin_audit_log FOR SELECT USING (public.is_admin());

-- Admin-authored campaigns.
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all','inactive','specific')),
  inactive_hours INTEGER,
  user_ids UUID[],
  channels TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  created_by UUID NOT NULL REFERENCES public.profiles,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  sent_at TIMESTAMPTZ
);
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage campaigns" ON public.campaigns FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Per-user delivery + dismissal state for a campaign.
CREATE TABLE public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  channels_sent TEXT[] NOT NULL DEFAULT '{}',
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (campaign_id, user_id)
);
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own recipient rows" ON public.campaign_recipients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users dismiss own recipient rows" ON public.campaign_recipients FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins manage recipients" ON public.campaign_recipients FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
