-- Data hasil panen disimpan bersama laporan lapangan pegawai.
ALTER TABLE public.laporan
  ADD COLUMN IF NOT EXISTS panen_kg numeric(14,2),
  ADD COLUMN IF NOT EXISTS kualitas_panen text;

CREATE OR REPLACE FUNCTION public.pegawai_kirim_laporan_lapangan(
  p_tanggal date, p_jenis text, p_lokasi text, p_lahan_id bigint, p_deskripsi text,
  p_tanaman_nama text, p_luas_m2 numeric, p_jumlah_ditanam integer,
  p_umur_tanaman_hari integer, p_status_tanaman text, p_benih_barang_id bigint,
  p_benih_dipakai numeric, p_foto_path text, p_foto_lat double precision,
  p_foto_lon double precision, p_foto_accuracy double precision, p_foto_lokasi text,
  p_foto_captured_at timestamptz, p_panen_kg numeric DEFAULT NULL,
  p_kualitas_panen text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,storage
AS $$
DECLARE
  v_user uuid:=auth.uid(); v_pegawai_id bigint; v_laporan_id bigint;
  v_nama_barang text; v_satuan text; v_sisa numeric;
  v_lahan_nama text; v_lahan_luas numeric; v_luas_tertanam numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Silakan masuk kembali.'; END IF;
  SELECT pg.id INTO v_pegawai_id FROM public.pegawai pg
  JOIN public.profiles pr ON pr.id=v_user
  WHERE pg.auth_user_id=v_user AND pg.status_verifikasi='disetujui' AND pr.role='pegawai';
  IF v_pegawai_id IS NULL THEN RAISE EXCEPTION 'Akun pegawai tidak aktif atau tidak ditemukan.'; END IF;
  IF p_jenis NOT IN ('Penanaman','Pemupukan','Penyiraman','Penyemprotan','Panen','Perawatan lainnya')
     OR coalesce(length(trim(p_deskripsi)),0)=0 OR coalesce(length(trim(p_tanaman_nama)),0)=0
     OR p_foto_path IS NULL OR (storage.foldername(p_foto_path))[1]<>v_user::text THEN
    RAISE EXCEPTION 'Data kegiatan dan bukti foto wajib lengkap.';
  END IF;
  IF (p_jenis='Penanaman' AND (p_luas_m2 IS NULL OR p_luas_m2<=0))
     OR (p_luas_m2 IS NOT NULL AND p_luas_m2<=0)
     OR (p_jumlah_ditanam IS NOT NULL AND p_jumlah_ditanam<0)
     OR (p_umur_tanaman_hari IS NOT NULL AND p_umur_tanaman_hari<0) THEN
    RAISE EXCEPTION 'Periksa luas, jumlah bibit, dan umur tanaman.';
  END IF;
  IF p_jenis='Panen' AND (p_panen_kg IS NULL OR p_panen_kg<=0) THEN
    RAISE EXCEPTION 'Jumlah hasil panen wajib lebih dari nol.';
  END IF;
  IF (p_benih_barang_id IS NULL AND coalesce(p_benih_dipakai,0)<>0)
     OR (p_benih_barang_id IS NOT NULL AND (p_benih_dipakai IS NULL OR p_benih_dipakai<=0)) THEN
    RAISE EXCEPTION 'Pilih barang dan jumlah pemakaian yang benar.';
  END IF;
  SELECT nama,luas_total_m2 INTO v_lahan_nama,v_lahan_luas
  FROM public.lahan WHERE id=p_lahan_id AND aktif=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lahan tidak ditemukan atau tidak aktif.'; END IF;
  SELECT coalesce(sum(luas_m2),0) INTO v_luas_tertanam FROM public.laporan
  WHERE lahan_id=p_lahan_id AND jenis='Penanaman';
  IF p_jenis='Penanaman' AND v_luas_tertanam+p_luas_m2>v_lahan_luas THEN
    RAISE EXCEPTION 'Luas penanaman melebihi sisa lahan (% m²).',greatest(v_lahan_luas-v_luas_tertanam,0);
  END IF;
  INSERT INTO public.laporan
    (pegawai_id,tanggal,jenis,lokasi,lahan_id,deskripsi,tanaman_nama,luas_m2,jumlah_ditanam,umur_tanaman_hari,status_tanaman,
     benih_barang_id,benih_dipakai,panen_kg,kualitas_panen,foto_path,foto_lat,foto_lon,foto_accuracy,foto_lokasi,foto_captured_at,status,dibaca)
  VALUES
    (v_pegawai_id,coalesce(p_tanggal,CURRENT_DATE),p_jenis,v_lahan_nama,p_lahan_id,trim(p_deskripsi),trim(p_tanaman_nama),
     CASE WHEN p_jenis='Penanaman' THEN p_luas_m2 ELSE NULL END,
     CASE WHEN p_jenis='Penanaman' THEN p_jumlah_ditanam ELSE NULL END,
     p_umur_tanaman_hari,nullif(p_status_tanaman,''),p_benih_barang_id,
     CASE WHEN p_benih_barang_id IS NULL THEN NULL ELSE p_benih_dipakai END,
     CASE WHEN p_jenis='Panen' THEN p_panen_kg ELSE NULL END,
     CASE WHEN p_jenis='Panen' THEN p_kualitas_panen ELSE NULL END,
     p_foto_path,p_foto_lat,p_foto_lon,p_foto_accuracy,p_foto_lokasi,p_foto_captured_at,'belum_diterima',false)
  RETURNING id INTO v_laporan_id;
  IF p_benih_barang_id IS NOT NULL THEN
    UPDATE public.barang SET stok=stok-p_benih_dipakai
    WHERE id=p_benih_barang_id AND stok>=p_benih_dipakai
    RETURNING nama,satuan,stok INTO v_nama_barang,v_satuan,v_sisa;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stok barang tidak mencukupi.'; END IF;
    INSERT INTO public.transaksi
      (barang_id,jenis,jumlah,tanggal,keterangan,pegawai_id,auth_user_id,laporan_id)
    VALUES (p_benih_barang_id,'Keluar',p_benih_dipakai,coalesce(p_tanggal,CURRENT_DATE),
      'Pemakaian pada laporan #'||v_laporan_id||': '||left(trim(p_deskripsi),250),v_pegawai_id,v_user,v_laporan_id);
  END IF;
  RETURN jsonb_build_object('laporan_id',v_laporan_id,'lahan',v_lahan_nama,
    'luas_tertanam',CASE WHEN p_jenis='Penanaman' THEN v_luas_tertanam+p_luas_m2 ELSE v_luas_tertanam END,
    'luas_sisa',greatest(v_lahan_luas-v_luas_tertanam-CASE WHEN p_jenis='Penanaman' THEN p_luas_m2 ELSE 0 END,0),
    'panen_kg',p_panen_kg,'barang',v_nama_barang,'satuan',v_satuan,'sisa_stok',v_sisa);
END;
$$;
REVOKE ALL ON FUNCTION public.pegawai_kirim_laporan_lapangan(date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,text,double precision,double precision,double precision,text,timestamptz,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_kirim_laporan_lapangan(date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,text,double precision,double precision,double precision,text,timestamptz,numeric,text) TO authenticated;
