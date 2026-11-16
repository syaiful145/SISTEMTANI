-- AgriCore: kunci mutasi progres melalui RPC tervalidasi.
-- Aman dijalankan ulang: DROP POLICY IF EXISTS dan REVOKE bersifat idempoten.
-- Pegawai mengirim/resubmit melalui pegawai_kirim_progres_lahan().
-- Admin memeriksa melalui admin_periksa_progres_lahan().
-- SELECT dan kebijakan baca yang ada tetap dipertahankan.

DROP POLICY IF EXISTS progres_lahan_pegawai_insert_own
  ON public.progres_lahan;
DROP POLICY IF EXISTS progres_lahan_pegawai_update_own
  ON public.progres_lahan;

-- Cabut mutasi langsung dari semua role klien; RPC SECURITY DEFINER
-- yang memvalidasi identitas dan status tetap menjadi jalur penulisan.
REVOKE INSERT, UPDATE ON TABLE public.progres_lahan
  FROM PUBLIC, anon, authenticated;

-- Pastikan fungsi resmi dapat dipanggil oleh pengguna yang sudah login.
REVOKE ALL ON FUNCTION
  public.pegawai_kirim_progres_lahan(bigint,date,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.pegawai_kirim_progres_lahan(bigint,date,text,text,text)
  TO authenticated;

REVOKE ALL ON FUNCTION
  public.admin_periksa_progres_lahan(bigint,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.admin_periksa_progres_lahan(bigint,text,text)
  TO authenticated;
