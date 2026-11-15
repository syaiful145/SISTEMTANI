import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Sesi Admin tidak ditemukan.");

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Konfigurasi secret Edge Function belum lengkap.");

    const token = authHeader.slice(7);
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Sesi tidak valid. Silakan login ulang.");

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await adminClient
      .from("profiles").select("role,admin_level").eq("id", authData.user.id).maybeSingle();
    if (callerError) throw callerError;
    if (caller?.role !== "admin" || caller.admin_level !== "utama") {
      return respond({ success: false, error: "Hanya Admin Utama yang boleh mengelola Admin Kedua." }, 403);
    }

    const body = await req.json();
    const action = String(body?.action || "");
    const adminId = String(body?.adminId || "");
    if (!adminId || adminId === authData.user.id) throw new Error("ID Admin Kedua tidak valid.");

    const { data: target, error: targetError } = await adminClient
      .from("profiles").select("id,role,admin_level,nama").eq("id", adminId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.role !== "admin" || target.admin_level !== "kedua") {
      throw new Error("Akun yang dipilih bukan Admin Kedua. Admin Utama tidak dapat diubah atau dihapus.");
    }

    if (action === "reset") {
      const temporaryPassword = String(body?.temporaryPassword || "");
      if (temporaryPassword.length < 10 || temporaryPassword.length > 72) {
        throw new Error("Password sementara harus 10–72 karakter.");
      }
      const { error } = await adminClient.auth.admin.updateUserById(adminId, {
        password: temporaryPassword,
        user_metadata: { must_change_password: true },
      });
      if (error) throw error;
      return respond({ success: true, action: "reset" });
    }

    if (action === "delete") {
      const { error } = await adminClient.auth.admin.deleteUser(adminId);
      if (error) throw error;
      return respond({ success: true, action: "delete" });
    }

    throw new Error("Aksi tidak dikenal.");
  } catch (error) {
    return respond({
      success: false,
      error: error instanceof Error ? error.message : "Terjadi kesalahan.",
    }, 400);
  }
});
