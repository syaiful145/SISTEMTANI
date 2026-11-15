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

    const { data, error } = await adminClient.rpc("admin_force_delete", { p_table: table, p_id: id });
    if (error) throw error;
    if (table === "pegawai" && data?.auth_user_id) {
      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(data.auth_user_id);
      if (authDeleteError) throw new Error("Riwayat pegawai sudah dihapus, tetapi akun login gagal dihapus: " + authDeleteError.message);
    }
    return respond({ success: true });
  } catch (error) {
    return respond({ success: false, error: error instanceof Error ? error.message : "Terjadi kesalahan." }, 400);
  }
});
