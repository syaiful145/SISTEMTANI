-- Private storage for attendance and leave evidence
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES
 ('absensi-bukti','absensi-bukti',false,5242880,ARRAY['image/jpeg','image/png','image/webp']),
 ('izin-bukti','izin-bukti',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "SIMTANI upload own attendance evidence" ON storage.objects;
CREATE POLICY "SIMTANI upload own attendance evidence" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='absensi-bukti' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS "SIMTANI read attendance evidence" ON storage.objects;
CREATE POLICY "SIMTANI read attendance evidence" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='absensi-bukti' AND ((storage.foldername(name))[1]=auth.uid()::text OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin')));
DROP POLICY IF EXISTS "SIMTANI delete own attendance evidence" ON storage.objects;
CREATE POLICY "SIMTANI delete own attendance evidence" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='absensi-bukti' AND (storage.foldername(name))[1]=auth.uid()::text);

DROP POLICY IF EXISTS "SIMTANI upload own leave evidence" ON storage.objects;
CREATE POLICY "SIMTANI upload own leave evidence" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='izin-bukti' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS "SIMTANI read leave evidence" ON storage.objects;
CREATE POLICY "SIMTANI read leave evidence" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='izin-bukti' AND ((storage.foldername(name))[1]=auth.uid()::text OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin')));
DROP POLICY IF EXISTS "SIMTANI delete own leave evidence" ON storage.objects;
CREATE POLICY "SIMTANI delete own leave evidence" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='izin-bukti' AND (storage.foldername(name))[1]=auth.uid()::text);
