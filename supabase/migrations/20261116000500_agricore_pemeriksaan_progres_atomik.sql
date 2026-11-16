-- AgriCore: pemeriksaan progres dan perubahan status penugasan dalam satu transaksi.
-- Additive only; tidak mengubah atau menghapus tabel dan data operasional lama.

CREATE OR REPLACE FUNCTION public.admin_periksa_progres_lahan(
  p_progres_id bigint,
  p_status text,
  p_catatan_admin text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_penugasan_id bigint;
  v_status_penugasan text;
  v_catatan text := btrim(coalesce(p_catatan_admin,''));
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND lower(p.role)='admin'
  ) THEN
    RAISE EXCEPTION 'Hanya Admin yang dapat memeriksa progres.';
  END IF;

  IF p_status NOT IN ('diterima','perlu_perbaikan') THEN
    RAISE EXCEPTION 'Status pemeriksaan tidak valid.';
  END IF;
  IF p_status='perlu_perbaikan' AND v_catatan='' THEN
    RAISE EXCEPTION 'Catatan perbaikan wajib diisi.';
  END IF;

  SELECT pr.penugasan_id INTO v_penugasan_id
  FROM public.progres_lahan pr
  WHERE pr.id=p_progres_id AND pr.status='menunggu_verifikasi'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progres tidak ditemukan atau sudah diperiksa.';
  END IF;

  SELECT pl.status INTO v_status_penugasan
  FROM public.penugasan_lahan pl
  WHERE pl.id=v_penugasan_id
  FOR UPDATE;
  IF NOT FOUND OR v_status_penugasan<>'menunggu_verifikasi' THEN
    RAISE EXCEPTION 'Penugasan tidak lagi menunggu pemeriksaan.';
  END IF;

  UPDATE public.progres_lahan
  SET status=p_status,
      catatan_admin=nullif(v_catatan,''),
      diperiksa_oleh=auth.uid(),
      diperiksa_at=now(),
      updated_at=now()
  WHERE id=p_progres_id;

  UPDATE public.penugasan_lahan
  SET status=p_status,
      catatan_admin=nullif(v_catatan,''),
      diverifikasi_oleh=auth.uid(),
      diverifikasi_at=now()
  WHERE id=v_penugasan_id;

  RETURN jsonb_build_object(
    'progres_id',p_progres_id,
    'penugasan_id',v_penugasan_id,
    'status',p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_periksa_progres_lahan(bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_periksa_progres_lahan(bigint,text,text) TO authenticated;
