import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  LayoutContextProvider,
  VideoTrack,
  useLocalParticipant,
  useParticipantInfo,
  useMediaDeviceSelect,
  useChat,
  useRoomContext,
  useTrackToggle,
  useTrackRefContext,
  useParticipants,
} from "@livekit/components-react";
import {
  Track,
  AudioPresets,
  RoomEvent,
  ConnectionState,
  ConnectionQuality,
  DisconnectReason,
} from "livekit-client";
import { useNavigate } from "react-router-dom";
//import "@livekit/components-styles";
import { supabase } from "../../services/supabaseClient";
import {
  Shield,
  LayoutGrid,
  User,
  Settings,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  ChevronUp,
  MonitorUp,
  MessageSquare,
  Users,
  LogOut,
  Maximize,
  Minimize,
  CircleDot,
  MoreVertical,
  PhoneOff,
  WifiOff,
  Wifi,
  Loader2,
} from "lucide-react";
import { OrbitalLoader } from "../OrbitalLoader";
import { ConferencingSidebar } from "./ConferencingSidebar";

interface MeetingViewProps {
  token: string;
  serverUrl: string;
  sessionId: string;
  isMentor: boolean;
  isAdmin?: boolean;
  mentorId: string;
  onDisconnected: () => void;
}

export const MeetingView: React.FC<MeetingViewProps> = ({
  token,
  serverUrl,
  sessionId,
  isMentor,
  isAdmin = false,
  mentorId,
  onDisconnected,
}) => {
  const isChromium = !!(window as any).chrome?.runtime;

  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <OrbitalLoader variant="inline" label="Establishing Connection..." />
      </div>
    );
  }

  return (
    <div className="h-screen h-[100dvh] bg-black overflow-hidden flex flex-col">
      <LiveKitRoom
        video={isMentor}
        audio={isMentor}
        token={token}
        serverUrl={serverUrl}
        onDisconnected={onDisconnected}
        connectOptions={{ autoSubscribe: true }}
        options={{
          // Keep the SDK retrying for ~80s before giving up (the default policy
          // exhausts in ~10s), so brief network blips are absorbed at the SDK
          // level and never reach the app-level auto-rejoin path.
          reconnectPolicy: {
            nextRetryDelayInMs: (context: { retryCount: number }) => {
              if (context.retryCount >= 12) return null;
              return Math.min(300 * Math.pow(2, context.retryCount), 10_000);
            },
          },
          adaptiveStream: { pixelDensity: 1 } as const,
          dynacast: isChromium,
          // Don't hard-drop the room on iOS pagehide/background (screen lock, app
          // switch, Control Center). The stale-participant cleanup in livekit-get-token
          // re-admits the mentor on return instead of permanently disconnecting them.
          disconnectOnPageLeave: false,
          // Keep local publish tracks alive across interruptions so the SDK can recover
          // the sender instead of tearing it down (Safari/iPad encoder/media-session drops).
          stopLocalTrackOnUnpublish: false,
          publishDefaults: {
            audioPreset: AudioPresets.speech,
            // false: keep the MediaStreamTrack alive when muted so unmute always
            // works (iOS Safari and some Android browsers silently deny the
            // re-acquisition via getUserMedia after an OS interruption or page
            // background). Tradeoff: the mic recording indicator stays on while
            // muted, but this is safer than a broken unmute button.
            stopMicTrackOnMute: false,
          },
        }}
        className="flex-1 flex flex-col overflow-hidden text-white"
      >
        <MyVideoConference
          sessionId={sessionId}
          isMentor={isMentor}
          isAdmin={isAdmin}
          mentorId={mentorId}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
};

function MyVideoConference({
  sessionId,
  isMentor,
  isAdmin = false,
  mentorId,
}: {
  sessionId: string;
  isMentor: boolean;
  isAdmin?: boolean;
  mentorId: string;
}) {
  const isHost = isMentor || isAdmin;
  const navigate = useNavigate();
  const [layout, setLayout] = useState<"grid" | "speaker">("speaker");

  // Dev-only logging — stripped in production builds
  const devLog = (...args: any[]) => {
    if (import.meta.env.DEV) console.log(...args);
  };
  const { localParticipant } = useLocalParticipant();
  const { metadata } = useParticipantInfo();
  const { chatMessages, send: sendChatHook } = useChat();
  const room = useRoomContext();

  // Kept in sync with the live participant so long-lived callbacks (attemptRejoin)
  // never capture the first-render undefined localParticipant.
  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"active" | "ended">(
    "active",
  );
  const [connState, setConnState] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("connected");
  const [showReconnectOverlay, setShowReconnectOverlay] = useState(false);
  const SHOW_BANNER_DURATION = 15_000;

  // True while the host's connection quality is Lost — fires within seconds of
  // an abrupt host drop, long before the server's departure_timeout removes
  // the host's participant (and their frozen camera track) from the room.
  const [mentorConnectionLost, setMentorConnectionLost] = useState(false);

  // Set when this client was disconnected because another tab/device took over
  // the identity (DUPLICATE_IDENTITY / PARTICIPANT_REMOVED). Blocks auto-rejoin
  // so two tabs can't kick each other in an endless ping-pong; the user can
  // still explicitly rejoin (which then kicks the other side).
  const [blockedRejoinReason, setBlockedRejoinReason] = useState<string | null>(
    null,
  );

  // Auto-rejoin state (host should not have to manually click "Rejoin Session").
  // Bounded exponential backoff; gives up after MAX_REJOIN_ATTEMPTS and shows a
  // manual fallback button instead of trapping the host in a reload loop.
  const rejoinAttemptRef = useRef(0);
  const MAX_REJOIN_ATTEMPTS = 5;
  const [rejoinAttempt, setRejoinAttempt] = useState(0);
  const [autoRejoinFailed, setAutoRejoinFailed] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against scheduling multiple navigate() calls from repeated end-poll
  // ticks or unmount-after-end, against an in-flight auto-rejoin completing
  // after the user already left, and for clearing the pending end timeout.
  const navigatingRef = useRef(false);
  const endPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest scheduleRejoin, used by attemptRejoin to break the
  // attemptRejoin ↔ scheduleRejoin dependency cycle.
  const scheduleRejoinRef = useRef<() => void>(() => {});
  // Only log "host_reconnected" when a real drop preceded it — the initial
  // connect also fires ConnectionStateChanged(Connected).
  const hadDisconnectRef = useRef(false);

  // Audio can only auto-resume after a user gesture (browser autoplay policy).
  // If programmatic startAudio() fails (no gesture yet, e.g. after an iOS
  // interruption or auto-rejoin), we surface a "tap to resume audio" affordance
  // that re-runs startAudio() under a real click/tap.
  const [audioResumeNeeded, setAudioResumeNeeded] = useState(false);
  const micWasEnabledRef = useRef(false);
  const cameraWasEnabledRef = useRef(false);
  // <audio> elements we re-attached manually after iOS tore down the remote
  // playback elements during an OS interruption — removed again on unmount.
  const reattachedElsRef = useRef<HTMLMediaElement[]>([]);

  // Transition from banner to overlay after 15s of reconnection
  useEffect(() => {
    if (connState === "reconnecting") {
      const timer = setTimeout(
        () => setShowReconnectOverlay(true),
        SHOW_BANNER_DURATION,
      );
      return () => clearTimeout(timer);
    } else {
      setShowReconnectOverlay(false);
    }
  }, [connState]);

  // Log unexpected disconnects for post-mortem analysis (fire-and-forget).
  // The reason comes from RoomEvent.Disconnected — DisconnectReason enum names
  // (e.g. "DUPLICATE_IDENTITY" / "ROOM_DELETED") land in meeting_logs.
  const logDisconnect = useCallback(
    async (reason?: DisconnectReason) => {
      try {
        const reasonName =
          reason != null && DisconnectReason[reason] != null
            ? DisconnectReason[reason]
            : "unknown";
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              session_id: sessionId,
              action: "log_disconnect",
              payload: {
                user_id: localParticipantRef.current?.identity,
                is_host: isHost,
                reason: reasonName,
                connection_type:
                  (navigator as any).connection?.effectiveType || "unknown",
                user_agent: navigator.userAgent.substring(0, 200),
                disconnected_at: new Date().toISOString(),
              },
            }),
          },
        );
      } catch {
        /* fire-and-forget */
      }
    },
    [sessionId, isHost, localParticipant],
  );

  // Generic DB event logger for critical reconnection lifecycle events
  // (rejoin attempts, reconnected, etc.) so production post-mortems are possible.
  const logEvent = useCallback(
    async (eventType: string, extra: Record<string, any> = {}) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              session_id: sessionId,
              action: "log_event",
              payload: {
                user_id: localParticipant?.identity,
                is_host: isHost,
                event_type: eventType,
                connection_type:
                  (navigator as any).connection?.effectiveType || "unknown",
                user_agent: navigator.userAgent.substring(0, 200),
                logged_at: new Date().toISOString(),
                ...extra,
              },
            }),
          },
        );
      } catch {
        /* fire-and-forget */
      }
    },
    [sessionId, isHost],
  );

  // Resume audio + re-assert mic/camera after an interruption/reconnect. On
  // Safari/iOS a phone call, alarm, Siri, or Control Center can suspend the
  // AudioContext, pause remote playback, and kill the local mic/camera tracks.
  // startAudio() requires a user gesture; if it rejects we surface a tap affordance.
  const resumeAudio = useCallback(async () => {
    // Remember whether mic/camera were on so we can restore them after resume.
    const lp = localParticipantRef.current;
    if (lp) {
      micWasEnabledRef.current = lp.isMicrophoneEnabled;
      cameraWasEnabledRef.current = lp.isCameraEnabled;
    }
    try {
      await room.startAudio();
      // Success (gesture present) — clear any pending affordance.
      setAudioResumeNeeded(false);
    } catch {
      // No user gesture yet (auto-rejoin / mid-interruption): show tap affordance.
      setAudioResumeNeeded(true);
    }
    // Re-assert mic/camera independently of startAudio() — a blocked playback
    // resume (no gesture yet) must not leave the host's devices silently off.
    // Only re-enables devices that were on before (students never publish
    // camera, so this is a no-op for them).
    if (micWasEnabledRef.current && lp) {
      try {
        await lp.setMicrophoneEnabled(true);
      } catch {
        /* ignore */
      }
    }
    if (cameraWasEnabledRef.current && lp) {
      try {
        await lp.setCameraEnabled(true);
      } catch {
        /* ignore — the OS may have taken the camera; the toggle still works */
      }
    }
  }, [room]);

  // Re-create remote <audio> elements if iOS tore them down instead of just
  // pausing them — startAudio() alone can't recover a destroyed element.
  // Only attaches when a subscribed audio track has NO elements left, so the
  // elements managed by <RoomAudioRenderer/> are never touched.
  const reattachRemoteAudio = useCallback(() => {
    // Prune elements that are no longer in the DOM (e.g. track unsubscribed).
    reattachedElsRef.current = reattachedElsRef.current.filter(
      (el) => el.isConnected,
    );
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        const track = pub.track;
        if (!track || track.attachedElements.length > 0) return;
        try {
          const el = track.attach();
          el.autoplay = true;
          el.setAttribute("playsinline", "true");
          el.style.display = "none";
          document.body.appendChild(el);
          reattachedElsRef.current.push(el);
        } catch {
          /* non-fatal — RoomAudioRenderer still manages its own elements */
        }
      });
    });
  }, [room]);

  // Runs under a real user click/tap — satisfies the browser autoplay policy so
  // startAudio() can actually resume remote playback and we can re-enable the mic.
  const tapToResumeAudio = useCallback(async () => {
    // Restore any audio elements iOS destroyed during the interruption first.
    reattachRemoteAudio();
    try {
      await room.startAudio();
      if (micWasEnabledRef.current && localParticipant) {
        await localParticipant.setMicrophoneEnabled(true);
      }
      setAudioResumeNeeded(false);
    } catch {
      /* still blocked — keep the affordance visible */
    }
  }, [room, localParticipant, reattachRemoteAudio]);

  // Auto-rejoin the same room with a fresh token when the SDK gives up, so the
  // host does not have to manually click "Rejoin Session". Runs with bounded
  // backoff; surfaces a manual fallback button only after MAX_REJOIN_ATTEMPTS.
  const attemptRejoin = useCallback(async () => {
    if (sessionStatus === "ended" || navigatingRef.current) return;
    if (rejoinAttemptRef.current >= MAX_REJOIN_ATTEMPTS) {
      setAutoRejoinFailed(true);
      return;
    }
    rejoinAttemptRef.current += 1;
    setRejoinAttempt(rejoinAttemptRef.current);
    logEvent("host_rejoin_attempt", { attempt: rejoinAttemptRef.current });

    try {
      let {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        // Supabase auth can expire during a long drop (device sleep in a
        // multi-hour meeting) — try one refresh before giving up this attempt.
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      if (!session) {
        // Still unauthenticated — keep the bounded backoff going so we either
        // recover or eventually surface the manual fallback, instead of
        // hanging forever on "Reconnecting automatically…".
        scheduleRejoinRef.current();
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-get-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        },
      );

      if (!response.ok) {
        // Session no longer live (ended while we were dropped) — stop retrying
        // and land on the terminal "session ended" state instead of looping
        // the manual Rejoin button forever.
        const data = await response.json().catch(() => ({}));
        if (
          response.status === 403 ||
          data?.error?.includes("not live") ||
          data?.error?.includes("not found")
        ) {
          rejoinAttemptRef.current = MAX_REJOIN_ATTEMPTS;
          setSessionStatus("ended");
          navigatingRef.current = true;
          endPollTimerRef.current = setTimeout(() => {
            room.disconnect();
            navigate("/", { replace: true });
          }, 3000);
          return;
        }
        scheduleRejoinRef.current();
        return;
      }

      const data = await response.json();
      // The user may have clicked Leave while the token fetch was in flight —
      // never reconnect a room they already walked away from.
      if (navigatingRef.current) return;
      // Reuse the existing room instance — avoids the duplicate-identity reload race.
      await room.connect(data.server_url, data.participant_token);
      logEvent("host_rejoined", { attempt: rejoinAttemptRef.current });
      resumeAudio();
    } catch {
      scheduleRejoinRef.current();
    }
  }, [room, sessionId, sessionStatus, logEvent, resumeAudio, navigate]);

  const scheduleRejoin = useCallback(() => {
    if (rejoinAttemptRef.current >= MAX_REJOIN_ATTEMPTS) {
      setAutoRejoinFailed(true);
      return;
    }
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const delay = 2000 * Math.pow(2, rejoinAttemptRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      attemptRejoin();
    }, delay);
  }, [attemptRejoin]);
  // Keep the ref in sync so attemptRejoin (which only depends on stable
  // logEvent/resumeAudio/navigate) always calls the latest scheduleRejoin.
  scheduleRejoinRef.current = scheduleRejoin;

  // Reset rejoin counters once we're connected again.
  useEffect(() => {
    if (connState === "connected") {
      rejoinAttemptRef.current = 0;
      setRejoinAttempt(0);
      setAutoRejoinFailed(false);
      setBlockedRejoinReason(null);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    }
  }, [connState]);

  // Clean up the pending auto-rejoin timer on unmount so it can't fire
  // room.connect() on a disconnected/unmounted room after the user leaves.
  // Also clears the pending end-of-session redirect timer — deliberately NOT in
  // the polling effect's cleanup, which runs on every sessionStatus change and
  // would cancel the redirect immediately after it is scheduled.
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (endPollTimerRef.current) clearTimeout(endPollTimerRef.current);
      reattachedElsRef.current.forEach((el) => el.remove());
      reattachedElsRef.current = [];
    };
  }, []);

  // Connection-state → UI state + audio recovery. Disconnect handling (logging,
  // auto-rejoin, terminal states) lives in the RoomEvent.Disconnected handler
  // below, which is the only event carrying the DisconnectReason.
  useEffect(() => {
    if (!room) return;
    const handler = (state: ConnectionState) => {
      // Map the SDK's intermediate states onto our UI union. SignalReconnecting
      // (signal-only reconnect, media still up) and Connecting must show the
      // reconnecting banner/overlay too — a raw cast would store values the
      // union excludes and render nothing while the SDK recovers.
      if (state === ConnectionState.Reconnecting) {
        setConnState("reconnecting");
      } else if (state === ConnectionState.SignalReconnecting) {
        setConnState("reconnecting");
      } else if (state === ConnectionState.Connecting) {
        setConnState("reconnecting");
      } else if (state === ConnectionState.Disconnected) {
        setConnState("disconnected");
      } else if (state === ConnectionState.Connected) {
        setConnState("connected");
      }
      if (
        (state === ConnectionState.Connected ||
          state === ConnectionState.SignalReconnecting) &&
        sessionStatus !== "ended"
      ) {
        // Reconnected (after ICE restart / full reconnect / signal resume):
        // resume audio and log the recovery for production analysis — but only
        // when a real drop preceded it (the initial join also fires Connected).
        resumeAudio();
        if (hadDisconnectRef.current) {
          hadDisconnectRef.current = false;
          logEvent("host_reconnected", { from_state: String(state) });
        }
      }
    };
    room.on(RoomEvent.ConnectionStateChanged, handler);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handler);
    };
  }, [room, sessionStatus, resumeAudio, logEvent]);

  // Disconnect handling with the real DisconnectReason. Branching by reason is
  // what keeps auto-rejoin safe: intentional leaves, duplicate identities, and
  // deleted rooms must NOT trigger the rejoin loop.
  useEffect(() => {
    if (!room) return;
    const onDisconnected = (reason?: DisconnectReason) => {
      if (sessionStatus === "ended" || navigatingRef.current) return;

      // Intentional leave (Leave/End button, room.disconnect()) — no telemetry
      // noise, no auto-rejoin.
      if (reason === DisconnectReason.CLIENT_INITIATED) return;

      hadDisconnectRef.current = true;
      logDisconnect(reason);

      // Another tab/device took over this identity (or the stale-participant
      // cleanup kicked this tab out). Auto-rejoining would kick the other side
      // back — an endless ping-pong — so block and let the user decide.
      if (
        reason === DisconnectReason.DUPLICATE_IDENTITY ||
        reason === DisconnectReason.PARTICIPANT_REMOVED
      ) {
        setBlockedRejoinReason(
          "This session was joined from another tab or device.",
        );
        return;
      }

      // Room deleted server-side (mentor ended the session, or the webhook
      // auto-ended an orphaned one) — terminal state, no rejoin.
      if (reason === DisconnectReason.ROOM_DELETED) {
        setSessionStatus("ended");
        navigatingRef.current = true;
        endPollTimerRef.current = setTimeout(() => {
          navigate("/", { replace: true });
        }, 3000);
        return;
      }

      // Network drop / server restart / unknown — the SDK already exhausted
      // its retry budget, so begin app-level auto-rejoin with backoff.
      scheduleRejoin();
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, sessionStatus, logDisconnect, scheduleRejoin, navigate]);

  // Remove the hidden <audio> elements we appended for tracks that have since
  // unsubscribed (participant left after an interruption re-attach). React-
  // managed RoomAudioRenderer elements are only detached, never removed here.
  useEffect(() => {
    if (!room) return;
    const onTrackUnsubscribed = (track: any) => {
      if (!track || track.kind !== "audio") return;
      const ours = new Set(reattachedElsRef.current);
      track.detach().forEach((el: HTMLMediaElement) => {
        if (ours.has(el)) el.remove();
      });
      reattachedElsRef.current = reattachedElsRef.current.filter(
        (el) => el.isConnected,
      );
    };
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [room]);

  // A dropped host lingers as a room participant until the server's
  // departure_timeout removes them — during that window their camera track
  // still "exists" but renders a frozen/black frame, and an identity-presence
  // check alone would keep showing it. The host's connection quality flips to
  // Lost within seconds of a drop, so drive the "Host Reconnecting" fallback
  // from that (much faster) signal instead.
  useEffect(() => {
    if (!room || !mentorId) return;
    const onQualityChanged = (quality: ConnectionQuality, participant: any) => {
      if (participant?.identity === mentorId) {
        setMentorConnectionLost(quality === ConnectionQuality.Lost);
      }
    };
    // Initial read — covers students joining while the host is already dropped.
    const mentor = room.remoteParticipants.get(mentorId);
    if (mentor) {
      setMentorConnectionLost(
        mentor.connectionQuality === ConnectionQuality.Lost,
      );
    }
    room.on(RoomEvent.ConnectionQualityChanged, onQualityChanged);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, onQualityChanged);
    };
  }, [room, mentorId]);

  // Canonical LiveKit signal for "remote audio is/isn't playing". This fires for
  // interruptions that neither background the page nor drop the WebRTC connection
  // (notification banner, Siri peek, some alarm overlays) — exactly the cases
  // where visibilitychange never fires and the host otherwise stays inaudible
  // with zero recovery prompt.
  useEffect(() => {
    if (!room) return;
    const onPlaybackChanged = (playing: boolean) => {
      if (!playing && sessionStatus !== "ended") {
        reattachRemoteAudio();
        resumeAudio();
      }
    };
    room.on(RoomEvent.AudioPlaybackStatusChanged, onPlaybackChanged);
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, onPlaybackChanged);
    };
  }, [room, sessionStatus, resumeAudio, reattachRemoteAudio]);

  // Network restored (e.g. after iOS drops WiFi/LTE during a phone call) — skip
  // the remaining backoff wait and rejoin immediately if the room is fully down.
  useEffect(() => {
    if (!room) return;
    const onOnline = () => {
      if (sessionStatus === "ended" || navigatingRef.current) return;
      if (room.state === ConnectionState.Disconnected) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        rejoinAttemptRef.current = 0;
        setRejoinAttempt(0);
        attemptRejoin();
      } else {
        resumeAudio();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [room, sessionStatus, attemptRejoin, resumeAudio]);

  // iOS/Safari audio interruption recovery: a phone call, alarm, Siri, or Control
  // Center can suspend the AudioContext and pause remote playback even though the
  // WebRTC connection stays up. Resume audio when the app becomes visible again,
  // when the OS ends the interruption, or when a bfcache restore unfreezes us.
  useEffect(() => {
    if (!room) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || sessionStatus === "ended") {
        return;
      }
      resumeAudio();
      // iOS may have suspended ICE while hidden — if the SDK already gave up,
      // kick off the app-level rejoin immediately instead of waiting.
      if (room.state === ConnectionState.Disconnected) {
        scheduleRejoin();
      }
    };
    const onAudioInterruption = (e: Event) => {
      // webkitendinterruption (Safari) / audiointerruptionend
      if (
        (e.type === "webkitendinterruption" ||
          e.type === "audiointerruptionend") &&
        sessionStatus !== "ended"
      ) {
        resumeAudio();
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // bfcache restore (iOS app-switch / back-forward) — timers and sockets may
      // have been frozen; resume audio and rejoin if the room dropped.
      if (e.persisted && sessionStatus !== "ended") {
        resumeAudio();
        if (room.state === ConnectionState.Disconnected) {
          scheduleRejoin();
        }
      }
    };
    const onFocus = () => {
      if (sessionStatus !== "ended") {
        resumeAudio();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("webkitendinterruption", onAudioInterruption);
    document.addEventListener("audiointerruptionend", onAudioInterruption);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("webkitendinterruption", onAudioInterruption);
      document.removeEventListener("audiointerruptionend", onAudioInterruption);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [room, sessionStatus, resumeAudio, scheduleRejoin]);

  // Robust chat send with fallback
  const sendChat = async (text: string) => {
    if (!localParticipant) return;
    setIsSending(true);
    try {
      await sendChatHook(text);
    } catch (err) {
      console.warn("Hook send failed, trying manual publish:", err);
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(
          JSON.stringify({
            message: text,
            timestamp: Date.now(),
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            from: {
              identity: localParticipant.identity,
              name: localParticipant.name || localParticipant.identity,
            },
          }),
        );
        await localParticipant.publishData(data, {
          reliable: true,
          topic: "lk-chat-topic",
        });
      } catch (manualErr) {
        console.error("Manual chat send failed:", manualErr);
        throw manualErr;
      }
    } finally {
      setIsSending(false);
    }
  };

  const [showSidebar, setShowSidebar] = useState(
    () => window.innerWidth > 1024,
  );
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const prevIsDesktopRef = useRef(window.innerWidth >= 768);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "participants">("chat");
  //const [isRecording, setIsRecording] = useState(false);
  //const [egressId, setEgressId] = useState<string | null>(null);
  // const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
  //   null,
  // );
  // const [recordingDuration, setRecordingDuration] = useState("00:00");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 375);
  useEffect(() => {
    const onNarrow = () => setIsNarrow(window.innerWidth < 375);
    window.addEventListener("resize", onNarrow);
    return () => window.removeEventListener("resize", onNarrow);
  }, []);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const doEndSession = async () => {
    setShowEndConfirm(false);
    navigatingRef.current = true;
    try {
      const encoder = new TextEncoder();
      await localParticipant.publishData(encoder.encode(JSON.stringify({ action: "SESSION_ENDED" })), { reliable: true });
      const currentMeta = JSON.parse(localParticipant.metadata || "{}");
      await localParticipant.setMetadata(JSON.stringify({ ...currentMeta, isSessionEnded: true }));
      setSessionStatus("ended");
      const { data: authData } = await supabase.auth.getSession();
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.session?.access_token}` },
        body: JSON.stringify({ session_id: sessionId, action: "end" }),
      }).catch((err) => console.warn("Backend cleanup failed:", err));
      setTimeout(() => { room.disconnect(); navigate("/", { replace: true }); }, 2000);
    } catch (err) {
      console.error(err);
      room.disconnect();
    }
  };
  const [unreadChat, setUnreadChat] = useState(0);
  const [lastSeenChatCount, setLastSeenChatCount] = useState(
    chatMessages.length,
  );

  // Restore recording state from DB on mount (handles page refresh mid-recording)
  // useEffect(() => {
  //   if (!isMentor) return;
  //   const restoreRecordingState = async () => {
  //     const { data } = await supabase
  //       .from("session_recordings")
  //       .select("egress_id, status, started_at")
  //       .eq("session_id", sessionId)
  //       .in("status", ["starting", "recording"])
  //       .order("created_at", { ascending: false })
  //       .limit(1)
  //       .single();

  //     if (data) {
  //       setIsRecording(true);
  //       setEgressId(data.egress_id);
  //       setRecordingStartTime(new Date(data.started_at).getTime());
  //     }
  //   };
  //   restoreRecordingState();
  // }, [sessionId, isMentor]);

  // Recording duration timer
  // useEffect(() => {
  //   if (!isRecording || !recordingStartTime) {
  //     setRecordingDuration("00:00");
  //     return;
  //   }
  //   const interval = setInterval(() => {
  //     const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  //     const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  //     const secs = String(elapsed % 60).padStart(2, "0");
  //     setRecordingDuration(`${mins}:${secs}`);
  //   }, 1000);
  //   return () => clearInterval(interval);
  // }, [isRecording, recordingStartTime]);

  // Handle window resize for mobile detection and auto-close sidebar when transitioning from desktop to mobile
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      const wasDesktop = prevIsDesktopRef.current;
      prevIsDesktopRef.current = !mobile;
      setIsMobile(mobile);
      if (wasDesktop && mobile) {
        setShowSidebar(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable full-screen mode: ${err.message}`,
        );
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Track unread chat messages — only counts messages that arrived
  // while user wasn't looking at the chat tab
  useEffect(() => {
    const unread = chatMessages.length - lastSeenChatCount;
    if (unread > 0 && (!showSidebar || sidebarTab !== "chat")) {
      setUnreadChat(unread);
    }
  }, [chatMessages.length, lastSeenChatCount, showSidebar, sidebarTab]);

  // Mark messages as seen when user opens the chat tab or when new messages
  // arrive while the chat tab is already open
  useEffect(() => {
    if (showSidebar && sidebarTab === "chat") {
      setLastSeenChatCount(chatMessages.length);
      setUnreadChat(0);
    }
  }, [showSidebar, sidebarTab, chatMessages.length]);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Combine hook metadata with local participant state for maximum reactivity
  const currentMetadata = metadata || localParticipant?.metadata;
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);

  const parsedMetadata = useMemo(() => {
    try {
      return JSON.parse(currentMetadata || "{}");
    } catch {
      return {};
    }
  }, [currentMetadata]);

  const isHandRaised = !!parsedMetadata.handRaised;

  const allParticipants = useParticipants();

  const mentorPresent = useMemo(() => {
    if (!allParticipants?.length || !mentorId) return true;
    return allParticipants.some((p) => p.identity === mentorId);
  }, [allParticipants, mentorId]);

  // Poll for session-end signal via mentor metadata (backup for data channel)
  // Runs on a timer instead of every state change to avoid 200+ JSON.parse per tick
  //TODO: change this into event driven instead of polling
  const allParticipantsRef = useRef(allParticipants);
  allParticipantsRef.current = allParticipants;

  useEffect(() => {
    if (!localParticipant) return;

    const interval = setInterval(() => {
      if (sessionStatus === "ended" || navigatingRef.current) return;
      const allP = [localParticipant, ...allParticipantsRef.current];
      const mentor = allP.find((p) => {
        try {
          const meta = JSON.parse(p.metadata || "{}");
          // Match the mentor, but NEVER the local participant's own metadata —
          // a stale isSessionEnded on the mentor's own identity must not
          // self-disconnect them (e.g. leftover from a previous End Session).
          if (p.identity === localParticipant.identity) return false;
          return meta.role === "mentor" || p.identity === mentorId;
        } catch {
          return false;
        }
      });
      if (mentor) {
        try {
          const mentorMeta = JSON.parse(mentor.metadata || "{}");
          if (mentorMeta.isSessionEnded) {
            devLog("Session end signal received from mentor metadata");
            setSessionStatus("ended");
            navigatingRef.current = true;
            endPollTimerRef.current = setTimeout(() => {
              room.disconnect();
              navigate("/", { replace: true });
            }, 3000);
          }
        } catch (e) {
          console.error("Failed to parse mentor metadata:", e);
        }
      }
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [localParticipant, mentorId, sessionStatus, room, navigate]);

  // Clear any stale isSessionEnded flag on the local participant when (re)joining.
  // LiveKit persists participant metadata by identity, so a flag left over from a
  // previous End Session (or a reused session/identity) would otherwise linger and
  // could re-trigger an end/disconnect on the next join.
  //
  // Gated to the first mount only: after that, a useLocalParticipant re-render
  // (any participant/media state change, including the metadata write itself)
  // would re-run this effect while the mentor's End Session handler is still in
  // flight — before setSessionStatus("ended") commits — and erase the very
  // isSessionEnded: true signal it just wrote. That would silently break the
  // metadata backup path for students who missed the data-channel broadcast.
  const clearedStaleEndFlagRef = useRef(false);
  useEffect(() => {
    if (!localParticipant || sessionStatus === "ended") return;
    if (clearedStaleEndFlagRef.current) return;
    clearedStaleEndFlagRef.current = true;
    (async () => {
      try {
        const meta = JSON.parse(localParticipant.metadata || "{}");
        if (meta.isSessionEnded) {
          const cleared = { ...meta, isSessionEnded: false };
          await localParticipant.setMetadata(JSON.stringify(cleared));
        }
      } catch {
        /* metadata not yet available — ignore */
      }
    })();
  }, [localParticipant, sessionStatus]);

  const toggleHand = async () => {
    if (!localParticipant) return;
    try {
      const currentMeta = JSON.parse(localParticipant.metadata || "{}");
      const newMetadata = {
        ...currentMeta,
        handRaised: !isHandRaised,
        raisedAt: !isHandRaised ? Date.now() : null,
      };
      await localParticipant.setMetadata(JSON.stringify(newMetadata));
    } catch (e) {
      console.error("Failed to toggle hand:", e);
    }
  };

  useEffect(() => {
    if (!room || !localParticipant) return;

    const onDataReceived = async (payload: Uint8Array, participant?: any) => {
      try {
        const decoder = new TextDecoder();
        const str = decoder.decode(payload);
        const data = JSON.parse(str);
        devLog("Data message received:", data);

        if (data.action === "SESSION_ENDED" && !isHost) {
          devLog("Received SESSION_ENDED signal");
          setSessionStatus("ended");
          navigatingRef.current = true;
          endPollTimerRef.current = setTimeout(() => {
            room.disconnect();
            navigate("/", { replace: true });
          }, 3000);
          return;
        }

        if (data.action === "MUTE_ALL" && !isHost) {
          devLog("Received MUTE_ALL command");
          await localParticipant.setMicrophoneEnabled(false);
        }

        if (data.target === localParticipant?.identity) {
          if (data.action === "LOWER_HAND") {
            devLog("Received LOWER_HAND command");
            const currentMeta = JSON.parse(localParticipant?.metadata || "{}");
            const newMetadata = {
              ...currentMeta,
              handRaised: false,
              raisedAt: null,
            };
            await localParticipant.setMetadata(JSON.stringify(newMetadata));
          }
          if (data.action === "MUTE_USER") {
            devLog("Received MUTE_USER command from mentor");
            await localParticipant.setMicrophoneEnabled(false);
          }
        }
      } catch (e) {
        console.error("Error processing data channel message:", e);
      }
    };

    room.on("dataReceived", onDataReceived);
    return () => {
      room.off("dataReceived", onDataReceived);
    };
  }, [room, localParticipant, isHost]);

  const handleMuteAll = async () => {
    if (!isHost || !localParticipant) return;

    try {
      // 1. Update Mentor's metadata to signal global mute
      const currentMeta = JSON.parse(localParticipant.metadata || "{}");
      await localParticipant.setMetadata(
        JSON.stringify({
          ...currentMeta,
          muteAllActive: true,
          muteAllAt: Date.now(),
        }),
      );

      // 2. Send broadcast data message for immediate effect
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ action: "MUTE_ALL" }));
      await localParticipant.publishData(data, { reliable: true });

      devLog("Global Mute All initiated via metadata and data channel");
    } catch (e) {
      console.error("Failed to initiate Mute All:", e);
    }
  };

  // const handleToggleRecording = async () => {
  //   if (!isMentor) return;
  //   const {
  //     data: { session: authSession },
  //   } = await supabase.auth.getSession();

  //   try {
  //     if (isRecording) {
  //       const res = await fetch(
  //         `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
  //         {
  //           method: "POST",
  //           headers: {
  //             "Content-Type": "application/json",
  //             Authorization: `Bearer ${authSession?.access_token}`,
  //           },
  //           body: JSON.stringify({
  //             session_id: sessionId,
  //             action: "stop_recording",
  //             egress_id: egressId,
  //           }),
  //         },
  //       );
  //       if (!res.ok) {
  //         const err = await res
  //           .json()
  //           .catch(() => ({ error: "Unknown error" }));
  //         console.error("Failed to stop recording:", err.error);
  //         return;
  //       }
  //       setIsRecording(false);
  //       setEgressId(null);
  //       setRecordingStartTime(null);
  //     } else {
  //       const res = await fetch(
  //         `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
  //         {
  //           method: "POST",
  //           headers: {
  //             "Content-Type": "application/json",
  //             Authorization: `Bearer ${authSession?.access_token}`,
  //           },
  //           body: JSON.stringify({
  //             session_id: sessionId,
  //             action: "start_recording",
  //           }),
  //         },
  //       );
  //       if (!res.ok) {
  //         const err = await res
  //           .json()
  //           .catch(() => ({ error: "Unknown error" }));
  //         console.error("Failed to start recording:", err.error);
  //         return;
  //       }
  //       const data = await res.json();
  //       setIsRecording(true);
  //       setEgressId(data.egress_id);
  //       setRecordingStartTime(Date.now());
  //     }
  //   } catch (err) {
  //     console.error("Recording toggle failed:", err);
  //   }
  // };

  // Layout Logic: Mentor always visible, active speakers alongside
  // Track filtering logic
  // 1. Identify the Mentor's camera track (Primary View)
  const mainSpeakerTrack = useMemo(() => {
    if (!tracks.length) return null;

    devLog(
      "Searching for mentor track. MentorId:",
      mentorId,
      "Tracks:",
      tracks.length,
    );

    // Find track belonging to mentorId
    const mentorTrack = tracks.find(
      (t) =>
        String(t.participant.identity) === String(mentorId) &&
        t.source === Track.Source.Camera,
    );

    if (mentorTrack) {
      devLog("Found mentor track:", mentorTrack.participant.identity);
      return mentorTrack;
    }

    // Fallback: If current user is mentor and we have local camera, use it
    if (isMentor) {
      const localCamera = tracks.find(
        (t) =>
          t.participant.identity === localParticipant?.identity &&
          t.source === Track.Source.Camera,
      );
      if (localCamera) {
        devLog("Using local mentor camera fallback");
        return localCamera;
      }
    }

    // Secondary fallback: Any camera track if no mentor track found
    // const anyCamera = tracks.find((t) => t.source === Track.Source.Camera);
    // if (anyCamera) {
    //   devLog(
    //     "Using secondary fallback camera:",
    //     anyCamera.participant.identity,
    //   );
    //   return anyCamera;
    // }

    return null;
  }, [tracks, mentorId, isMentor, localParticipant]);

  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare,
  );

  // Determine main focus: Screen Share > Mentor
  const mainTrack = screenShareTrack || mainSpeakerTrack || null;

  // All camera tracks (for mentor main view)
  const cameraTracks = useMemo(() => {
    return tracks.filter((t) => t.source === Track.Source.Camera);
  }, [tracks]);

  // Active speakers — only participants currently speaking
  const activeSpeakers = useMemo(() => {
    const localId = localParticipant?.identity;
    // Exclude local user AND mentor (already pinned in main view)
    return allParticipants.filter(
      (p) => p.identity !== localId && p.identity !== mentorId && p.isSpeaking,
    );
  }, [allParticipants, localParticipant?.identity, mentorId]);

  // Non-local participants for grid mode
  // const gridParticipants = useMemo(() => {
  //   return allParticipants;
  // }, [allParticipants]);

  // Listener count: non-local participants not currently speaking
  // const listenerCount = useMemo(() => {
  //   return allParticipants.filter((p) => !p.isLocal && !p.isSpeaking).length;
  // }, [allParticipants]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    devLog("Track Filtering Debug:", {
      mentorId,
      tracksCount: tracks.length,
      mentorTrackFound: !!mainSpeakerTrack,
      screenShareTrackFound: !!screenShareTrack,
      mainTrackParticipant: mainTrack?.participant?.identity,
      activeSpeakerCount: activeSpeakers.length,
      // listenerCount,
      allIdentities: allParticipants.map((p) => p.identity),
    });
  }, [
    mentorId,
    tracks,
    mainSpeakerTrack,
    screenShareTrack,
    mainTrack,
    activeSpeakers,
    //listenerCount,
    allParticipants,
  ]);

  return (
    <LayoutContextProvider>
      <div className="flex-1 flex overflow-hidden relative bg-[#080808]">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header/Overlay Info */}
          {/* <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20 flex items-center gap-3">
            { <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/20 flex items-center gap-2 md:gap-2.5 shadow-2xl">
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">
                Live Session
              </span>
            </div> }
            {isRecording && (
              <div className="bg-red-600/80 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-red-400/20 flex items-center gap-2 shadow-2xl">
                <CircleDot className="w-3 h-3 text-white animate-pulse" />
                <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">
                  Rec {recordingDuration}
                </span>
              </div>
            )}
          </div> */}

          {/* Reconnection banner — hidden on mobile (pill shows it), non-intrusive on desktop */}
          {connState === "reconnecting" && !showReconnectOverlay && (
            <div className="hidden md:flex absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 backdrop-blur-md text-black px-4 py-2 rounded-full items-center gap-2 shadow-lg animate-in slide-in-from-top-2 duration-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Reconnecting...</span>
            </div>
          )}

          {/* Audio resume affordance — browsers require a user gesture to start
              audio playback. After an iOS interruption / auto-rejoin where no
              gesture occurred, startAudio() rejects, so we ask the user to tap. */}
          {audioResumeNeeded && connState !== "reconnecting" && sessionStatus !== "ended" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2 duration-300">
              <WifiOff className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium">Audio paused</span>
              <button
                onClick={tapToResumeAudio}
                className="ml-1 px-3 py-1 rounded-full bg-primary text-black text-xs font-bold hover:opacity-90 active:scale-95 transition"
              >
                Tap to resume
              </button>
            </div>
          )}

          {/* Reconnection overlay — full takeover after 15s of banner (desktop only; mobile stays on pill badge) */}
          {connState === "reconnecting" && showReconnectOverlay && !isMobile && (
            <div className="absolute inset-0 bg-black/70 z-50 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-500">
              <OrbitalLoader variant="inline" />
              <p className="mt-6 text-white/80 text-lg font-medium">
                Still reconnecting...
              </p>
              <p className="mt-2 text-white/50 text-sm">
                Your connection was interrupted. Please wait.
              </p>
            </div>
          )}

          {/* Connection lost — SDK gave up after ~48s. Auto-rejoin with backoff
              (host should not have to manually click). Manual fallback only if
              auto-rejoin is exhausted or blocked by a duplicate identity. */}
          {connState === "disconnected" && sessionStatus !== "ended" && (
            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center animate-in fade-in duration-500">
              <WifiOff className="w-16 h-16 text-amber-400 mb-6" />
              <h2 className="text-white text-xl font-semibold mb-2">
                Connection Lost
              </h2>
              {blockedRejoinReason ? (
                <>
                  <p className="text-white/60 mb-8 text-center max-w-md">
                    {blockedRejoinReason}
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setBlockedRejoinReason(null);
                        setAutoRejoinFailed(false);
                        rejoinAttemptRef.current = 0;
                        setRejoinAttempt(0);
                        attemptRejoin();
                      }}
                      className="btn-primary px-6 py-3"
                    >
                      Rejoin Here Instead
                    </button>
                    <button
                      onClick={() => {
                        navigatingRef.current = true;
                        navigate("/", { replace: true });
                      }}
                      className="btn-secondary px-6 py-3"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </>
              ) : autoRejoinFailed ? (
                <>
                  <p className="text-white/60 mb-8 text-center max-w-md">
                    We couldn't reconnect automatically. Rejoin the session to
                    continue.
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setAutoRejoinFailed(false);
                        rejoinAttemptRef.current = 0;
                        setRejoinAttempt(0);
                        attemptRejoin();
                      }}
                      className="btn-primary px-6 py-3"
                    >
                      Rejoin Session
                    </button>
                    <button
                      onClick={() => {
                        navigatingRef.current = true;
                        navigate("/", { replace: true });
                      }}
                      className="btn-secondary px-6 py-3"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-white/60 mb-8 text-center max-w-md">
                    Reconnecting automatically
                    {rejoinAttempt > 0 ? ` (attempt ${rejoinAttempt})` : ""}…
                  </p>
                  <button
                    onClick={() => {
                      navigatingRef.current = true;
                      navigate("/", { replace: true });
                    }}
                    className="btn-secondary px-6 py-3"
                  >
                    Return to Dashboard
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex-1 overflow-hidden p-2 md:p-6 mb-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+5rem))] md:mb-28">
            {/* Empty room — nobody here yet */}
            {tracks.length === 0 && allParticipants.length <= 1 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <OrbitalLoader variant="inline" label="Waiting for mentor..." />
                <p className="font-bold text-lg tracking-tight mt-4">
                  Preparing your session...
                </p>
              </div>
            ) : (
              // layout === "grid" ? (
              //   /* Grid View — show all non-local participants, camera or not */
              //   <div
              //     className="h-full w-full rounded-2xl overflow-y-auto border border-white/10 bg-black/40 grid gap-3 p-3 content-start justify-center"
              //     style={{
              //       gridTemplateColumns: `repeat(auto-fill, ${isMobile ? "280px" : "360px"})`,
              //     }}
              //   >
              //     {gridParticipants.slice(0, 24).map((p) => {
              //       const camTrack = cameraTracks.find(
              //         (t) => t.participant.identity === p.identity,
              //       );
              //       return (
              //         <ParticipantGridTile
              //           key={p.identity}
              //           participant={p}
              //           trackRef={camTrack}
              //           isMobile={isMobile}
              //         />
              //       );
              //     })}
              //     {gridParticipants.length > 4 && (
              //       <div className="col-span-full flex justify-center py-2">
              //         <button
              //           onClick={() => {
              //             setSidebarTab("participants");
              //             setShowSidebar(true);
              //           }}
              //           className="text-[10px] font-bold text-white/40 bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded-full transition-colors"
              //         >
              //           View all {gridParticipants.length} participants
              //         </button>
              //       </div>
              //     )}
              //   </div>
              // ) :
              /* Speaker View — mentor fills canvas, active speakers float at bottom */
              <div
                className="h-full w-full relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-2xl"
                style={{ contain: "layout paint" }}
              >
                <div className="absolute inset-0">
                  {mainTrack && (
                    <CustomParticipantTile
                      trackRef={mainTrack}
                      isHostTile={String(mainTrack.participant.identity) === String(mentorId)}
                      isAdminTile={false}
                    />
                  )}
                </div>
                {/* Host Reconnecting fallback — matches Zoom/Meet frozen-tile
                    pattern. Covers both windows: host fully removed from the
                    room (no track, identity gone) AND host dropped but still
                    lingering (frozen track) via the faster Lost-quality signal.
                    Rendered after the video layer so it overlays the dead frame. */}
                {((!mainTrack && !mentorPresent) || mentorConnectionLost) &&
                  !isHost &&
                  sessionStatus !== "ended" && (
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A14] to-[#12121F] flex flex-col items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-primary/10">
                        <Wifi className="w-8 h-8 text-primary/50" />
                      </div>
                      <h3 className="text-white/80 text-lg font-medium mb-1">
                        Host Reconnecting
                      </h3>
                      <p className="text-white/40 text-sm text-center max-w-sm">
                        The host's connection was interrupted. The session will
                        resume automatically.
                      </p>
                      <Loader2 className="w-4 h-4 animate-spin mt-6 text-white/30" />
                    </div>
                  )}
                {activeSpeakers.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3 pt-16 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                    <div
                      className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                      style={{ scrollbarWidth: "none" }}
                    >
                      {activeSpeakers.map((p) => {
                        // const camTrack = cameraTracks.find(
                        //   (t) => t.participant.identity === p.identity,
                        // );
                        return (
                          <div
                            key={p.identity}
                            className="shrink-0 rounded-xl overflow-hidden border border-white/15 bg-black/80 shadow-lg"
                            style={{
                              width: 148,
                              height: 92,
                              contain: "layout paint",
                            }}
                          >
                            {
                              // camTrack ? (
                              //   <CustomParticipantTile trackRef={camTrack} />
                              // ) :
                              <ParticipantAvatarTile participant={p} compact />
                            }
                          </div>
                        );
                      })}
                    </div>
                    {/* {listenerCount > 0 && (
                      <div className="absolute top-1 right-3 text-[9px] font-bold text-white/40 bg-black/50 px-2 py-0.5 rounded-full">
                        {listenerCount} listening
                      </div>
                    )} */}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Conference Control Bar */}
          {isMobile && !showSidebar ? (
            <div className="fixed bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-full px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-1.5 sm:gap-2 max-w-[96vw] sm:max-w-[min(96vw,420px)] w-auto justify-center overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none] animate-in slide-in-from-bottom-8 duration-500">
              {connState === "reconnecting" && (
                <span className="shrink-0 snap-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 text-black text-[10px] font-black tracking-widest uppercase">
                  <Loader2 className="w-3 h-3 animate-spin" /> Reconnecting
                </span>
              )}
              {isHost && !isNarrow && (
                <span className="snap-start shrink-0">
                  <MediaControl
                    source={Track.Source.Camera}
                    minimal
                    onIcon={<Video className="w-5 h-5" />}
                    offIcon={<VideoOff className="w-5 h-5" />}
                  />
                </span>
              )}
              <span className="snap-start shrink-0">
                <MediaControl
                  source={Track.Source.Microphone}
                  minimal={true}
                  onIcon={<Mic className="w-5 h-5" />}
                  offIcon={<MicOff className="w-5 h-5" />}
                />
              </span>
              <span className="snap-start shrink-0">
                <ControlActionButton
                  onClick={toggleHand}
                  aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
                  icon={
                    <Hand
                      className={`w-5 h-5 ${isHandRaised ? "text-yellow-400 fill-current" : "text-white"}`}
                    />
                  }
                  isActive={isHandRaised}
                  minimal={true}
                />
              </span>

              <div className="relative snap-start shrink-0">
                <ControlActionButton
                  onClick={() => {
                    setSidebarTab("chat");
                    setShowSidebar(true);
                    setShowMoreMenu(false);
                    setUnreadChat(0);
                  }}
                  aria-label="Open chat"
                  icon={<MessageSquare className="w-5 h-5" />}
                  minimal={true}
                />
                {unreadChat > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[20px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-lg border-2 border-[#1A1A1A] z-10">
                    {unreadChat > 99 ? "99+" : unreadChat}
                  </span>
                )}
              </div>

              <div className="relative snap-start shrink-0">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  aria-label="More options"
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 border ${showMoreMenu ? "bg-white text-gray-900 border-white" : "bg-white/10 hover:bg-white/20 text-white border-white/10"}`}
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showMoreMenu && (
                  <div className="absolute bottom-full right-0 mb-6 w-[min(72vw,16rem)] max-w-[72vw] bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl z-[60] animate-in slide-in-from-bottom-4 duration-300">
                    <div className="px-5 py-4 border-b border-white/5 bg-white/5">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                        Session Controls
                      </span>
                    </div>
                    <div className="py-2">
                      {/* <button
                        onClick={() => {
                          setSidebarTab("chat");
                          setShowSidebar(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-white/5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                          <MessageSquare className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-200">
                            Chat
                          </span>
                          { <span className="text-[10px] text-gray-500">
                            Send messages to all
                          </span> }
                        </div>
                      </button> */}
                      <button
                        onClick={() => {
                          setSidebarTab("participants");
                          setShowSidebar(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-5 py-4 text-left flex items-center justify-between hover:bg-white/5 transition-colors group"
                      >
                        <span className="flex items-center gap-4">
                          <span className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                            <Users className="w-4 h-4 text-purple-400" />
                          </span>
                          <span className="text-sm font-bold text-gray-200">Participants</span>
                        </span>
                        <span className="text-xs font-black text-gray-500">{allParticipants.length}</span>
                      </button>
                      {isHost && (
                        <button
                          onClick={async () => { await handleMuteAll(); setShowMoreMenu(false); }}
                          className="w-full px-5 py-3.5 text-left flex items-center gap-4 hover:bg-white/5 transition-colors group"
                        >
                          <span className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <MicOff className="w-4 h-4 text-red-400" />
                          </span>
                          <span className="text-sm font-bold text-gray-200">Mute All</span>
                        </button>
                      )}
                      {isNarrow && isHost && (
                        <button
                          onClick={async () => {
                            const lp: any = localParticipant;
                            try { await lp.setCameraEnabled(!lp.isCameraEnabled); } catch {}
                            setShowMoreMenu(false);
                          }}
                          className="w-full px-5 py-3.5 text-left flex items-center gap-4 hover:bg-white/5 transition-colors"
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${localParticipant?.isCameraEnabled ? "bg-green-500/20" : "bg-white/5"}`}>
                            {localParticipant?.isCameraEnabled ? <Video className="w-4 h-4 text-green-400" /> : <VideoOff className="w-4 h-4 text-gray-400" />}
                          </span>
                          <span className="flex flex-col text-left">
                            <span className="text-sm font-bold text-gray-200">Camera</span>
                            <span className="text-[10px] text-gray-500">{localParticipant?.isCameraEnabled ? "On — tap to turn off" : "Off — tap to turn on"}</span>
                          </span>
                        </button>
                      )}
                      {/* <button
                        onClick={() => {
                          setLayout(layout === "grid" ? "speaker" : "grid");
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-white/5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                          {layout === "grid" ? (
                            <User className="w-4 h-4 text-orange-400" />
                          ) : (
                            <LayoutGrid className="w-4 h-4 text-orange-400" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-200">
                            {layout === "grid" ? "Speaker View" : "Grid View"}
                          </span>                       
                        </div>
                      </button> */}

                      {isHost && (
                        <>
                          <div className="mx-5 my-2 border-t border-white/5" />
                          <button
                            onClick={async () => {
                              const isEnabled =
                                localParticipant?.isScreenShareEnabled;
                              await localParticipant?.setScreenShareEnabled(
                                !isEnabled,
                              );
                              setShowMoreMenu(false);
                            }}
                            className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-white/5 transition-colors group"
                          >
                            <div
                              className={`w-8 h-8 rounded-lg ${localParticipant?.isScreenShareEnabled ? "bg-green-500/20" : "bg-gray-500/10"} flex items-center justify-center group-hover:opacity-80 transition-all`}
                            >
                              <MonitorUp
                                className={`w-4 h-4 ${localParticipant?.isScreenShareEnabled ? "text-green-400" : "text-gray-400"}`}
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-200">
                                Share Screen
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {localParticipant?.isScreenShareEnabled
                                  ? "Currently presenting"
                                  : "Start presenting"}
                              </span>
                            </div>
                          </button>
                          {/* 
                          Hiding recording button now
                          <button
                            onClick={() => {
                              handleToggleRecording();
                              setShowMoreMenu(false);
                            }}
                            className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-white/5 transition-colors group"
                          >
                            <div
                              className={`w-8 h-8 rounded-lg ${isRecording ? "bg-red-500/20" : "bg-gray-500/10"} flex items-center justify-center group-hover:opacity-80 transition-all`}
                            >
                              <CircleDot
                                className={`w-4 h-4 ${isRecording ? "text-red-400 animate-pulse" : "text-gray-400"}`}
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-200">
                                Record Session{" "}
                                {isRecording ? recordingDuration : ""}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {isRecording
                                  ? "Stop cloud recording"
                                  : "Save this meeting"}
                              </span>
                            </div>
                          </button> */}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="w-[1px] h-6 bg-white/10 mx-1 shrink-0" />

              <button
                onClick={async () => {
                  if (isHost) { setShowEndConfirm(true); return; }
                  navigatingRef.current = true;
                  room.disconnect();
                  navigate("/", { replace: true });
                }}
                aria-label={isHost ? "End session" : "Leave"}
                className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 snap-start bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-all"
              >
                <PhoneOff className="w-5 h-5 fill-current" />
              </button>
            </div>
          ) : (
            <div className="absolute bottom-0 left-0 right-0 z-20 px-2 py-3 md:px-8 md:py-5 bg-[#121212] border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.6)]">
              <div className="max-w-screen-2xl mx-auto flex items-center justify-between md:gap-4 overflow-x-auto no-scrollbar w-full">
                {/* Left: Audio/Video Toggles */}
                <div className="flex items-center gap-3 md:gap-4 shrink-0">
                  {/* Microphone Control */}
                  <div className="relative group">
                    <div className="relative flex items-center bg-white/10 rounded-2xl border border-white/10 transition-all overflow-hidden shadow-lg hover:border-white/30">
                      <MediaControl
                        source={Track.Source.Microphone}
                        //disabled={!canSpeak}
                        onIcon={<Mic className="w-5 h-5 text-white" />}
                        offIcon={<MicOff className="w-5 h-5 text-red-500" />}
                      />
                      <button
                        onClick={() => setShowAudioMenu(!showAudioMenu)}
                        className="px-2 py-4 hover:bg-white/10 transition-colors border-l border-white/10 disabled:hover:bg-transparent"
                      >
                        <ChevronUp
                          className={`w-4 h-4 text-gray-400 transition-transform ${showAudioMenu ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>

                    {showAudioMenu && (
                      <DeviceMenu
                        kind="audioinput"
                        onClose={() => setShowAudioMenu(false)}
                      />
                    )}
                  </div>

                  {/* Camera Control — host only (mentor + admin co-host, join-muted) */}
                  {isHost && (
                    <div className="relative group">
                      <div className="relative flex items-center bg-white/10 rounded-2xl border border-white/10 transition-all overflow-hidden shadow-lg hover:border-white/30">
                        <MediaControl
                          source={Track.Source.Camera}
                          //disabled={!canSpeak}
                          onIcon={<Video className="w-5 h-5 text-white" />}
                          offIcon={
                            <VideoOff className="w-5 h-5 text-red-500" />
                          }
                        />
                        <button
                          onClick={() => setShowVideoMenu(!showVideoMenu)}
                          className="px-2 py-4 hover:bg-white/10 transition-colors border-l border-white/10 disabled:hover:bg-transparent"
                        >
                          <ChevronUp
                            className={`w-4 h-4 text-gray-400 transition-transform ${showVideoMenu ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {showVideoMenu && (
                        <DeviceMenu
                          kind="videoinput"
                          onClose={() => setShowVideoMenu(false)}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Center: Main Actions */}
                <div className="flex items-center gap-1 md:gap-2 shrink-0 px-2 md:px-0 border-x border-white/5 md:border-transparent mx-2 md:mx-0">
                  <ControlActionButton
                    onClick={() => {
                      if (showSidebar && sidebarTab === "chat") {
                        setShowSidebar(false);
                      } else {
                        setSidebarTab("chat");
                        setShowSidebar(true);
                      }
                      setUnreadChat(0);
                    }}
                    icon={<MessageSquare className="w-5 h-5" />}
                    label="Chat"
                    isActive={showSidebar && sidebarTab === "chat"}
                    badge={unreadChat > 0 ? unreadChat : undefined}
                  />

                  <ControlActionButton
                    onClick={() => {
                      if (showSidebar && sidebarTab === "participants") {
                        setShowSidebar(false);
                      } else {
                        setSidebarTab("participants");
                        setShowSidebar(true);
                      }
                    }}
                    icon={<Users className="w-5 h-5" />}
                    label="People"
                    isActive={showSidebar && sidebarTab === "participants"}
                  />

                  {/* <ControlActionButton
                    onClick={() =>
                      setLayout(layout === "grid" ? "speaker" : "grid")
                    }
                    icon={
                      layout === "grid" ? (
                        <User className="w-5 h-5" />
                      ) : (
                        <LayoutGrid className="w-5 h-5" />
                      )
                    }
                    label={layout === "grid" ? "Speaker" : "Grid"}
                    isActive={false}
                  /> */}

                  <ControlActionButton
                    onClick={toggleHand}
                    icon={
                      <Hand
                        className={`w-5 h-5 ${isHandRaised ? "text-yellow-400 fill-current" : "text-gray-100"}`}
                      />
                    }
                    label="Raise Hand"
                    isActive={isHandRaised}
                    activeColor="text-yellow-400"
                  />

                  {isHost && (
                    <ControlActionButton
                      onClick={async () => {
                        const isEnabled =
                          localParticipant?.isScreenShareEnabled;
                        await localParticipant?.setScreenShareEnabled(
                          !isEnabled,
                        );
                      }}
                      icon={
                        <MonitorUp
                          className={`w-5 h-5 ${localParticipant?.isScreenShareEnabled ? "text-green-400" : "text-gray-100"}`}
                        />
                      }
                      label="Share"
                      isActive={localParticipant?.isScreenShareEnabled}
                      activeColor="text-green-400"
                    />
                  )}

                  {/* {isMentor && (
                    <ControlActionButton
                      onClick={handleToggleRecording}
                      icon={
                        <CircleDot
                          className={`w-5 h-5 ${isRecording ? "text-red-500 animate-pulse" : "text-gray-100"}`}
                        />
                      }
                      label={
                        isRecording ? `Rec ${recordingDuration}` : "Record"
                      }
                      isActive={isRecording}
                      activeColor="text-red-500"
                    />
                  )} */}
                </div>

                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                  <ControlActionButton
                    onClick={toggleFullscreen}
                    icon={
                      isFullscreen ? (
                        <Minimize className="w-5 h-5" />
                      ) : (
                        <Maximize className="w-5 h-5" />
                      )
                    }
                    label={isFullscreen ? "Exit Full" : "Full Screen"}
                    isActive={isFullscreen}
                    activeColor="text-white"
                  />

                  <button
                    onClick={async () => {
                      if (isHost) { setShowEndConfirm(true); return; }
                      navigatingRef.current = true;
                      room.disconnect();
                      navigate("/", { replace: true });
                    }}
                    aria-label={isHost ? "End session" : "Leave"}
                    className="w-12 h-12 md:w-auto md:px-6 md:py-4 bg-red-500 hover:bg-red-600 rounded-full md:rounded-2xl flex items-center justify-center gap-2 text-white shadow-lg active:scale-90 transition-all group"
                  >
                    <PhoneOff className="w-5 h-5 fill-current" />
                    <span className="hidden md:inline text-xs font-black uppercase tracking-widest">
                      {isHost ? "End Session" : "Leave"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {showEndConfirm && (
            <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-sm font-bold text-white mb-1">End session?</h3>
                <p className="text-xs text-white/60 mb-5">Everyone will be disconnected. This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowEndConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/15">Stay</button>
                  <button onClick={doEndSession} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black hover:bg-red-600">End Session</button>
                </div>
              </div>
            </div>
          )}

          {/* Session Ended Overlay */}
          {sessionStatus === "ended" && (
            <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <PhoneOff className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">
                Session Ended
              </h2>
              <p className="text-gray-400 max-w-md mx-auto mb-8">
                The mentor has ended the session. You will be redirected to the
                dashboard in a few seconds.
              </p>
              <div className="flex items-center gap-2 text-primary">
                <div
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar for Chat, Participants, Approval */}
        {showSidebar && (
          <ConferencingSidebar
            sessionId={sessionId}
            isMentor={isMentor}
            isAdmin={isAdmin}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            onMuteAll={handleMuteAll}
            chatMessages={chatMessages}
            sendChat={sendChat}
            onClose={() => setShowSidebar(false)}
            isSending={isSending}
          />
        )}
      </div>
    </LayoutContextProvider>
  );
}

// Moved to module level — defining these inside MyVideoConference caused them to be
// recreated on every render, which made React unmount/remount VideoTrack (flicker).
const CustomParticipantTile = React.memo(function CustomParticipantTile(
  props: any,
) {
  let contextTrack: any;
  try {
    contextTrack = useTrackRefContext();
  } catch (_) {
    // Expected when rendered outside a context provider
  }

  const trackRef = props.trackRef || contextTrack;
  const p = props.participant || trackRef?.participant;

  if (!p)
    return (
      <div className="bg-gray-900 w-full h-full animate-pulse flex items-center justify-center text-[10px] text-white/20 uppercase font-black">
        Connecting...
      </div>
    );

  return (
    <div
      className="relative w-full h-full group overflow-hidden"
      style={{ contain: "layout paint" }}
    >
      {p.isCameraEnabled ? (
        <VideoTrack
          trackRef={trackRef}
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="w-full h-full bg-[#14141c] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <User className="w-6 h-6 text-white/30" />
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-1 left-1 z-20 flex items-center gap-2 max-w-[calc(100%-32px)]">
        <div className="bg-black/60 backdrop-blur-md px-1.5 py-1 rounded border border-white/10 flex items-center gap-2 w-full overflow-hidden">
          <div
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${p.isMicrophoneEnabled ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-[10px] font-bold text-white tracking-wide truncate">
            {p.name || p.identity}
          </span>
          {props.isAdminTile && (
            <span className="shrink-0 text-[7px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded bg-[#7B5EA8]/30 border border-[#7B5EA8]/40 text-[#C9B6FF]">
              Admin
            </span>
          )}
          {props.isHostTile && !props.isAdminTile && (
            <span className="shrink-0 text-[7px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded bg-primary/20 border border-primary/30 text-primary">
              Host
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function ParticipantGridTile({
  participant,
  trackRef,
  isMobile,
}: {
  participant: any;
  trackRef?: any;
  isMobile: boolean;
}) {
  const w = isMobile ? 280 : 360;
  const h = Math.round((w * 9) / 16);
  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10 bg-black/60 shrink-0"
      style={{ width: w, height: h, contain: "layout paint" }}
    >
      {trackRef ? (
        <CustomParticipantTile trackRef={trackRef} />
      ) : (
        <div className="w-full h-full bg-[#14141c] flex flex-col items-center justify-center gap-2 p-3">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <User className="w-6 h-6 text-white/30" />
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${participant.isMicrophoneEnabled ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-red-500"}`}
            />
            <span className="text-[11px] font-bold text-white/60 truncate max-w-[120px]">
              {participant.name || participant.identity}
            </span>
          </div>
          {participant.isSpeaking && (
            <div className="text-[9px] font-bold text-green-400/70 uppercase tracking-widest">
              Speaking
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ParticipantAvatarTile({
  participant,
  compact,
}: {
  participant: any;
  compact?: boolean;
}) {
  return (
    <div className="w-full h-full bg-[#14141c] flex flex-col items-center justify-center p-1">
      <div
        className={`rounded-full bg-white/5 border border-white/10 flex items-center justify-center ${compact ? "w-6 h-6" : "w-8 h-8"}`}
      >
        <User
          className={
            compact ? "w-3.5 h-3.5 text-white/30" : "w-4 h-4 text-white/30"
          }
        />
      </div>
      <span className="text-[8px] font-bold text-white/40 truncate max-w-[100px] mt-0.5 text-center leading-tight">
        {participant.name || participant.identity}
      </span>
      <div className="flex items-center gap-1 mt-0.5">
        <div
          className={`w-1 h-1 rounded-full ${participant.isMicrophoneEnabled ? "bg-green-500" : "bg-red-500"}`}
        />
        {participant.isSpeaking && (
          <span className="text-[7px] font-bold text-green-400">SPK</span>
        )}
      </div>
    </div>
  );
}

// Helper Components for Zoom-like Controls
function MediaControl({ source, onIcon, offIcon, minimal }: any) {
  const { toggle, enabled } = useTrackToggle({ source });

  const handleToggle = async () => {
    try {
      await toggle();
    } catch (err) {
      console.error(`Failed to toggle ${source}:`, err);
    }
  };

  if (minimal) {
    return (
      <button
        onClick={handleToggle}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ${
          enabled
            ? "bg-white/10 hover:bg-white/20"
            : "bg-white text-gray-900 border border-white"
        }`}
      >
        {enabled ? (
          onIcon
        ) : source === Track.Source.Microphone ? (
          <MicOff className="w-5 h-5" />
        ) : (
          <VideoOff className="w-5 h-5" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className="px-3 py-2 md:px-5 md:py-4 transition-colors flex flex-col items-center gap-1 md:gap-1.5 min-w-[60px] md:min-w-[80px] hover:bg-white/5"
    >
      <div className="mb-0.5">{enabled ? onIcon : offIcon}</div>
      <span
        className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest ${enabled ? "text-gray-300" : "text-red-500"}`}
      >
        {source === Track.Source.Microphone
          ? enabled
            ? "Mute"
            : "Unmute"
          : enabled
            ? "Stop"
            : "Start"}
      </span>
    </button>
  );
}

function ControlActionButton({
  icon,
  label,
  onClick,
  isActive,
  activeColor = "text-white",
  minimal,
  badge,
  "aria-label": ariaLabel,
}: any) {
  if (minimal) {
    return (
      <button
        onClick={onClick}
        aria-label={ariaLabel || label}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ${
          isActive
            ? "bg-white text-gray-900 border border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            : "bg-white/10 hover:bg-white/20 text-white"
        }`}
      >
        <div className="relative transition-transform duration-200 group-hover:scale-110">
          {icon}
          {badge && (
            <span className="absolute -top-2 -right-2 min-w-[16px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-lg border-2 border-surface-dark z-10">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel || label}
      className={`px-2 py-2 md:px-4 md:py-3 rounded-2xl flex flex-col items-center gap-1 md:gap-1.5 transition-all hover:bg-white/10 min-w-[50px] md:min-w-[80px] group ${isActive ? "bg-white/15 shadow-inner" : ""}`}
    >
      <div className="relative transition-transform duration-200 group-hover:scale-110">
        <div className={`${isActive ? activeColor : "text-gray-100"}`}>
          {icon}
        </div>
        {badge && (
          <span className="absolute -top-2 -right-2 min-w-[16px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-lg border-2 border-[#121212] z-10">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span
        className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] transition-colors ${isActive ? activeColor : "text-gray-400"}`}
      >
        {label}
      </span>
    </button>
  );
}

function DeviceMenu({
  kind,
  onClose,
}: {
  kind: MediaDeviceKind;
  onClose: () => void;
}) {
  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind });

  // If no devices with labels, it might be a permission issue
  const hasNoLabels = devices.length > 0 && devices.every((d) => !d.label);

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "audioinput" ? { audio: true } : { video: true },
      );
      stream.getTracks().forEach((track) => track.stop());
      // Refresh logic is usually handled by the hook/browser events
      onClose();
    } catch (err) {
      console.error("Permission request failed:", err);
    }
  };

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 mb-4 w-[min(72vw,16rem)] max-w-[72vw] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-up">
      <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          Select {kind === "audioinput" ? "Microphone" : "Camera"}
        </span>
        {hasNoLabels && (
          <button
            onClick={requestPermission}
            className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black uppercase"
          >
            Authorize
          </button>
        )}
      </div>
      <div className="py-2 max-h-64 overflow-y-auto">
        {devices.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[10px] text-gray-500 font-bold mb-3">
              No devices found
            </p>
            <button
              onClick={requestPermission}
              className="px-3 py-1.5 bg-primary text-white text-[9px] font-black rounded-lg uppercase"
            >
              Request Permission
            </button>
          </div>
        ) : (
          devices.map((device) => (
            <button
              key={device.deviceId}
              onClick={() => {
                setActiveMediaDevice(device.deviceId);
                onClose();
              }}
              className={`w-full px-4 py-2.5 text-left text-xs transition-colors flex items-center justify-between group ${
                device.deviceId === activeDeviceId
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`}
            >
              <span className="truncate pr-4">
                {device.label || `Device ${device.deviceId.slice(0, 5)}`}
              </span>
              {device.deviceId === activeDeviceId && (
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
