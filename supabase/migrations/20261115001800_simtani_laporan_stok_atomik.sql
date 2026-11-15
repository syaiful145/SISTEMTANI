-- Simpan laporan pekerjaan dan pengurangan stok dalam satu transaksi atomik
CREATE OR REPLACE FUNCTION public.pegawai_kirim_laporan_lapangan(
  p_tanggal date,
  p_jenis text,
  p_lokasi text,
  p_deskripsi text,
  p_tanaman_nama text,
  p_luas_m2 numeric,
  p_jumlah_ditanam integer,
  p_umur_tanaman_hari integer,
  p_status_tanaman text,
  p_benih_barang_id bigint,
  p_benih_dipakai numeric,
  p_foto_path text,
  p_foto_lat double precision,
  p_foto_lon double precision,
  p_foto_accuracy double precision,
  p_foto_lokasi text,
  p_foto_captured_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pegawai_id bigint;
  v_laporan_id bigint;
  v_nama_benih text;
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

  IF p_jenis IS NULL OR length(trim(p_jenis))=0 OR p_lokasi IS NULL OR length(trim(p_lokasi))=0
     OR p_deskripsi IS NULL OR length(trim(p_deskripsi))=0 OR p_tanaman_nama IS NULL OR length(trim(p_tanaman_nama))=0
     OR p_foto_path IS NULL OR (storage.foldername(p_foto_path))[1] <> v_user::text THEN
    RAISE EXCEPTION 'Data laporan dan bukti foto tidak lengkap.';
  END IF;

  IF (p_luas_m2 IS NOT NULL AND p_luas_m2 <= 0)
     OR (p_jumlah_ditanam IS NOT NULL AND p_jumlah_ditanam < 0)
     OR (p_umur_tanaman_hari IS NOT NULL AND p_umur_tanaman_hari < 0) THEN
    RAISE EXCEPTION 'Nilai luas, jumlah, atau umur tanaman tidak valid.';
  END IF;

  IF (p_benih_barang_id IS NULL AND coalesce(p_benih_dipakai,0) <> 0)
     OR (p_benih_barang_id IS NOT NULL AND (p_benih_dipakai IS NULL OR p_benih_dipakai <= 0)) THEN
    RAISE EXCEPTION 'Pilih benih dan jumlah pemakaian yang benar.';
  END IF;

  INSERT INTO public.laporan
    (pegawai_id,tanggal,jenis,lokasi,deskripsi,tanaman_nama,luas_m2,jumlah_ditanam,umur_tanaman_hari,status_tanaman,
     benih_barang_id,benih_dipakai,foto_path,foto_lat,foto_lon,foto_accuracy,foto_lokasi,foto_captured_at,status,dibaca)
  VALUES
    (v_pegawai_id,coalesce(p_tanggal,CURRENT_DATE),trim(p_jenis),trim(p_lokasi),trim(p_deskripsi),trim(p_tanaman_nama),
     p_luas_m2,p_jumlah_ditanam,p_umur_tanaman_hari,nullif(p_status_tanaman,''),
     p_benih_barang_id,CASE WHEN p_benih_barang_id IS NULL THEN NULL ELSE p_benih_dipakai END,
     p_foto_path,p_foto_lat,p_foto_lon,p_foto_accuracy,p_foto_lokasi,p_foto_captured_at,'belum_diterima',false)
  RETURNING id INTO v_laporan_id;

  IF p_benih_barang_id IS NOT NULL THEN
    UPDATE public.barang
    SET stok = stok - p_benih_dipakai
    WHERE id = p_benih_barang_id
      AND lower(kategori) = 'bibit'
      AND stok >= p_benih_dipakai
    RETURNING nama,satuan,stok INTO v_nama_benih,v_satuan,v_sisa;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stok benih tidak mencukupi atau barang bukan kategori bibit.';
    END IF;

    INSERT INTO public.transaksi
      (barang_id,jenis,jumlah,tanggal,keterangan,pegawai_id,auth_user_id,laporan_id)
    VALUES
      (p_benih_barang_id,'Keluar',p_benih_dipakai,coalesce(p_tanggal,CURRENT_DATE),
       'Pemakaian pada laporan #'||v_laporan_id||': '||left(trim(p_deskripsi),250),
       v_pegawai_id,v_user,v_laporan_id);
  END IF;

  RETURN jsonb_build_object('laporan_id',v_laporan_id,'benih',v_nama_benih,'satuan',v_satuan,'sisa_stok',v_sisa);
END;
$$;

REVOKE ALL ON FUNCTION public.pegawai_kirim_laporan_lapangan(date,text,text,text,text,numeric,integer,integer,text,bigint,numeric,text,double precision,double precision,double precision,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_kirim_laporan_lapangan(date,text,text,text,text,numeric,integer,integer,text,bigint,numeric,text,double precision,double precision,double precision,text,timestamptz) TO authenticated;
