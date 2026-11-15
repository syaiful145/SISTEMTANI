-- SIMTANI: private photo evidence for employee daily reports
ALTER TABLE public.laporan ADD COLUMN IF NOT EXISTS foto_path text;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('laporan-bukti', 'laporan-bukti', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS "SIMTANI upload own report evidence" ON storage.objects;
CREATE POLICY "SIMTANI upload own report evidence" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'laporan-bukti' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "SIMTANI read report evidence" ON storage.objects;
CREATE POLICY "SIMTANI read report evidence" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'laporan-bukti' AND ((storage.foldername(name))[1] = auth.uid()::text OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')));
DROP POLICY IF EXISTS "SIMTANI delete own report evidence" ON storage.objects;
CREATE POLICY "SIMTANI delete own report evidence" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'laporan-bukti' AND (storage.foldername(name))[1] = auth.uid()::text);
