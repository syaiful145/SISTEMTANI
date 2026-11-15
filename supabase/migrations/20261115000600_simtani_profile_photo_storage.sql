-- SIMTANI: durable profile photo storage.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-photos', 'profile-photos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS "SIMTANI profile photos public read" ON storage.objects;
CREATE POLICY "SIMTANI profile photos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "SIMTANI users upload own profile photo" ON storage.objects;
CREATE POLICY "SIMTANI users upload own profile photo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "SIMTANI users update own profile photo" ON storage.objects;
CREATE POLICY "SIMTANI users update own profile photo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "SIMTANI users delete own profile photo" ON storage.objects;
CREATE POLICY "SIMTANI users delete own profile photo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
