import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Load env vars inside the handler so the function can boot even if secrets
  // are temporarily missing (prevents BOOT_ERROR).
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const DEFAULT_PASSWORD = Deno.env.get("DEFAULT_RESET_PASSWORD");
  const SUPABASE_PUBLISHABLE_KEYS = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (!SUPABASE_URL) {
    return new Response("Missing SUPABASE_URL", { status: 500 });
  }
  if (!DEFAULT_PASSWORD) {
    return new Response("Missing DEFAULT_RESET_PASSWORD", { status: 500 });
  }
  if (!SUPABASE_PUBLISHABLE_KEYS || !SUPABASE_SECRET_KEYS) {
    return new Response(
      "Missing SUPABASE_PUBLISHABLE_KEYS or SUPABASE_SECRET_KEYS",
      { status: 500 },
    );
  }

  // The platform provides JSON maps keyed by your configured key names.
  const publishableKeys = JSON.parse(SUPABASE_PUBLISHABLE_KEYS);
  const secretKeys = JSON.parse(SUPABASE_SECRET_KEYS);

  const publishableKey = publishableKeys?.default;
  const secretKey = secretKeys?.default;

  if (!publishableKey || !secretKey) {
    return new Response(
      "Key name 'default' not found in SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS",
      { status: 500 },
    );
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No Authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseClient = createClient(SUPABASE_URL, publishableKey);
    const supabaseAdmin = createClient(SUPABASE_URL, secretKey);

    const { data: { user }, error: authError } = await supabaseClient.auth
      .getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const body = await req.json().catch(() => ({}));
    const { target_user_id } = body;

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin
      .updateUserById(
        target_user_id,
        { password: DEFAULT_PASSWORD },
      );

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
