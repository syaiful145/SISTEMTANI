-- Status pemeriksaan laporan harian pegawai
ALTER TABLE public.laporan
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'belum_diterima';

UPDATE public.laporan
SET status = 'belum_diterima'
WHERE status IS NULL OR status NOT IN ('belum_diterima', 'diterima');

ALTER TABLE public.laporan
  DROP CONSTRAINT IF EXISTS laporan_status_check;

ALTER TABLE public.laporan
  ADD CONSTRAINT laporan_status_check
  CHECK (status IN ('belum_diterima', 'diterima'));
