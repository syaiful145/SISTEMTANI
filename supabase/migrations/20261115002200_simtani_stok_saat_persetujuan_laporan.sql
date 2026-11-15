-- Persetujuan laporan menjadi titik resmi pengurangan stok.
-- Laporan menunggu tidak mengurangi stok; penerimaan mengurangi stok satu kali.
ALTER TABLE public.transaksi
  ADD COLUMN IF NOT EXISTS laporan_id bigint;

-- Pulihkan stok untuk laporan yang masih menunggu, lalu hapus transaksi pemakaian lamanya.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.barang_id, sum(t.jumlah) AS jumlah
    FROM public.transaksi t
    JOIN public.laporan l ON l.id = t.laporan_id
    WHERE l.status = 'belum_diterima' AND t.jenis = 'Keluar'
    GROUP BY t.barang_id
  LOOP
    UPDATE public.barang SET stok = stok + r.jumlah WHERE id = r.barang_id;
  END LOOP;
  DELETE FROM public.transaksi t
  USING public.laporan l
  WHERE l.id = t.laporan_id
    AND l.status = 'belum_diterima'
    AND t.jenis = 'Keluar';
END $$;

CREATE OR REPLACE FUNCTION public.selaraskan_stok_laporan_diterima()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pegawai_auth uuid;
  v_nama text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'diterima' AND OLD.status = 'belum_diterima' THEN
    IF NEW.benih_barang_id IS NOT NULL AND coalesce(NEW.benih_dipakai,0) > 0 THEN
      UPDATE public.barang
      SET stok = stok - NEW.benih_dipakai
      WHERE id = NEW.benih_barang_id AND stok >= NEW.benih_dipakai
      RETURNING nama INTO v_nama;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stok barang tidak mencukupi untuk menyetujui laporan ini.';
      END IF;

      SELECT auth_user_id INTO v_pegawai_auth
      FROM public.pegawai WHERE id = NEW.pegawai_id;

      INSERT INTO public.transaksi
        (barang_id, jenis, jumlah, tanggal, keterangan, pegawai_id, auth_user_id, laporan_id)
      VALUES
        (NEW.benih_barang_id, 'Keluar', NEW.benih_dipakai, NEW.tanggal,
         'Pemakaian disetujui pada laporan #' || NEW.id,
         NEW.pegawai_id, v_pegawai_auth, NEW.id);
    END IF;
  ELSIF NEW.status = 'belum_diterima' AND OLD.status = 'diterima' THEN
    UPDATE public.barang b
    SET stok = b.stok + tx.jumlah
    FROM (
      SELECT barang_id, sum(jumlah) AS jumlah
      FROM public.transaksi
      WHERE laporan_id = NEW.id AND jenis = 'Keluar'
      GROUP BY barang_id
    ) tx
    WHERE b.id = tx.barang_id;

    DELETE FROM public.transaksi
    WHERE laporan_id = NEW.id AND jenis = 'Keluar';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_selaraskan_stok_laporan_diterima ON public.laporan;
CREATE TRIGGER trg_selaraskan_stok_laporan_diterima
AFTER UPDATE OF status ON public.laporan
FOR EACH ROW
EXECUTE FUNCTION public.selaraskan_stok_laporan_diterima();

-- Laporan pegawai tetap menjadi satu sumber data. Stok ditangani saat status diterima.
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
  v_user uuid := auth.uid(); v_pegawai_id bigint; v_laporan_id bigint;
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
  -- Semua laporan menahan kapasitas agar laporan yang menunggu tidak menyebabkan lahan terpesan berulang.
  SELECT coalesce(sum(luas_m2),0) INTO v_luas_tertanam
  FROM public.laporan WHERE lahan_id=p_lahan_id AND jenis='Penanaman';
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
  RETURN jsonb_build_object('laporan_id',v_laporan_id,'lahan',v_lahan_nama,
    'luas_tertanam',v_luas_tertanam,
    'luas_sisa',greatest(v_lahan_luas-v_luas_tertanam-CASE WHEN p_jenis='Penanaman' THEN p_luas_m2 ELSE 0 END,0),
    'panen_kg',p_panen_kg);
END;
$$;
REVOKE ALL ON FUNCTION public.pegawai_kirim_laporan_lapangan(date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,text,double precision,double precision,double precision,text,timestamptz,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_kirim_laporan_lapangan(date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,text,double precision,double precision,double precision,text,timestamptz,numeric,text) TO authenticated;
