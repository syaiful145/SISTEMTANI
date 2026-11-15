-- Keterangan dan jenis absen pulang pegawai
ALTER TABLE public.absensi
  ADD COLUMN IF NOT EXISTS jenis_pulang text NOT NULL DEFAULT 'normal'
    CHECK (jenis_pulang IN ('normal','awal')),
  ADD COLUMN IF NOT EXISTS alasan_pulang text;

COMMENT ON COLUMN public.absensi.jenis_pulang IS 'Jenis pulang: normal atau awal';
COMMENT ON COLUMN public.absensi.alasan_pulang IS 'Keterangan wajib jika pegawai pulang lebih awal';
