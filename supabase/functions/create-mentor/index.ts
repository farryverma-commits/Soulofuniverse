import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_PUBLISHABLE_KEYS = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (!SUPABASE_URL) {
    return new Response("Missing SUPABASE_URL", { status: 500 });
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

    // Check if user is admin
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

    const { full_name, email, password, dob } = await req.json();

    if (!full_name || !email || !password) {
      return new Response(
        JSON.stringify({
          error: "full_name, email, and password are required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Create the user via Admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role: "mentor",
          dob: dob || null,
        },
      });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // The handle_new_user trigger creates the profile, but set status to approved
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ status: "approved" })
      .eq("id", newUser.user.id);

    // Also create an approval request with approved status for audit trail
    const { error: requestError } = await supabaseAdmin
      .from("user_approval_requests")
      .insert({
        user_id: newUser.user.id,
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        notes: "Mentor account created by admin",
      });

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          full_name,
          role: "mentor",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error in create-mentor:", error);
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
