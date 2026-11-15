-- Pencatatan penggunaan benih oleh pegawai dengan pengurangan stok atomik
ALTER TABLE public.transaksi
  ADD COLUMN IF NOT EXISTS pegawai_id bigint REFERENCES public.pegawai(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.pegawai_gunakan_benih(
  p_barang_id bigint,
  p_jumlah numeric,
  p_keterangan text DEFAULT NULL
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
  IF p_jumlah IS NULL OR p_jumlah <= 0 OR p_jumlah <> trunc(p_jumlah) THEN
    RAISE EXCEPTION 'Jumlah penggunaan harus bilangan bulat lebih dari nol.';
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
    (barang_id, jenis, jumlah, tanggal, keterangan, pegawai_id, auth_user_id)
  VALUES
    (p_barang_id, 'Keluar', p_jumlah, CURRENT_DATE,
     concat('Penggunaan pegawai: ', coalesce(nullif(left(p_keterangan,250),''),'Tanpa keterangan')),
     v_pegawai_id, v_user);

  RETURN jsonb_build_object('barang',v_nama,'satuan',v_satuan,'sisa',v_sisa);
END;
$$;

REVOKE ALL ON FUNCTION public.pegawai_gunakan_benih(bigint,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_gunakan_benih(bigint,numeric,text) TO authenticated;
