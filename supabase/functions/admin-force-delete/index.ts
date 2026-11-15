import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "Method not allowed." }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Sesi Admin tidak ditemukan.");
    const url = Deno.env.get("SUPABASE_URL");
    const publishableRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !publishableRaw || !secretRaw) throw new Error("Konfigurasi bawaan Supabase belum lengkap.");
    const publishableKeys = JSON.parse(publishableRaw);
    const secretKeys = JSON.parse(secretRaw);
    const anonKey = publishableKeys.default;
    const serviceKey = secretKeys.default;
    if (!anonKey || !serviceKey) throw new Error("API key default Supabase tidak ditemukan.");

    const token = authHeader.slice(7);
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Sesi tidak valid. Silakan login ulang.");

    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller, error: callerError } = await adminClient.from("profiles").select("role,admin_level").eq("id", authData.user.id).maybeSingle();
    if (callerError) throw callerError;
    if (caller?.role !== "admin" || caller.admin_level !== "utama") return respond({ success: false, error: "Hanya Admin Utama yang boleh menghapus data secara paksa." }, 403);

    const body = await req.json();
    const table = String(body?.table || "");
    const id = Number(body?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID data tidak valid.");
    const allowed = ["pegawai","barang","lahan","tanaman","penanaman","panen","laporan","transaksi","absensi","izin_pegawai"];
    if (!allowed.includes(table)) throw new Error("Jenis data tidak diizinkan.");

    const bodyFiles = Array.isArray(body?.files) ? body.files : [];
    const files: { bucket: string; path: string }[] = bodyFiles
      .filter((f: any) => f && ["laporan-bukti", "absensi-bukti", "izin-bukti"].includes(f.bucket) && typeof f.path === "string" && f.path.length > 0)
      .map((f: any) => ({ bucket: f.bucket, path: f.path }));

    // Saat menghapus pegawai, kumpulkan juga seluruh foto bukti yang terkait.
    if (table === "pegawai") {
      const [reports, attendance, leaves] = await Promise.all([
        adminClient.from("laporan").select("foto_path").eq("pegawai_id", id),
        adminClient.from("absensi").select("masuk_foto_path,pulang_foto_path").eq("pegawai_id", id),
        adminClient.from("izin_pegawai").select("foto_path").eq("pegawai_id", id),
      ]);
      if (reports.error) throw reports.error;
      if (attendance.error) throw attendance.error;
      if (leaves.error) throw leaves.error;
      for (const row of reports.data || []) if (row.foto_path) files.push({ bucket: "laporan-bukti", path: row.foto_path });
      for (const row of attendance.data || []) {
        if (row.masuk_foto_path) files.push({ bucket: "absensi-bukti", path: row.masuk_foto_path });
        if (row.pulang_foto_path) files.push({ bucket: "absensi-bukti", path: row.pulang_foto_path });
      }
      for (const row of leaves.data || []) if (row.foto_path) files.push({ bucket: "izin-bukti", path: row.foto_path });
    }

    const { data, error } = await adminClient.rpc("admin_force_delete", { p_table: table, p_id: id });
    if (error) throw error;

    // Hapus file bukti memakai service role agar tidak terhalang kebijakan Storage pegawai.
    const grouped = new Map<string, Set<string>>();
    for (const file of files) {
      if (!grouped.has(file.bucket)) grouped.set(file.bucket, new Set());
      grouped.get(file.bucket)!.add(file.path);
    }
    for (const [bucket, paths] of grouped) {
      const { error: storageError } = await adminClient.storage.from(bucket).remove([...paths]);
      if (storageError) throw new Error("Data sudah dihapus, tetapi sebagian foto gagal dibersihkan: " + storageError.message);
    }

    if (table === "pegawai" && data?.auth_user_id) {
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(data.auth_user_id);
      if (authDeleteError) throw new Error("Riwayat pegawai sudah dihapus, tetapi akun login gagal dihapus: " + authDeleteError.message);
    }
    return respond({ success: true });
  } catch (error) {
    return respond({ success: false, error: error instanceof Error ? error.message : "Terjadi kesalahan." }, 400);
  }
});
