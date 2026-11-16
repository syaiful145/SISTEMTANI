-- AgriCore: batasi mutasi stok ke RPC Admin yang atomik.
-- Pegawai tetap dapat membaca stok dan riwayat transaksi sesuai kebijakan baca.
-- Perubahan ini aditif: tidak menghapus data barang atau transaksi.

-- Hilangkan kebijakan PERMISSIVE lama yang memberi akses tulis berdasarkan
-- has_module_access('gudang'). Kebijakan baca khusus tetap dipertahankan.
DROP POLICY IF EXISTS agricore_barang_manage ON public.barang;
DROP POLICY IF EXISTS barang_authenticated_select ON public.barang;
DROP POLICY IF EXISTS barang_admin_insert ON public.barang;
DROP POLICY IF EXISTS barang_admin_update ON public.barang;
DROP POLICY IF EXISTS barang_admin_delete ON public.barang;

DROP POLICY IF EXISTS agricore_transaksi_manage ON public.transaksi;

-- Hak langsung hanya untuk membaca. Semua mutasi melalui fungsi tervalidasi.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.barang FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.transaksi FROM authenticated;
GRANT SELECT ON TABLE public.barang, public.transaksi TO authenticated;

-- Sequence tidak lagi diperlukan oleh klien karena INSERT dilakukan oleh RPC.
DO $$
DECLARE
  v_sequence text;
BEGIN
  v_sequence := pg_get_serial_sequence('public.barang', 'id');
  IF v_sequence IS NOT NULL THEN
    EXECUTE format('REVOKE USAGE, SELECT ON SEQUENCE %s FROM authenticated', v_sequence);
  END IF;
  v_sequence := pg_get_serial_sequence('public.transaksi', 'id');
  IF v_sequence IS NOT NULL THEN
    EXECUTE format('REVOKE USAGE, SELECT ON SEQUENCE %s FROM authenticated', v_sequence);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_catat_transaksi_stok(
  p_barang_id bigint,
  p_jenis text,
  p_jumlah numeric,
  p_tanggal date,
  p_penanaman_id bigint DEFAULT NULL,
  p_keterangan text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_stok numeric;
  v_satuan text;
  v_nama text;
  v_transaksi_id bigint;
  v_stok_baru numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND lower(trim(p.role)) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya Admin yang dapat mencatat transaksi stok.';
  END IF;

  IF p_jenis NOT IN ('Masuk','Keluar') OR p_jumlah IS NULL OR p_jumlah <= 0 THEN
    RAISE EXCEPTION 'Jenis transaksi atau jumlah stok tidak valid.';
  END IF;

  SELECT b.stok, b.satuan, b.nama
    INTO v_stok, v_satuan, v_nama
  FROM public.barang b
  WHERE b.id = p_barang_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang tidak ditemukan.';
  END IF;

  v_stok_baru := CASE WHEN p_jenis = 'Masuk'
    THEN v_stok + p_jumlah ELSE v_stok - p_jumlah END;

  IF v_stok_baru < 0 THEN
    RAISE EXCEPTION 'Stok tidak cukup. Stok tersedia: % %.', v_stok, v_satuan;
  END IF;

  UPDATE public.barang
  SET stok = v_stok_baru,
      tanggal_masuk = CASE WHEN p_jenis = 'Masuk'
        THEN coalesce(p_tanggal, CURRENT_DATE) ELSE tanggal_masuk END
  WHERE id = p_barang_id;

  INSERT INTO public.transaksi
    (barang_id, jenis, jumlah, tanggal, keterangan, auth_user_id, penanaman_id)
  VALUES
    (p_barang_id, p_jenis, p_jumlah, coalesce(p_tanggal, CURRENT_DATE),
     nullif(btrim(coalesce(p_keterangan,'')),''), auth.uid(), p_penanaman_id)
  RETURNING id INTO v_transaksi_id;

  RETURN jsonb_build_object(
    'transaksi_id', v_transaksi_id,
    'barang_id', p_barang_id,
    'stok_baru', v_stok_baru,
    'nama_barang', v_nama
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_catat_transaksi_stok(bigint,text,numeric,date,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_catat_transaksi_stok(bigint,text,numeric,date,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_simpan_barang(
  p_id bigint,
  p_kode text,
  p_nama text,
  p_kategori text,
  p_satuan text,
  p_min_stok numeric,
  p_stok_awal numeric DEFAULT 0,
  p_tanggal_masuk date DEFAULT CURRENT_DATE
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND lower(trim(p.role)) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Hanya Admin yang dapat menyimpan data barang.';
  END IF;

  IF coalesce(length(btrim(p_kode)),0) = 0
     OR coalesce(length(btrim(p_nama)),0) = 0
     OR coalesce(length(btrim(p_kategori)),0) = 0
     OR coalesce(length(btrim(p_satuan)),0) = 0
     OR p_min_stok IS NULL OR p_min_stok < 0
     OR coalesce(p_stok_awal,0) < 0 THEN
    RAISE EXCEPTION 'Lengkapi kode, nama, kategori, satuan, dan jumlah stok yang valid.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.barang
      (kode, nama, kategori, stok, satuan, min_stok, tanggal_masuk)
    VALUES
      (btrim(p_kode), btrim(p_nama), btrim(p_kategori), 0,
       btrim(p_satuan), p_min_stok, coalesce(p_tanggal_masuk,CURRENT_DATE))
    RETURNING id INTO v_id;

    -- Stok awal dicatat sebagai transaksi Masuk agar riwayat dan saldo selaras.
    IF coalesce(p_stok_awal,0) > 0 THEN
      PERFORM public.admin_catat_transaksi_stok(
        v_id, 'Masuk', p_stok_awal, coalesce(p_tanggal_masuk,CURRENT_DATE),
        NULL, 'Stok awal saat barang dibuat'
      );
    END IF;
  ELSE
    UPDATE public.barang
    SET kode = btrim(p_kode),
        nama = btrim(p_nama),
        kategori = btrim(p_kategori),
        satuan = btrim(p_satuan),
        min_stok = p_min_stok
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang tidak ditemukan.';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_simpan_barang(bigint,text,text,text,text,numeric,numeric,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_simpan_barang(bigint,text,text,text,text,numeric,numeric,date) TO authenticated;

COMMENT ON FUNCTION public.admin_catat_transaksi_stok(bigint,text,numeric,date,bigint,text)
  IS 'Mencatat transaksi masuk/keluar dan memperbarui saldo barang secara atomik; Admin only.';
COMMENT ON FUNCTION public.admin_simpan_barang(bigint,text,text,text,text,numeric,numeric,date)
  IS 'Menyimpan master barang; stok awal dicatat sebagai transaksi masuk; Admin only.';
