-- Roles
ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user','admin','super_admin'));

-- Seed existing super admin (no-op if profile doesn't exist yet)
UPDATE public.profiles SET role = 'super_admin' WHERE email = 'swapnil.kashyap@gmail.com';

-- Make new-signup trigger assign super_admin to that email too
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, CASE WHEN NEW.email = 'swapnil.kashyap@gmail.com' THEN 'super_admin' ELSE 'user' END)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- Helper for RLS: is the current user admin/super_admin?
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'));
$$;

-- Feedback
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up','down')),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  page_path TEXT,
  ip_address TEXT,
  location_city TEXT,
  location_country TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own feedback" ON public.feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read feedback" ON public.feedback FOR SELECT USING (public.is_admin());
