import { createClient } from "npm:@supabase/supabase-js";
import { AccessToken } from "npm:livekit-server-sdk@2.1.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("livekit-get-token request received");

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

    const { session_id } = await req.json();
    if (!session_id) throw new Error("Session ID is required");

    // 1. Fetch meeting details (use admin to bypass RLS)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("group_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) throw new Error("Session not found");
    if (session.status !== "live") {
      throw new Response(JSON.stringify({ error: "Meeting is not live yet" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch user role for admin bypass
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) throw new Error("Profile not found");

    const isAdmin = profile.role === "admin";
    const isHost = session.mentor_id === user.id;
    const isTrustedUser = isAdmin || profile.role === "mentor";

    // 3. If not a trusted user (host/mentor/admin), check if approved (if required)
    if (!isTrustedUser && session.require_approval) {
      const { data: participant, error: partError } = await supabaseAdmin
        .from("session_participants")
        .select("status")
        .eq("session_id", session_id)
        .eq("user_id", user.id)
        .single();

      if (partError || participant?.status !== "approved") {
        throw new Error("Approval required to join this meeting");
      }
    }

    // 4. Generate LiveKit token
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      throw new Error("LiveKit configuration missing");
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: profile.full_name ?? user.email,
    });

    at.addGrant({
      roomJoin: true,
      room: `session_${session_id}`,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: isHost || isAdmin,
      canUpdateOwnMetadata: true,
      roomRecord: isHost ?? false,
    });

    const participantToken = await at.toJwt();

    // Log participant join
    await supabaseAdmin.from("meeting_logs").insert({
      session_id,
      event_type: (isHost || isAdmin) ? "host_joined" : "participant_joined",
      payload: { user_id: user.id, full_name: profile?.full_name },
    });

    return new Response(
      JSON.stringify({
        server_url: livekitUrl,
        participant_token: participantToken,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error in livekit-get-token:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof Response ? error.status : 400,
      },
    );
  }
});
