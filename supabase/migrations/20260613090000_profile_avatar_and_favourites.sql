-- Avatar URL on profiles
ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;

-- Favourite flag on properties
ALTER TABLE public.properties ADD COLUMN favourite BOOLEAN NOT NULL DEFAULT false;

-- Avatars storage bucket (public read, owner-managed)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anyone reads avatars" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
CREATE POLICY "owners insert avatars" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owners update avatars" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owners delete avatars" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
