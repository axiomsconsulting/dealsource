
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.app_settings (key, value) VALUES
  ('search_ingest', '{"max_per_batch": 10, "throttle_ms": 2500, "allow_all": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
