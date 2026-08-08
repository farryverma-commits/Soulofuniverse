import { createClient } from "npm:@supabase/supabase-js";
import {
  WebhookReceiver,
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

  // The platform provides JSON maps keyed by your configured key names.
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
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      SUPABASE_URL,
      secretKey,
    );

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") ?? "";

    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit configuration missing");
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);

    const body = await req.text();
    const event = await receiver.receive(body, authHeader);

    // Handle egress events
    const egressEventTypes = [
      "egress_started",
      "egress_updated",
      "egress_completed",
      "egress_failed",
      "egress_ended",
    ];

    if (egressEventTypes.includes(event.event)) {
      const egressInfo = (event as any).egressInfo ||
        (event as any).egress_info;
      const egressId = egressInfo?.egressId || egressInfo?.egress_id;

      console.log(
        `Webhook egress event: ${event.event}, egress_id: ${egressId}`,
      );

      if (egressId) {
        const updateData: Record<string, any> = {};

        switch (event.event) {
          case "egress_started":
            updateData.status = "recording";
            break;

          // case "egress_completed": {
          //   updateData.status = "completed";
          //   updateData.completed_at = new Date().toISOString();

          //   const recordingBaseUrl = Deno.env.get("RECORDING_BASE_URL") ?? "";

          //   // Extract file info from egress results
          //   const fileResults = egressInfo?.fileResults ||
          //     egressInfo?.file_results;
          //   if (fileResults && fileResults.length > 0) {
          //     const fileResult = fileResults[0];
          //     const filePath = fileResult?.filePath || fileResult?.file_path ||
          //       fileResult?.location;
          //     if (filePath) {
          //       updateData.file_path = filePath;
          //       if (recordingBaseUrl) {
          //         const relativePath = filePath.replace(/^\/?recordings\//, "");
          //         updateData.file_url = `${recordingBaseUrl}/${relativePath}`;
          //       }
          //     }
          //     const fileSize = fileResult?.size || fileResult?.fileSize;
          //     if (fileSize) updateData.file_size = fileSize;
          //   }

          //   const duration = egressInfo?.duration || egressInfo?.durationSecs;
          //   if (duration) updateData.duration_secs = duration;
          //   break;
          // }

          // case "egress_failed":
          //   updateData.status = "failed";
          //   updateData.error_message = egressInfo?.error || "Egress failed";
          //   updateData.completed_at = new Date().toISOString();
          //   break;

          case "egress_ended":
            // Only set uploading if currently recording (not already completed/failed)
            updateData.status = "uploading";
            break;
        }

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabaseClient
            .from("session_recordings")
            .update(updateData)
            .eq("egress_id", egressId);

          if (error) {
            console.error("Error updating session_recording:", error);
          } else {
            console.log(
              `Updated recording egress=${egressId}: ${
                JSON.stringify(updateData)
              }`,
            );
          }
        }
      }

      return new Response("ok", { status: 200 });
    }

    // Handle room events (existing logic)
    const sessionId = event.room?.name?.replace("session_", "");

    if (sessionId) {
      const { error } = await supabaseClient
        .from("meeting_logs")
        .insert({
          session_id: sessionId,
          event_type: event.event,
          payload: event,
        });

      if (error) console.error("Error logging event:", error);

      if (event.event === "room_finished") {
        await supabaseClient
          .from("group_sessions")
          .update({ status: "completed" })
          .eq("id", sessionId);
      }

      // Detect when the session host leaves a live session unexpectedly.
      // Catches drops even when the client-side log can't fire (browser crash,
      // tab close, device sleep). Only triggers for live sessions — intentional
      // session-end already sets status to "completed" before the host leaves.
      if (event.event === "participant_left") {
        const leftIdentity = event.participant?.identity;
        if (leftIdentity) {
          const { data: session } = await supabaseClient
            .from("group_sessions")
            .select("mentor_id, status")
            .eq("id", sessionId)
            .single();

          if (
            session?.mentor_id === leftIdentity &&
            session?.status === "live"
          ) {
            const leaveReason = (event.participant as any)?.reason || "unknown";
            const remaining = event.room?.numParticipants || 0;
            console.warn(
              `[webhook] HOST left live session ${sessionId}: ` +
              `reason=${leaveReason}, remaining=${remaining}`,
            );

            await supabaseClient.from("meeting_logs").insert({
              session_id: sessionId,
              event_type: "host_left_room",
              payload: {
                user_id: leftIdentity,
                reason: leaveReason,
                remaining_participants: remaining,
                detected_by: "webhook",
              },
            });

            // Clean up orphaned sessions. If the host was the last participant
            // (room now empty), end the session so it doesn't stay live forever
            // after a crash. If participants remain, do NOT end — the host's
            // client auto-reconnect brings them back and participants keep
            // seeing the "Host Reconnecting" tile. numParticipants at
            // participant_left time may still count the leaver, so treat <=1
            // as effectively empty.
            if (remaining <= 1 && livekitUrl) {
              try {
                const roomService = new RoomServiceClient(
                  livekitUrl,
                  apiKey,
                  apiSecret,
                );
                await roomService.deleteRoom(`session_${sessionId}`);
              } catch (delErr) {
                console.error("Failed to delete orphaned room:", delErr);
              }
              await supabaseClient
                .from("group_sessions")
                .update({ status: "completed" })
                .eq("id", sessionId)
                .eq("status", "live");
              await supabaseClient
                .from("session_participants")
                .update({ status: "rejected" })
                .eq("session_id", sessionId)
                .eq("status", "pending");
              await supabaseClient.from("meeting_logs").insert({
                session_id: sessionId,
                event_type: "session_auto_ended_host_gone",
                payload: { user_id: leftIdentity, detected_by: "webhook" },
              });
            }
          }
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    // console.error("Webhook error:", error.message);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
      },
    );
  }
});
