import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Sesi Admin tidak ditemukan.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Konfigurasi secret Edge Function belum lengkap.");

    const token = authHeader.slice("Bearer ".length);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sesi tidak valid. Silakan login ulang.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: adminProfile, error: profileError } = await adminClient
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (adminProfile?.role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Hanya Admin yang boleh mereset password." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const pegawaiId = Number(body?.pegawaiId);
    const temporaryPassword = String(body?.temporaryPassword || "");
    if (!Number.isSafeInteger(pegawaiId) || pegawaiId <= 0) throw new Error("ID pegawai tidak valid.");
    if (temporaryPassword.length < 10 || temporaryPassword.length > 72) throw new Error("Password sementara harus 10–72 karakter.");

    const { data: pegawai, error: pegawaiError } = await adminClient
      .from("pegawai").select("id,auth_user_id").eq("id", pegawaiId).maybeSingle();
    if (pegawaiError) throw pegawaiError;
    if (!pegawai?.auth_user_id) throw new Error("Akun Auth pegawai tidak ditemukan.");

    const { error: updateError } = await adminClient.auth.admin.updateUserById(pegawai.auth_user_id, {
      password: temporaryPassword,
      user_metadata: { must_change_password: true },
    });
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Terjadi kesalahan." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
