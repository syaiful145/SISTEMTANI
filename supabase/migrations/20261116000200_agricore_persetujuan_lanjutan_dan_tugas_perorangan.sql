-- AgriCore: persetujuan kelanjutan tugas dan penugasan perorangan.
-- Aman untuk data lama: tugas kelompok yang sudah ada tetap dipertahankan.

ALTER TABLE public.tugas_kelompok
  ALTER COLUMN kelompok_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pegawai_id bigint REFERENCES public.pegawai(id) ON DELETE RESTRICT;

ALTER TABLE public.tugas_kelompok
  DROP CONSTRAINT IF EXISTS tugas_kelompok_status_check;

ALTER TABLE public.tugas_kelompok
  ADD CONSTRAINT tugas_kelompok_status_check
  CHECK (status IN ('berjalan','menunggu_verifikasi','menunggu_persetujuan_lanjut','ditunda','selesai','dibatalkan'));

ALTER TABLE public.tugas_kelompok
  DROP CONSTRAINT IF EXISTS tugas_kelompok_penugasan_check;

ALTER TABLE public.tugas_kelompok
  ADD CONSTRAINT tugas_kelompok_penugasan_check
  CHECK (
    (kelompok_id IS NOT NULL AND pegawai_id IS NULL)
    OR (kelompok_id IS NULL AND pegawai_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS tugas_kelompok_pegawai_status_idx
  ON public.tugas_kelompok (pegawai_id, status, tanggal_mulai DESC);

-- Pegawai hanya dapat melihat tugas perorangan miliknya atau tugas kelompoknya.
DROP POLICY IF EXISTS tugas_anggota_read ON public.tugas_kelompok;
CREATE POLICY tugas_anggota_read ON public.tugas_kelompok
  FOR SELECT TO authenticated
  USING (
    (pegawai_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pegawai pg
      WHERE pg.id = tugas_kelompok.pegawai_id
        AND pg.auth_user_id = auth.uid()
        AND pg.status_verifikasi = 'disetujui'
    ))
    OR
    (kelompok_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.anggota_kelompok ak
      JOIN public.pegawai pg ON pg.id = ak.pegawai_id
      WHERE ak.kelompok_id = tugas_kelompok.kelompok_id
        AND pg.auth_user_id = auth.uid()
        AND pg.status_verifikasi = 'disetujui'
    ))
  );

-- Perbaiki hak pegawai menulis catatan: tugas bisa milik kelompok atau perorangan.
DROP POLICY IF EXISTS aktivitas_anggota_insert ON public.aktivitas_tugas;
CREATE POLICY aktivitas_anggota_insert ON public.aktivitas_tugas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pegawai pg
      WHERE pg.id = aktivitas_tugas.pegawai_id
        AND pg.auth_user_id = auth.uid()
        AND pg.status_verifikasi = 'disetujui'
    )
    AND EXISTS (
      SELECT 1
      FROM public.tugas_kelompok tk
      WHERE tk.id = aktivitas_tugas.tugas_id
        AND tk.status = 'berjalan'
        AND (
          (tk.pegawai_id = aktivitas_tugas.pegawai_id)
          OR
          (tk.kelompok_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.anggota_kelompok ak
            WHERE ak.kelompok_id = tk.kelompok_id
              AND ak.pegawai_id = aktivitas_tugas.pegawai_id
          ))
        )
    )
  );

-- Ketika pegawai absen pulang, tugas aktifnya otomatis menunggu keputusan admin.
-- Tugas kelompok menunggu setelah semua anggota yang absen masuk hari itu sudah pulang.
CREATE OR REPLACE FUNCTION public.agricore_tandai_tugas_menunggu_lanjutan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pulang_at IS NULL OR OLD.pulang_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.tugas_kelompok tk
  SET status = 'menunggu_persetujuan_lanjut',
      updated_at = now()
  WHERE tk.status = 'berjalan'
    AND (
      tk.pegawai_id = NEW.pegawai_id
      OR (
        tk.kelompok_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.anggota_kelompok ak
          WHERE ak.kelompok_id = tk.kelompok_id
            AND ak.pegawai_id = NEW.pegawai_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.anggota_kelompok ak2
          JOIN public.absensi a2
            ON a2.pegawai_id = ak2.pegawai_id
           AND a2.tanggal = NEW.tanggal
          WHERE ak2.kelompok_id = tk.kelompok_id
            AND a2.masuk_at IS NOT NULL
            AND a2.pulang_at IS NULL
        )
      )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS absensi_tugas_menunggu_lanjutan ON public.absensi;
CREATE TRIGGER absensi_tugas_menunggu_lanjutan
AFTER UPDATE OF pulang_at ON public.absensi
FOR EACH ROW
WHEN (NEW.pulang_at IS NOT NULL AND OLD.pulang_at IS NULL)
EXECUTE FUNCTION public.agricore_tandai_tugas_menunggu_lanjutan();

-- Pastikan hanya admin yang dapat mengubah status tugas dan memberi persetujuan.
