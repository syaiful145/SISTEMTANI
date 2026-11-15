-- SIMTANI: profil akun dan tingkatan administrator.
-- Akun Admin Utama ditetapkan berdasarkan UUID yang telah dikonfirmasi pemilik.
-- Admin lain tetap menjadi Admin Kedua.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_level text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.profiles
SET admin_level = CASE
  WHEN id = '248c406f-01a9-45bc-8aed-020c5a8e5800'::uuid THEN 'utama'
  ELSE 'kedua'
END
WHERE role = 'admin';

UPDATE public.profiles
SET admin_level = NULL
WHERE role <> 'admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_admin_level_valid'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_admin_level_valid
      CHECK (
        (role = 'admin' AND admin_level IN ('utama', 'kedua'))
        OR (role <> 'admin' AND admin_level IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_admin_level_idx
  ON public.profiles (admin_level)
  WHERE role = 'admin';
