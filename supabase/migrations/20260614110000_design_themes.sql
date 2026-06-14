-- Design system theme presets (admin-managed, app-wide)
CREATE TABLE public.design_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  radius TEXT NOT NULL DEFAULT '0.625rem',
  font_scale NUMERIC NOT NULL DEFAULT 1,
  light JSONB NOT NULL DEFAULT '{}'::jsonb,
  dark JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Only one theme can be active at a time
CREATE UNIQUE INDEX design_themes_one_active ON public.design_themes (is_active) WHERE is_active;

GRANT ALL ON public.design_themes TO service_role;
ALTER TABLE public.design_themes ENABLE ROW LEVEL SECURITY;

-- Every signed-in user needs to read the active theme to render the app
CREATE POLICY "authenticated read themes" ON public.design_themes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins manage themes" ON public.design_themes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed the current default theme
INSERT INTO public.design_themes (name, is_active, radius, font_scale, light, dark) VALUES (
  'Default',
  true,
  '0.625rem',
  1,
  '{
    "--background": "oklch(0.985 0.005 95)",
    "--foreground": "oklch(0.18 0.02 250)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.18 0.02 250)",
    "--primary": "oklch(0.45 0.15 155)",
    "--primary-foreground": "oklch(0.99 0.005 95)",
    "--secondary": "oklch(0.95 0.01 240)",
    "--secondary-foreground": "oklch(0.2 0.03 250)",
    "--muted": "oklch(0.95 0.008 240)",
    "--muted-foreground": "oklch(0.5 0.02 250)",
    "--accent": "oklch(0.72 0.16 75)",
    "--accent-foreground": "oklch(0.15 0.02 250)",
    "--destructive": "oklch(0.6 0.22 27)",
    "--destructive-foreground": "oklch(0.984 0.003 247.858)",
    "--border": "oklch(0.9 0.012 250)",
    "--input": "oklch(0.92 0.012 250)",
    "--ring": "oklch(0.45 0.15 155)"
  }'::jsonb,
  '{
    "--background": "oklch(0.129 0.042 264.695)",
    "--foreground": "oklch(0.984 0.003 247.858)",
    "--card": "oklch(0.208 0.042 265.755)",
    "--card-foreground": "oklch(0.984 0.003 247.858)",
    "--primary": "oklch(0.929 0.013 255.508)",
    "--primary-foreground": "oklch(0.208 0.042 265.755)",
    "--secondary": "oklch(0.279 0.041 260.031)",
    "--secondary-foreground": "oklch(0.984 0.003 247.858)",
    "--muted": "oklch(0.279 0.041 260.031)",
    "--muted-foreground": "oklch(0.704 0.04 256.788)",
    "--accent": "oklch(0.279 0.041 260.031)",
    "--accent-foreground": "oklch(0.984 0.003 247.858)",
    "--destructive": "oklch(0.704 0.191 22.216)",
    "--destructive-foreground": "oklch(0.984 0.003 247.858)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.551 0.027 264.364)"
  }'::jsonb
);
