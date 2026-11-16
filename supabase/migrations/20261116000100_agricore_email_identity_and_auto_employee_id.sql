-- Identitas akun AgriCore: email untuk login, nama untuk tampilan,
-- username internal untuk menjaga kompatibilitas skema lama, ID pegawai otomatis.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.pegawai_id_pegawai_seq;

DO $$
DECLARE
  v_max_id bigint;
BEGIN
  SELECT MAX(id_pegawai::bigint)
    INTO v_max_id
  FROM public.pegawai
  WHERE id_pegawai ~ '^[0-9]+$';

  PERFORM setval(
    'public.pegawai_id_pegawai_seq',
    GREATEST(COALESCE(v_max_id, 1000000), 1000000),
    true
  );
END;
$$;

ALTER TABLE public.pegawai
  ALTER COLUMN id_pegawai
  SET DEFAULT nextval('public.pegawai_id_pegawai_seq')::text;

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

  -- Username hanya nilai teknis internal; tidak diminta atau ditampilkan.
  v_username := 'akun_' || replace(new.id::text, '-', '');
  v_requested_role := COALESCE(new.raw_user_meta_data ->> 'requested_role', 'pegawai');

  IF v_requested_role = 'admin' THEN
    INSERT INTO public.admin_applications (auth_user_id, nama, username, email)
    VALUES (new.id, v_nama, v_username, new.email);
    RETURN new;
  END IF;

  INSERT INTO public.pegawai (
    nama, jabatan, telepon, alamat, status_kerja,
    username, akses, auth_user_id, email, foto,
    status_verifikasi, alasan_penolakan
  ) VALUES (
    v_nama,
    NULLIF(trim(new.raw_user_meta_data ->> 'jabatan'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'telepon'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'alamat'), ''),
    'Aktif',
    v_username, '{}'::text[], new.id, new.email, NULL,
    'menunggu', NULL
  ) RETURNING id INTO v_pegawai_id;

  INSERT INTO public.profiles (id, username, nama, role, pegawai_id)
  VALUES (new.id, v_username, v_nama, 'pegawai', v_pegawai_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$function$;

COMMENT ON COLUMN public.pegawai.username IS
  'Identitas teknis internal; bukan username login dan tidak ditampilkan.';
COMMENT ON COLUMN public.profiles.username IS
  'Identitas teknis internal; login menggunakan email dan tampilan menggunakan nama.';
COMMENT ON COLUMN public.admin_applications.username IS
  'Identitas teknis internal; bukan username login dan tidak ditampilkan.';

COMMIT;
