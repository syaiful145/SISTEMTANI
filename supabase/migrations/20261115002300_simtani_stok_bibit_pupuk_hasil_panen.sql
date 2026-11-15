-- AgriCore: pemakaian bibit/pupuk dan penerimaan hasil panen yang tercatat satu kali.
-- Migration lanjutan; tidak mengubah atau menghapus data laporan/transaksi yang sudah ada.

ALTER TABLE public.laporan
  ADD COLUMN IF NOT EXISTS pupuk_barang_id bigint,
  ADD COLUMN IF NOT EXISTS pupuk_dipakai numeric(14,2),
  ADD COLUMN IF NOT EXISTS stok_diproses_at timestamptz;

-- Hapus trigger lama yang membolehkan stok dibalik dengan mengubah status laporan.
DROP TRIGGER IF EXISTS trg_selaraskan_stok_laporan_diterima ON public.laporan;

CREATE OR REPLACE FUNCTION public.proses_stok_saat_laporan_diterima()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user uuid;
  v_nama text;
  v_barang_id bigint;
BEGIN
  IF OLD.status = 'diterima' AND NEW.status <> 'diterima' THEN
    RAISE EXCEPTION 'Laporan yang sudah diterima tidak dapat dibatalkan langsung. Hubungi Admin Utama untuk koreksi stok melalui transaksi penyesuaian.';
  END IF;

  IF NEW.status = 'diterima' AND OLD.status IS DISTINCT FROM 'diterima'
     AND NEW.stok_diproses_at IS NULL THEN
    SELECT auth_user_id INTO v_auth_user
    FROM public.pegawai WHERE id = NEW.pegawai_id;

    -- Pemakaian bibit hanya berasal dari laporan Penanaman.
    IF NEW.benih_barang_id IS NOT NULL AND coalesce(NEW.benih_dipakai,0) > 0 THEN
      UPDATE public.barang
      SET stok = stok - NEW.benih_dipakai
      WHERE id = NEW.benih_barang_id
        AND lower(trim(kategori)) = 'bibit'
        AND stok >= NEW.benih_dipakai
      RETURNING nama INTO v_nama;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stok bibit tidak cukup atau barang bukan kategori Bibit. Laporan belum diterima.';
      END IF;
      INSERT INTO public.transaksi
        (barang_id,jenis,jumlah,tanggal,keterangan,pegawai_id,auth_user_id,laporan_id)
      VALUES
        (NEW.benih_barang_id,'Keluar',NEW.benih_dipakai,NEW.tanggal,
         'Bibit digunakan; laporan #'||NEW.id,NEW.pegawai_id,v_auth_user,NEW.id);
    END IF;

    -- Pemakaian pupuk hanya berasal dari laporan Pemupukan.
    IF NEW.pupuk_barang_id IS NOT NULL AND coalesce(NEW.pupuk_dipakai,0) > 0 THEN
      UPDATE public.barang
      SET stok = stok - NEW.pupuk_dipakai
      WHERE id = NEW.pupuk_barang_id
        AND lower(trim(kategori)) = 'pupuk'
        AND stok >= NEW.pupuk_dipakai
      RETURNING nama INTO v_nama;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stok pupuk tidak cukup atau barang bukan kategori Pupuk. Laporan belum diterima.';
      END IF;
      INSERT INTO public.transaksi
        (barang_id,jenis,jumlah,tanggal,keterangan,pegawai_id,auth_user_id,laporan_id)
      VALUES
        (NEW.pupuk_barang_id,'Keluar',NEW.pupuk_dipakai,NEW.tanggal,
         'Pupuk digunakan; laporan #'||NEW.id,NEW.pegawai_id,v_auth_user,NEW.id);
    END IF;

    -- Hasil panen masuk gudang sebagai barang kategori Hasil Panen, satuan kg.
    IF NEW.jenis = 'Panen' AND coalesce(NEW.panen_kg,0) > 0 THEN
      PERFORM pg_advisory_xact_lock(hashtext(lower(trim(NEW.tanaman_nama))));
      SELECT id INTO v_barang_id
      FROM public.barang
      WHERE lower(trim(nama)) = lower(trim(NEW.tanaman_nama))
        AND lower(trim(kategori)) = 'hasil panen'
        AND lower(trim(satuan)) = 'kg'
      ORDER BY id
      LIMIT 1
      FOR UPDATE;

      IF v_barang_id IS NULL THEN
        INSERT INTO public.barang
          (kode,nama,kategori,stok,satuan,min_stok,tanggal_masuk)
        VALUES
          ('HP-'||NEW.id,trim(NEW.tanaman_nama),'Hasil Panen',NEW.panen_kg,'kg',0,NEW.tanggal)
        RETURNING id INTO v_barang_id;
      ELSE
        UPDATE public.barang
        SET stok = stok + NEW.panen_kg,
            tanggal_masuk = NEW.tanggal
        WHERE id = v_barang_id;
      END IF;

      INSERT INTO public.transaksi
        (barang_id,jenis,jumlah,tanggal,keterangan,pegawai_id,auth_user_id,laporan_id)
      VALUES
        (v_barang_id,'Masuk',NEW.panen_kg,NEW.tanggal,
         'Hasil panen diterima; laporan #'||NEW.id,NEW.pegawai_id,v_auth_user,NEW.id);
    END IF;

    NEW.stok_diproses_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_proses_stok_saat_laporan_diterima
BEFORE UPDATE OF status ON public.laporan
FOR EACH ROW
EXECUTE FUNCTION public.proses_stok_saat_laporan_diterima();

-- Fungsi pengiriman laporan versi baru. Laporan menunggu tidak mengubah stok.
DROP FUNCTION IF EXISTS public.pegawai_kirim_laporan_lapangan(
  date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,
  text,double precision,double precision,double precision,text,timestamptz,numeric,text
);

CREATE OR REPLACE FUNCTION public.pegawai_kirim_laporan_lapangan(
  p_tanggal date, p_jenis text, p_lokasi text, p_lahan_id bigint, p_deskripsi text,
  p_tanaman_nama text, p_luas_m2 numeric, p_jumlah_ditanam integer,
  p_umur_tanaman_hari integer, p_status_tanaman text, p_benih_barang_id bigint,
  p_benih_dipakai numeric, p_pupuk_barang_id bigint, p_pupuk_dipakai numeric,
  p_foto_path text, p_foto_lat double precision, p_foto_lon double precision,
  p_foto_accuracy double precision, p_foto_lokasi text, p_foto_captured_at timestamptz,
  p_panen_kg numeric DEFAULT NULL, p_kualitas_panen text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public,auth,storage
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pegawai_id bigint;
  v_laporan_id bigint;
  v_lahan_nama text;
  v_lahan_luas numeric;
  v_luas_tertanam numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Silakan masuk kembali.'; END IF;

  SELECT pg.id INTO v_pegawai_id
  FROM public.pegawai pg
  JOIN public.profiles pr ON pr.id = v_user
  WHERE pg.auth_user_id = v_user
    AND pg.status_verifikasi = 'disetujui'
    AND pr.role = 'pegawai';
  IF v_pegawai_id IS NULL THEN RAISE EXCEPTION 'Akun pegawai tidak aktif atau tidak ditemukan.'; END IF;

  IF p_jenis NOT IN ('Penanaman','Pemupukan','Penyiraman','Penyemprotan','Panen','Perawatan lainnya')
     OR coalesce(length(trim(p_deskripsi)),0)=0
     OR coalesce(length(trim(p_tanaman_nama)),0)=0
     OR p_foto_path IS NULL
     OR (storage.foldername(p_foto_path))[1] <> v_user::text THEN
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
     OR (p_benih_barang_id IS NOT NULL AND
         (p_jenis<>'Penanaman' OR p_benih_dipakai IS NULL OR p_benih_dipakai<=0
          OR NOT EXISTS (SELECT 1 FROM public.barang b WHERE b.id=p_benih_barang_id AND lower(trim(b.kategori))='bibit'))) THEN
    RAISE EXCEPTION 'Bibit hanya boleh dicatat pada Penanaman dan harus berupa barang kategori Bibit.';
  END IF;
  IF (p_pupuk_barang_id IS NULL AND coalesce(p_pupuk_dipakai,0)<>0)
     OR (p_jenis='Pemupukan' AND (p_pupuk_barang_id IS NULL OR p_pupuk_dipakai IS NULL OR p_pupuk_dipakai<=0))
     OR (p_pupuk_barang_id IS NOT NULL AND
         (p_jenis<>'Pemupukan' OR p_pupuk_dipakai IS NULL OR p_pupuk_dipakai<=0
          OR NOT EXISTS (SELECT 1 FROM public.barang b WHERE b.id=p_pupuk_barang_id AND lower(trim(b.kategori))='pupuk'))) THEN
    RAISE EXCEPTION 'Pupuk hanya boleh dicatat pada Pemupukan dan harus berupa barang kategori Pupuk.';
  END IF;

  SELECT nama,luas_total_m2 INTO v_lahan_nama,v_lahan_luas
  FROM public.lahan WHERE id=p_lahan_id AND aktif=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lahan tidak ditemukan atau tidak aktif.'; END IF;

  SELECT coalesce(sum(luas_m2),0) INTO v_luas_tertanam
  FROM public.laporan
  WHERE lahan_id=p_lahan_id AND jenis='Penanaman';
  IF p_jenis='Penanaman' AND v_luas_tertanam+p_luas_m2>v_lahan_luas THEN
    RAISE EXCEPTION 'Luas penanaman melebihi sisa lahan (% m²).',greatest(v_lahan_luas-v_luas_tertanam,0);
  END IF;

  INSERT INTO public.laporan
    (pegawai_id,tanggal,jenis,lokasi,lahan_id,deskripsi,tanaman_nama,luas_m2,jumlah_ditanam,
     umur_tanaman_hari,status_tanaman,benih_barang_id,benih_dipakai,pupuk_barang_id,pupuk_dipakai,
     panen_kg,kualitas_panen,foto_path,foto_lat,foto_lon,foto_accuracy,foto_lokasi,foto_captured_at,status,dibaca)
  VALUES
    (v_pegawai_id,coalesce(p_tanggal,CURRENT_DATE),p_jenis,v_lahan_nama,p_lahan_id,trim(p_deskripsi),
     trim(p_tanaman_nama),CASE WHEN p_jenis='Penanaman' THEN p_luas_m2 ELSE NULL END,
     CASE WHEN p_jenis='Penanaman' THEN p_jumlah_ditanam ELSE NULL END,
     p_umur_tanaman_hari,nullif(p_status_tanaman,''),p_benih_barang_id,
     CASE WHEN p_benih_barang_id IS NULL THEN NULL ELSE p_benih_dipakai END,
     p_pupuk_barang_id,CASE WHEN p_pupuk_barang_id IS NULL THEN NULL ELSE p_pupuk_dipakai END,
     CASE WHEN p_jenis='Panen' THEN p_panen_kg ELSE NULL END,
     CASE WHEN p_jenis='Panen' THEN p_kualitas_panen ELSE NULL END,
     p_foto_path,p_foto_lat,p_foto_lon,p_foto_accuracy,p_foto_lokasi,p_foto_captured_at,
     'belum_diterima',false)
  RETURNING id INTO v_laporan_id;

  RETURN jsonb_build_object('laporan_id',v_laporan_id,'lahan',v_lahan_nama,
    'luas_tertanam',v_luas_tertanam,
    'luas_sisa',greatest(v_lahan_luas-v_luas_tertanam-CASE WHEN p_jenis='Penanaman' THEN p_luas_m2 ELSE 0 END,0),
    'panen_kg',p_panen_kg);
END;
$$;

REVOKE ALL ON FUNCTION public.pegawai_kirim_laporan_lapangan(
  date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,bigint,numeric,
  text,double precision,double precision,double precision,text,timestamptz,numeric,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_kirim_laporan_lapangan(
  date,text,text,bigint,text,text,numeric,integer,integer,text,bigint,numeric,bigint,numeric,
  text,double precision,double precision,double precision,text,timestamptz,numeric,text
) TO authenticated;
