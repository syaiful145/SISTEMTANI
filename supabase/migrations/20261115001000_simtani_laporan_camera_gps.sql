-- Simpan koordinat, akurasi, dan waktu pengambilan foto bukti laporan
ALTER TABLE public.laporan
  ADD COLUMN IF NOT EXISTS foto_lat double precision,
  ADD COLUMN IF NOT EXISTS foto_lon double precision,
  ADD COLUMN IF NOT EXISTS foto_accuracy double precision,
  ADD COLUMN IF NOT EXISTS foto_captured_at timestamptz;
