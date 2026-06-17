import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_PUBLISHABLE_KEYS = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");

  if (!SUPABASE_URL) {
    return new Response("Missing SUPABASE_URL", { status: 500 });
  }
  if (!SUPABASE_PUBLISHABLE_KEYS) {
    return new Response(
      "Missing SUPABASE_PUBLISHABLE_KEYS",
      { status: 500 },
    );
  }

  // The platform provides JSON maps keyed by your configured key names.
  const publishableKeys = JSON.parse(SUPABASE_PUBLISHABLE_KEYS);

  const publishableKey = publishableKeys?.default;

  if (!publishableKey) {
    return new Response(
      "Key name 'default' not found in SUPABASE_PUBLISHABLE_KEYS",
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
    const { data: { user }, error: authError } = await supabaseClient.auth
      .getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { session_id, messages } = await req.json();
    if (!session_id || !messages) {
      throw new Error("Session ID and messages are required");
    }

    const chatData = messages.map((m: any) => ({
      session_id: session_id,
      sender_id: m.sender_id,
      message: m.text,
      sent_at: m.timestamp
        ? new Date(m.timestamp).toISOString()
        : new Date().toISOString(),
    }));

    const { error } = await supabaseClient
      .from("session_chats")
      .insert(chatData);

    if (error) throw error;

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
        status: 400,
      },
    );
  }
});
