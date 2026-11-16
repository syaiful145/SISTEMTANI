-- AgriCore: kunci perubahan progres melalui RPC tervalidasi.
-- Pegawai mengirim/resubmit progres melalui pegawai_kirim_progres_lahan().
-- Admin memeriksa progres melalui admin_periksa_progres_lahan().
-- Kedua RPC SECURITY DEFINER tersebut memvalidasi identitas dan status,
-- sehingga klien tidak perlu hak INSERT/UPDATE langsung pada tabel progres.

DROP POLICY IF EXISTS progres_lahan_pegawai_insert_own ON public.progres_lahan;
DROP POLICY IF EXISTS progres_lahan_pegawai_update_own ON public.progres_lahan;

-- SELECT tetap mengikuti kebijakan RLS yang sudah ada.
-- Mutasi hanya melalui RPC SECURITY DEFINER yang tervalidasi.
REVOKE INSERT, UPDATE ON TABLE public.progres_lahan FROM authenticated;

-- Pastikan fungsi resmi tetap dapat dipanggil oleh pengguna yang sudah login.
REVOKE ALL ON FUNCTION public.pegawai_kirim_progres_lahan(bigint,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pegawai_kirim_progres_lahan(bigint,date,text,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_periksa_progres_lahan(bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_periksa_progres_lahan(bigint,text,text) TO authenticated;
