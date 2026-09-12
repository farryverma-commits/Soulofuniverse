import { createClient } from "npm:@supabase/supabase-js";
import {
  EgressClient,
  EgressInfo,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptions,
  RoomServiceClient,
} from "npm:livekit-server-sdk@2.1.2";
import { authorizeTelemetry } from "./telemetry_auth.ts";

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

    const { session_id, action, egress_id, payload } = await req.json();
    if (!session_id || !action) {
      throw new Error("Session ID and action are required");
    }

    // log_disconnect / log_event: any authenticated participant can report their
    // own disconnect/lifecycle telemetry. These run BEFORE the session ownership
    // check so all participants (not just the host) can report drops.
    //
    // Identity is derived from the authenticated user, never from the request
    // payload: the payload's user_id/is_host are client-controlled and could be
    // forged (e.g. is_host: true to fake host-drop telemetry, or write logs for
    // arbitrary sessions). Reject callers who are neither the host, a trusted
    // mentor/admin, nor a participant of the session.
    if (action === "log_disconnect" || action === "log_event") {
      const { data: telemetrySession } = await supabaseAdmin
        .from("group_sessions")
        .select("mentor_id")
        .eq("id", session_id)
        .single();

      if (!telemetrySession) {
        throw new Error("Session not found");
      }

      // Trusted mentors/admins may join sessions without a session_participants
      // row, so they must be allowed to report too — but only once their
      // account has platform approval (approve_user()).
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();

      const { data: participantRow } = await supabaseAdmin
        .from("session_participants")
        .select("user_id, status")
        .eq("session_id", session_id)
        .eq("user_id", user.id)
        .maybeSingle();

      const authResult = authorizeTelemetry({
        hostUserId: telemetrySession.mentor_id,
        callerUserId: user.id,
        callerProfile,
        participantRow: participantRow
          ? {
              participantUserId: participantRow.user_id,
              status: participantRow.status,
            }
          : null,
      });

      if (!authResult.allowed) {
        return new Response(
          JSON.stringify({ error: authResult.reason }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 403,
          },
        );
      }

      const callerIsHost = authResult.callerIsHost;

      const { reason, connection_type, user_agent, disconnected_at, event_type } =
        payload || {};

      const logPayload: Record<string, unknown> = {
        user_id: user.id,
        is_host: callerIsHost,
      };

      // Validate and bound every client-supplied field. The whitelist bounds
      // keys, but unbounded string values could still bloat the jsonb payload.
      const str = (v: unknown, max: number) =>
        typeof v === "string" && v.length <= max ? v : undefined;
      const num = (v: unknown) => (typeof v === "number" ? v : undefined);

      const reasonVal = str(reason, 200);
      const connectionTypeVal = str(connection_type, 50);
      const userAgentVal = str(user_agent, 200);
      const disconnectedAtVal = str(disconnected_at, 64);
      if (reasonVal !== undefined) logPayload.reason = reasonVal;
      if (connectionTypeVal !== undefined) {
        logPayload.connection_type = connectionTypeVal;
      }
      if (userAgentVal !== undefined) logPayload.user_agent = userAgentVal;
      if (disconnectedAtVal !== undefined) {
        logPayload.disconnected_at = disconnectedAtVal;
      }

      if (action === "log_event") {
        // Only documented client telemetry event types may be written — never
        // server-owned lifecycle names like session_ended / recording_started.
        const { attempt, from_state, logged_at } = payload || {};
        const attemptVal = num(attempt);
        const fromStateVal = str(from_state, 100);
        const loggedAtVal = str(logged_at, 64);

        if (attemptVal !== undefined) logPayload.attempt = attemptVal;
        if (fromStateVal !== undefined) logPayload.from_state = fromStateVal;
        if (loggedAtVal !== undefined) logPayload.logged_at = loggedAtVal;
      }

      const CLIENT_EVENT_TYPES = [
        "host_rejoin_attempt",
        "host_rejoined",
        "host_reconnected",
        "generic_event",
      ];
      const resolvedEventType =
        action === "log_disconnect"
          ? callerIsHost
            ? "host_disconnected_unexpectedly"
            : "participant_disconnected_unexpectedly"
          : CLIENT_EVENT_TYPES.includes(event_type)
            ? event_type
            : "generic_event";

      const { error: logError } = await supabaseAdmin
        .from("meeting_logs")
        .insert({
          session_id,
          event_type: resolvedEventType,
          payload: logPayload,
        });

      if (logError) {
        console.error("Failed to record meeting log:", logError);
      }

      if (callerIsHost) {
        console.warn(
          `[meeting] HOST ${action}: session=${session_id}, reason=${reason}`,
        );
      }

      return new Response(JSON.stringify({ success: !logError }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      // VC server readiness gate — never mark a session live if LiveKit is
      // unreachable. Env-unset deployments skip the gate (same convention as
      // the room-deletion gating in "end").
      if (livekitUrl && livekitApiKey && livekitApiSecret) {
        try {
          const roomService = new RoomServiceClient(
            livekitUrl,
            livekitApiKey,
            livekitApiSecret,
          );
          await Promise.race([
            roomService.listRooms(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("VC readiness check timed out")),
                5000,
              ),
            ),
          ]);
        } catch (err) {
          console.error("VC server not ready for session start:", err);
          return new Response(
            JSON.stringify({ error: "VC_SERVER_NOT_READY" }),
            {
              status: 503,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

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
          await roomService.deleteRoom(`session_${session_id}`);
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

        // Minimal-size recording for this session format: the mentor is the
        // only video publisher (students join audio-only), so the composite
        // always shows the mentor while student questions are mixed into the
        // audio track. 720p30 @ 1 Mbps video + 64 kbps OPUS ≈ 0.47 GB/h
        // (the default preset H264_720P_30 records 3000k+128k ≈ 1.4 GB/h).
        // With `advanced`, unset fields fall back to 1080p/4500k — set
        // width/height/framerate/bitrates explicitly. Codec fields omitted:
        // egress defaults are OPUS / H264_MAIN.
        const result = await egressClient.startRoomCompositeEgress(
          `session_${session_id}`,
          new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: filePath,
          }),
          {
            layout: "single-speaker",
            advanced: new EncodingOptions({
              width: 1280,
              height: 720,
              framerate: 30,
              videoBitrate: 1000,
              audioBitrate: 64,
            }),
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
