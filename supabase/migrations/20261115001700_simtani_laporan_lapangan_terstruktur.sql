-- Data lapangan terstruktur pada laporan pegawai
ALTER TABLE public.laporan
  ADD COLUMN IF NOT EXISTS tanaman_nama text,
  ADD COLUMN IF NOT EXISTS luas_m2 numeric(14,2),
  ADD COLUMN IF NOT EXISTS jumlah_ditanam integer,
  ADD COLUMN IF NOT EXISTS umur_tanaman_hari integer,
  ADD COLUMN IF NOT EXISTS status_tanaman text,
  ADD COLUMN IF NOT EXISTS benih_barang_id bigint,
  ADD COLUMN IF NOT EXISTS benih_dipakai numeric(14,2);

ALTER TABLE public.transaksi
  ADD COLUMN IF NOT EXISTS laporan_id bigint;

-- Penggunaan benih dari laporan lapangan, stok dan transaksi diproses dalam satu transaksi database.
CREATE OR REPLACE FUNCTION public.pegawai_gunakan_benih_laporan(
  p_barang_id bigint,
  p_jumlah numeric,
  p_keterangan text,
  p_laporan_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pegawai_id bigint;
  v_nama text;
  v_satuan text;
  v_sisa numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan masuk kembali.';
  END IF;

  SELECT pg.id INTO v_pegawai_id
  FROM public.pegawai pg
  JOIN public.profiles pr ON pr.id = v_user
  WHERE pg.auth_user_id = v_user
    AND pg.status_verifikasi = 'disetujui'
    AND pr.role = 'pegawai';

  IF v_pegawai_id IS NULL THEN
    RAISE EXCEPTION 'Akun pegawai tidak aktif atau tidak ditemukan.';
  END IF;

  IF p_jumlah IS NULL OR p_jumlah <= 0 THEN
    RAISE EXCEPTION 'Jumlah benih harus lebih dari nol.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.laporan l
    WHERE l.id = p_laporan_id
      AND l.pegawai_id = v_pegawai_id
      AND l.benih_barang_id = p_barang_id
      AND l.benih_dipakai = p_jumlah
  ) THEN
    RAISE EXCEPTION 'Laporan penggunaan benih tidak cocok atau bukan milik akun ini.';
  END IF;

  UPDATE public.barang
  SET stok = stok - p_jumlah
  WHERE id = p_barang_id
    AND lower(kategori) = 'bibit'
    AND stok >= p_jumlah
  RETURNING nama, satuan, stok INTO v_nama, v_satuan, v_sisa;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Benih tidak ditemukan atau stok tidak mencukupi.';
  END IF;

  INSERT INTO public.transaksi
    (barang_id, jenis, jumlah, tanggal, keterangan, pegawai_id, auth_user_id, laporan_id)
  VALUES
    (p_barang_id, 'Keluar', p_jumlah, CURRENT_DATE,
     concat('Pemakaian pada laporan #', p_laporan_id, ': ', coalesce(nullif(left(p_keterangan,250),''),'Tanpa keterangan')),
     v_pegawai_id, v_user, p_laporan_id);

  RETURN jsonb_build_object('barang',v_nama,'satuan',v_satuan,'sisa',v_sisa);
END;
$$;

REVOKE ALL ON FUNCTION public.pegawai_gunakan_benih_laporan(bigint,numeric,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_gunakan_benih_laporan(bigint,numeric,text,bigint) TO authenticated;
