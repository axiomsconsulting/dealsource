
CREATE POLICY "owners read photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'property-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owners insert photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owners delete photos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'property-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
