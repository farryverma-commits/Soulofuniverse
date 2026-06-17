import { createClient } from "npm:@supabase/supabase-js";
import {
  EgressClient,
  EgressInfo,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
} from "npm:livekit-server-sdk@2.1.2";

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

    const { session_id, action, egress_id } = await req.json();
    if (!session_id || !action) {
      throw new Error("Session ID and action are required");
    }

    const { data: session, error: fetchError } = await supabaseAdmin
      .from("group_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (fetchError || !session) {
      console.error("Session fetch error:", fetchError);
      throw new Error("Session not found or access denied");
    }

    // Allow admin to manage any session
    if (session.mentor_id !== user.id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        throw new Error("Session not found or access denied");
      }
    }

    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY") ?? "";
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
    const recordingBaseUrl = Deno.env.get("RECORDING_BASE_URL") ?? "";

    if (action === "start") {
      await supabaseAdmin
        .from("group_sessions")
        .update({ status: "live" })
        .eq("id", session_id);

      await supabaseAdmin.from("meeting_logs").insert({
        session_id,
        event_type: "session_started",
        payload: { user_id: user.id },
      });

      console.log("Session started:", session_id);
    } else if (action === "end") {
      // Auto-stop any active recording before deleting room
      if (livekitUrl && livekitApiKey && livekitApiSecret) {
        try {
          const egressClient = new EgressClient(
            livekitUrl,
            livekitApiKey,
            livekitApiSecret,
          );
          const { data: activeRecordings } = await supabaseAdmin
            .from("session_recordings")
            .select("egress_id")
            .eq("session_id", session_id)
            .in("status", ["starting", "recording"]);

          if (activeRecordings && activeRecordings.length > 0) {
            for (const rec of activeRecordings) {
              try {
                await egressClient.stopEgress(rec.egress_id);
                await supabaseAdmin
                  .from("session_recordings")
                  .update({ status: "uploading" })
                  .eq("egress_id", rec.egress_id);
                console.log(
                  `Auto-stopped recording ${rec.egress_id} for session ${session_id}`,
                );
              } catch (stopErr) {
                console.error(
                  `Failed to stop recording ${rec.egress_id}:`,
                  stopErr,
                );
              }
            }
          }
        } catch (err) {
          console.error("Failed to create EgressClient for auto-stop:", err);
        }
      }

      // Delete the LiveKit room to kick all participants out
      if (livekitUrl && livekitApiKey && livekitApiSecret) {
        try {
          const roomService = new RoomServiceClient(
            livekitUrl,
            livekitApiKey,
            livekitApiSecret,
          );
          await roomService.deleteRoom(session_id);
          console.log(`Deleted LiveKit room for session ${session_id}`);
        } catch (err) {
          console.error(`Failed to delete LiveKit room ${session_id}:`, err);
        }
      }

      await supabaseAdmin
        .from("group_sessions")
        .update({ status: "completed" })
        .eq("id", session_id);

      // Cleanup pending participants — mark as rejected so they don't wait forever
      await supabaseAdmin
        .from("session_participants")
        .update({ status: "rejected" })
        .eq("session_id", session_id)
        .eq("status", "pending");

      await supabaseAdmin.from("meeting_logs").insert({
        session_id,
        event_type: "session_ended",
        payload: { user_id: user.id },
      });

      console.log("Session ended:", session_id);
    } else if (action === "start_recording") {
      if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
        throw new Error("LiveKit configuration missing");
      }

      if (session.status !== "live") {
        throw new Error("Session must be live to start recording");
      }

      // Check for existing active recording
      const { data: existingRecording } = await supabaseAdmin
        .from("session_recordings")
        .select("egress_id, status")
        .eq("session_id", session_id)
        .in("status", ["starting", "recording"])
        .single();

      if (existingRecording) {
        return new Response(
          JSON.stringify({
            success: true,
            egress_id: existingRecording.egress_id,
            message: "Recording already active",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Create session_recording row
      const { data: recording, error: recError } = await supabaseAdmin
        .from("session_recordings")
        .insert({
          session_id,
          status: "starting",
        })
        .select()
        .single();

      if (recError || !recording) {
        console.error("Failed to create recording row:", recError);
        throw new Error("Failed to initialize recording");
      }

      const filePath = `/out/${session_id}/${recording.id}.mp4`;

      try {
        const egressClient = new EgressClient(
          livekitUrl,
          livekitApiKey,
          livekitApiSecret,
        );

        const result = await egressClient.startRoomCompositeEgress(
          session_id,
          new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: filePath,
          }),
          {
            layout: "single-speaker",
          },
        );
        // console.log(`Egress client: ${egressClient}, Result: ${result}`)
        const egressInfo = result as EgressInfo;
        const newEgressId = egressInfo?.egressId;

        if (!newEgressId) {
          throw new Error("No egress ID returned from LiveKit");
        }

        // Update recording with egress_id and file path
        await supabaseAdmin
          .from("session_recordings")
          .update({
            egress_id: newEgressId,
            file_path: filePath,
            file_url: recordingBaseUrl
              ? `${recordingBaseUrl}/${session_id}/${recording.id}.mp4`
              : null,
            status: "recording",
          })
          .eq("id", recording.id);

        await supabaseAdmin.from("meeting_logs").insert({
          session_id,
          event_type: "recording_started",
          payload: {
            user_id: user.id,
            egress_id: newEgressId,
            file_path: filePath,
          },
        });

        console.log(
          `Recording started: egress=${newEgressId}, path=${filePath}`,
        );

        return new Response(
          JSON.stringify({
            success: true,
            egress_id: newEgressId,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } catch (egressErr) {
        console.error("Failed to start egress:", egressErr);
        await supabaseAdmin
          .from("session_recordings")
          .update({
            status: "failed",
            error_message: egressErr instanceof Error
              ? egressErr.message
              : "Failed to start egress",
          })
          .eq("id", recording.id);
        throw new Error(
          `Failed to start recording: ${
            egressErr instanceof Error ? egressErr.message : String(egressErr)
          }`,
        );
      }
    } else if (action === "stop_recording") {
      if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
        throw new Error("LiveKit configuration missing");
      }

      if (!egress_id) {
        throw new Error("egress_id is required for stop_recording");
      }

      const egressClient = new EgressClient(
        livekitUrl,
        livekitApiKey,
        livekitApiSecret,
      );

      try {
        await egressClient.stopEgress(egress_id);
      } catch (stopErr) {
        console.error(`Failed to stop egress ${egress_id}:`, stopErr);
      }

      await supabaseAdmin
        .from("session_recordings")
        .update({ status: "uploading" })
        .eq("egress_id", egress_id);

      await supabaseAdmin.from("meeting_logs").insert({
        session_id,
        event_type: "recording_stopped",
        payload: { user_id: user.id, egress_id },
      });

      console.log(`Recording stopped: egress=${egress_id}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in livekit-manage-session:", error);
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
