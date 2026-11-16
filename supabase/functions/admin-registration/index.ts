import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sesi login diperlukan." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sesi login tidak valid." }, 401);

    const adminClient = createClient(url, serviceKey);
    const { data: caller, error: callerError } = await adminClient
      .from("profiles").select("role,admin_level").eq("id", authData.user.id).maybeSingle();
    if (callerError || caller?.role !== "admin" || caller?.admin_level !== "utama") {
      return json({ error: "Hanya Admin Utama yang boleh memverifikasi pendaftaran admin." }, 403);
    }

    const body = await req.json();
    if (body.action === "list") {
      const { data, error } = await adminClient.from("admin_applications")
        .select("id,auth_user_id,nama,email,status,created_at")
        .eq("status", "menunggu").order("created_at", { ascending: true });
      if (error) throw error;
      return json({ success: true, applications: data || [] });
    }

    if (!["approve", "reject"].includes(body.action) || typeof body.applicationId !== "string") {
      return json({ error: "Permintaan tidak valid." }, 400);
    }
    const { data: application, error: appError } = await adminClient
      .from("admin_applications").select("*").eq("id", body.applicationId)
      .eq("status", "menunggu").maybeSingle();
    if (appError) throw appError;
    if (!application) return json({ error: "Pendaftaran tidak ditemukan atau sudah diproses." }, 404);

    if (body.action === "approve") {
      const { error: profileError } = await adminClient.from("profiles").insert({
        id: application.auth_user_id,
        nama: application.nama,
        username: "akun_" + application.auth_user_id.replaceAll("-", ""),
        role: "admin",
        admin_level: "kedua",
        pegawai_id: null,
      });
      if (profileError) throw profileError;
    }
    const { error: updateError } = await adminClient.from("admin_applications").update({
      status: body.action === "approve" ? "disetujui" : "ditolak",
      reviewed_at: new Date().toISOString(),
      reviewed_by: authData.user.id,
      alasan_penolakan: body.action === "reject" ? String(body.reason || "Tidak disetujui Admin Utama").slice(0, 500) : null,
    }).eq("id", application.id).eq("status", "menunggu");
    if (updateError) throw updateError;
    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Terjadi kesalahan server." }, 400);
  }
});
