CREATE POLICY "anon read active theme" ON public.design_themes FOR SELECT TO anon USING (is_active = true);
GRANT SELECT ON public.design_themes TO anon;