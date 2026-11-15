-- Nama lokasi hasil reverse geocoding untuk foto laporan
ALTER TABLE public.laporan
  ADD COLUMN IF NOT EXISTS foto_lokasi text;
