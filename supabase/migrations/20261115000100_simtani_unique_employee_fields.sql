-- SIMTANI: cegah ID pegawai, email, dan nomor WhatsApp ganda.
-- Nama dan alamat sengaja TIDAK diberi UNIQUE constraint.
-- Jalankan sekali di Supabase SQL Editor setelah memastikan tidak ada data duplikat lama.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pegawai
    WHERE NULLIF(btrim(id_pegawai::text), '') IS NOT NULL
    GROUP BY lower(btrim(id_pegawai::text)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Masih ada ID pegawai duplikat. Rapikan data pegawai terlebih dahulu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pegawai
    WHERE NULLIF(regexp_replace(coalesce(telepon, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
    GROUP BY regexp_replace(coalesce(telepon, ''), '[^0-9]', '', 'g') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Masih ada nomor WhatsApp duplikat. Rapikan data pegawai terlebih dahulu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pegawai
    WHERE NULLIF(btrim(email), '') IS NOT NULL
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Masih ada email pegawai duplikat. Rapikan data pegawai terlebih dahulu.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pegawai_id_pegawai_unique
  ON public.pegawai (lower(btrim(id_pegawai::text)))
  WHERE NULLIF(btrim(id_pegawai::text), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pegawai_telepon_unique
  ON public.pegawai (regexp_replace(coalesce(telepon, ''), '[^0-9]', '', 'g'))
  WHERE NULLIF(regexp_replace(coalesce(telepon, ''), '[^0-9]', '', 'g'), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pegawai_email_unique
  ON public.pegawai (lower(btrim(email)))
  WHERE NULLIF(btrim(email), '') IS NOT NULL;
