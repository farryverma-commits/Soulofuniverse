import { createClient } from "npm:@supabase/supabase-js";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.1.2";

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
  const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (!SUPABASE_URL) {
    return new Response("Missing SUPABASE_URL", { status: 500 });
  }
  if (!SUPABASE_SECRET_KEYS) {
    return new Response(
      "Missing SUPABASE_SECRET_KEYS",
      { status: 500 },
    );
  }

  const secretKeys = JSON.parse(SUPABASE_SECRET_KEYS);
  const secretKey = secretKeys?.default;

  if (!secretKey) {
    return new Response(
      "Key name 'default' not found in SUPABASE_SECRET_KEYS",
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

    const supabaseAdmin = createClient(SUPABASE_URL, secretKey);
    const { data: { user }, error: authError } = await supabaseAdmin.auth
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
      // Return (not throw) so the client receives the real JSON body + 403 —
      // throwing a Response object landed in the catch below as
      // {"error":"[object Response]"}, which broke the client's
      // "session ended while dropped" detection and caused infinite rejoin loops.
      return new Response(
        JSON.stringify({ error: "Meeting is not live yet" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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

    // 4. Remove stale participant from LiveKit room if reconnecting
    // Prevents "could not restart participant" error (LiveKit Issues #3456/#3475).
    // When a participant disconnects abruptly, the LiveKit server retains a stale
    // participant state for the departure_timeout period. Reconnection attempts
    // with the same identity during this window are rejected.
    //
    // Safety: checkSessionAndJoin() only runs on initial page load or Supabase
    // realtime events — the participant's previous WebSocket is already dead.
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      throw new Error("LiveKit configuration missing");
    }

    try {
      const roomService = new RoomServiceClient(
        livekitUrl,
        apiKey,
        apiSecret,
      );
      const roomName = `session_${session_id}`;
      const participants = await roomService.listParticipants(roomName);
      const existing = participants.find((p) => p.identity === user.id);

      if (existing) {
        console.log(
          `[livekit-get-token] Removing stale participant: ` +
          `identity=${user.id}, sid=${existing.sid}, room=${roomName}`
        );
        await roomService.removeParticipant(roomName, user.id);

        await supabaseAdmin.from("meeting_logs").insert({
          session_id,
          event_type: "stale_participant_cleaned",
          payload: {
            user_id: user.id,
            participant_sid: existing.sid,
            state: existing.state,
            full_name: profile?.full_name,
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("not found") && !msg.includes("does not exist")) {
        console.warn(`[livekit-get-token] Stale check (non-fatal): ${msg}`);
      }
    }

    // 5. Generate LiveKit token
    // ttl: generous so long sessions don't drop on silent server-default token
    // expiry (there is no in-app token refresh path). 6h covers any single session.
    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: profile.full_name ?? user.email,
      ttl: "6h",
      attributes: { role: profile.role },
    });

    at.addGrant({
      roomJoin: true,
      room: `session_${session_id}`,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: isHost || isAdmin,
      canUpdateOwnMetadata: true,
      roomRecord: isHost || isAdmin,
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
        status: 400,
      },
    );
  }
});
