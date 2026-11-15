-- Pendaftaran Admin Kedua harus melalui persetujuan Admin Utama.
CREATE TABLE IF NOT EXISTS public.admin_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nama text NOT NULL,
  username text NOT NULL UNIQUE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','ditolak')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  alasan_penolakan text
);

ALTER TABLE public.admin_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_applications FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nama text;
  v_pegawai_id bigint;
  v_username text;
  v_requested_role text;
BEGIN
  v_nama := COALESCE(
    NULLIF(trim(new.raw_user_meta_data ->> 'nama'), ''),
    NULLIF(split_part(COALESCE(new.email, ''), '@', 1), ''),
    'Pengguna Baru'
  );
  v_username := lower(trim(COALESCE(
    NULLIF(new.raw_user_meta_data ->> 'username', ''),
    split_part(COALESCE(new.email, ''), '@', 1),
    new.id::text
  )));
  v_requested_role := COALESCE(new.raw_user_meta_data ->> 'requested_role', 'pegawai');

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = v_username)
     OR EXISTS (SELECT 1 FROM public.admin_applications a WHERE lower(a.username) = v_username) THEN
    RAISE EXCEPTION 'Username sudah digunakan. Silakan pilih username lain.';
  END IF;

  IF v_requested_role = 'admin' THEN
    INSERT INTO public.admin_applications (auth_user_id, nama, username, email)
    VALUES (new.id, v_nama, v_username, new.email);
    RETURN new;
  END IF;

  INSERT INTO public.pegawai (
    nama, id_pegawai, jabatan, telepon, alamat, status_kerja,
    username, akses, auth_user_id, email, foto,
    status_verifikasi, alasan_penolakan
  ) VALUES (
    v_nama,
    NULLIF(trim(new.raw_user_meta_data ->> 'id_pegawai'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'jabatan'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'telepon'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'alamat'), ''),
    'Aktif', v_username, '{}'::text[], new.id, new.email, NULL,
    'menunggu', NULL
  ) RETURNING id INTO v_pegawai_id;

  INSERT INTO public.profiles (id, username, nama, role, pegawai_id)
  VALUES (new.id, v_username, v_nama, 'pegawai', v_pegawai_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$function$;
