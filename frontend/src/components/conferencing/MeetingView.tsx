import React, { useEffect, useState, useMemo, useRef } from "react";
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
import { Track, DataPacket_Kind, AudioPresets } from "livekit-client";
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
} from "lucide-react";
import { OrbitalLoader } from "../OrbitalLoader";
import { ConferencingSidebar } from "./ConferencingSidebar";

interface MeetingViewProps {
  token: string;
  serverUrl: string;
  sessionId: string;
  isMentor: boolean;
  mentorId: string;
  onDisconnected: () => void;
}

export const MeetingView: React.FC<MeetingViewProps> = ({
  token,
  serverUrl,
  sessionId,
  isMentor,
  mentorId,
  onDisconnected,
}) => {
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
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            audioPreset: AudioPresets.speech,
            stopMicTrackOnMute: true,
          },
        }}
        className="flex-1 flex flex-col overflow-hidden text-white"
      >
        <MyVideoConference
          sessionId={sessionId}
          isMentor={isMentor}
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
  mentorId,
}: {
  sessionId: string;
  isMentor: boolean;
  mentorId: string;
}) {
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

  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"active" | "ended">(
    "active",
  );

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
  const [sidebarTab, setSidebarTab] = useState<
    "chat" | "participants" | "approval"
  >("chat");
  const [isRecording, setIsRecording] = useState(false);
  const [egressId, setEgressId] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(
    null,
  );
  const [recordingDuration, setRecordingDuration] = useState("00:00");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Restore recording state from DB on mount (handles page refresh mid-recording)
  useEffect(() => {
    if (!isMentor) return;
    const restoreRecordingState = async () => {
      const { data } = await supabase
        .from("session_recordings")
        .select("egress_id, status, started_at")
        .eq("session_id", sessionId)
        .in("status", ["starting", "recording"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setIsRecording(true);
        setEgressId(data.egress_id);
        setRecordingStartTime(new Date(data.started_at).getTime());
      }
    };
    restoreRecordingState();
  }, [sessionId, isMentor]);

  // Recording duration timer
  useEffect(() => {
    if (!isRecording || !recordingStartTime) {
      setRecordingDuration("00:00");
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      setRecordingDuration(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

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

  // Poll for session-end signal via mentor metadata (backup for data channel)
  // Runs on a timer instead of every state change to avoid 200+ JSON.parse per tick
  const allParticipantsRef = useRef(allParticipants);
  allParticipantsRef.current = allParticipants;

  useEffect(() => {
    if (!localParticipant) return;

    const interval = setInterval(() => {
      if (sessionStatus === "ended") return;
      const allP = [localParticipant, ...allParticipantsRef.current];
      const mentor = allP.find((p) => {
        try {
          const meta = JSON.parse(p.metadata || "{}");
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
            setTimeout(() => {
              room.disconnect();
              navigate("/", { replace: true });
            }, 3000);
          }
        } catch (e) {
          console.error("Failed to parse mentor metadata:", e);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [localParticipant, mentorId, sessionStatus, room, navigate]);

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

        if (data.action === "SESSION_ENDED" && !isMentor) {
          devLog("Received SESSION_ENDED signal");
          setSessionStatus("ended");
          setTimeout(() => {
            room.disconnect();
            navigate("/", { replace: true });
          }, 3000);
          return;
        }

        if (data.action === "MUTE_ALL" && !isMentor) {
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
        }
      } catch (e) {
        console.error("Error processing data channel message:", e);
      }
    };

    room.on("dataReceived", onDataReceived);
    return () => {
      room.off("dataReceived", onDataReceived);
    };
  }, [room, localParticipant, isMentor]);

  const handleMuteAll = async () => {
    if (!isMentor || !localParticipant) return;

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

  const handleToggleRecording = async () => {
    if (!isMentor) return;
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();

    try {
      if (isRecording) {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authSession?.access_token}`,
            },
            body: JSON.stringify({
              session_id: sessionId,
              action: "stop_recording",
              egress_id: egressId,
            }),
          },
        );
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("Failed to stop recording:", err.error);
          return;
        }
        setIsRecording(false);
        setEgressId(null);
        setRecordingStartTime(null);
      } else {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authSession?.access_token}`,
            },
            body: JSON.stringify({
              session_id: sessionId,
              action: "start_recording",
            }),
          },
        );
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("Failed to start recording:", err.error);
          return;
        }
        const data = await res.json();
        setIsRecording(true);
        setEgressId(data.egress_id);
        setRecordingStartTime(Date.now());
      }
    } catch (err) {
      console.error("Recording toggle failed:", err);
    }
  };

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
    const anyCamera = tracks.find((t) => t.source === Track.Source.Camera);
    if (anyCamera) {
      devLog(
        "Using secondary fallback camera:",
        anyCamera.participant.identity,
      );
      return anyCamera;
    }

    return null;
  }, [tracks, mentorId, isMentor, localParticipant]);

  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare,
  );

  // Determine main focus: Screen Share > Mentor
  const mainTrack = screenShareTrack || mainSpeakerTrack || tracks[0];

  // All camera tracks (for mentor main view)
  const cameraTracks = useMemo(() => {
    return tracks.filter((t) => t.source === Track.Source.Camera);
  }, [tracks]);

  // Active speakers + recent speakers (sticky — doesn't disappear on brief pause)
  // Falls back to showing any non-local participants when nobody has spoken yet
  const activeSpeakers = useMemo(() => {
    const localId = localParticipant?.identity;
    // Exclude local user AND mentor (already pinned in main view)
    const nonLocal = allParticipants.filter(
      (p) => p.identity !== localId && p.identity !== mentorId,
    );

    // Currently speaking first
    const speaking = nonLocal
      .filter((p) => p.isSpeaking)
      .sort(
        (a, b) =>
          (b.lastSpokeAt?.getTime() || 0) - (a.lastSpokeAt?.getTime() || 0),
      );

    // Recently spoke (not currently speaking) — fill remaining slots
    const spokenIds = new Set(speaking.map((p) => p.identity));
    const recent = nonLocal
      .filter(
        (p) => p.lastSpokeAt && !p.isSpeaking && !spokenIds.has(p.identity),
      )
      .sort(
        (a, b) =>
          (b.lastSpokeAt!.getTime() || 0) - (a.lastSpokeAt!.getTime() || 0),
      );

    const maxItems = 6;
    const recentSlots = maxItems - speaking.length;
    const result = [...speaking, ...recent.slice(0, recentSlots)];

    // Still empty? Show any non-local participants so the strip is never blank
    if (result.length === 0) {
      return nonLocal.slice(0, maxItems);
    }

    return result;
  }, [allParticipants, localParticipant?.identity, mentorId]);

  // Non-local participants for grid mode
  const gridParticipants = useMemo(() => {
    return allParticipants;
  }, [allParticipants]);

  // Listener count: non-local participants not currently speaking
  const listenerCount = useMemo(() => {
    return allParticipants.filter((p) => !p.isLocal && !p.isSpeaking).length;
  }, [allParticipants]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    devLog("Track Filtering Debug:", {
      mentorId,
      tracksCount: tracks.length,
      mentorTrackFound: !!mainSpeakerTrack,
      screenShareTrackFound: !!screenShareTrack,
      mainTrackParticipant: mainTrack?.participant?.identity,
      activeSpeakerCount: activeSpeakers.length,
      listenerCount,
      allIdentities: allParticipants.map((p) => p.identity),
    });
  }, [
    mentorId,
    tracks,
    mainSpeakerTrack,
    screenShareTrack,
    mainTrack,
    activeSpeakers,
    listenerCount,
    allParticipants,
  ]);

  return (
    <LayoutContextProvider>
      <div className="flex-1 flex overflow-hidden relative bg-[#080808]">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header/Overlay Info */}
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20 flex items-center gap-3">
            {/* <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/20 flex items-center gap-2 md:gap-2.5 shadow-2xl">
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">
                Live Session
              </span>
            </div> */}
            {isRecording && (
              <div className="bg-red-600/80 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-red-400/20 flex items-center gap-2 shadow-2xl">
                <CircleDot className="w-3 h-3 text-white animate-pulse" />
                <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">
                  Rec {recordingDuration}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden p-2 md:p-6 mb-24 md:mb-28">
            {/* Empty room — nobody here yet */}
            {tracks.length === 0 && allParticipants.length <= 1 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <OrbitalLoader variant="inline" label="Waiting for mentor..." />
                <p className="font-bold text-lg tracking-tight mt-4">
                  Preparing your session...
                </p>
              </div>
            ) : layout === "grid" ? (
              /* Grid View — show all non-local participants, camera or not */
              <div
                className="h-full w-full rounded-2xl overflow-y-auto border border-white/10 bg-black/40 grid gap-3 p-3 content-start"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${gridParticipants.length <= 2 ? "320px" : "260px"}, 1fr))`,
                }}
              >
                {gridParticipants.slice(0, 24).map((p) => {
                  const camTrack = cameraTracks.find(
                    (t) => t.participant.identity === p.identity,
                  );
                  return (
                    <ParticipantGridTile
                      key={p.identity}
                      participant={p}
                      trackRef={camTrack}
                    />
                  );
                })}
                {gridParticipants.length > 4 && (
                  <div className="col-span-full flex justify-center py-2">
                    <button
                      onClick={() => {
                        setSidebarTab("participants");
                        setShowSidebar(true);
                      }}
                      className="text-[10px] font-bold text-white/40 bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded-full transition-colors"
                    >
                      View all {gridParticipants.length} participants
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Speaker View — mentor fills canvas, active speakers float at bottom */
              <div className="h-full w-full relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-2xl">
                <div className="absolute inset-0">
                  {mainTrack && <CustomParticipantTile trackRef={mainTrack} />}
                </div>
                {activeSpeakers.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3 pt-16 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                    <div
                      className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                      style={{ scrollbarWidth: "none" }}
                    >
                      {activeSpeakers.map((p) => {
                        const camTrack = cameraTracks.find(
                          (t) => t.participant.identity === p.identity,
                        );
                        return (
                          <div
                            key={p.identity}
                            className="shrink-0 w-[148px] h-[92px] rounded-xl overflow-hidden border border-white/15 bg-black/80 shadow-lg hover:scale-105 hover:border-white/30 transition-all duration-200"
                          >
                            {camTrack ? (
                              <CustomParticipantTile trackRef={camTrack} />
                            ) : (
                              <ParticipantAvatarTile participant={p} compact />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {listenerCount > 0 && (
                      <div className="absolute top-1 right-3 text-[9px] font-bold text-white/40 bg-black/50 px-2 py-0.5 rounded-full">
                        {listenerCount} listening
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Conference Control Bar */}
          {isMobile && !showSidebar ? (
            <div className="fixed bottom-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1.5rem))] left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-full px-5 py-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-3.5 animate-in slide-in-from-bottom-8 duration-500">
              <MediaControl
                source={Track.Source.Camera}
                minimal={true}
                onIcon={<Video className="w-5 h-5" />}
                offIcon={<VideoOff className="w-5 h-5" />}
              />
              <MediaControl
                source={Track.Source.Microphone}
                minimal={true}
                onIcon={<Mic className="w-5 h-5" />}
                offIcon={<MicOff className="w-5 h-5" />}
              />
              <ControlActionButton
                onClick={toggleHand}
                icon={
                  <Hand
                    className={`w-5 h-5 ${isHandRaised ? "text-yellow-400 fill-current" : "text-white"}`}
                  />
                }
                isActive={isHandRaised}
                minimal={true}
              />

              <div className="relative">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className={`w-11 h-14 rounded-full flex flex-col items-center justify-center transition-all bg-white/10 hover:bg-white/20 active:scale-95 ${showMoreMenu ? "bg-white/20" : ""}`}
                >
                  <MoreVertical className="w-5 h-5 text-white" />
                </button>

                {showMoreMenu && (
                  <div className="absolute bottom-full right-0 mb-6 w-64 bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl z-[60] animate-in slide-in-from-bottom-4 duration-300">
                    <div className="px-5 py-4 border-b border-white/5 bg-white/5">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                        Session Controls
                      </span>
                    </div>
                    <div className="py-2">
                      <button
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
                          {/* <span className="text-[10px] text-gray-500">
                            Send messages to all
                          </span> */}
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setSidebarTab("participants");
                          setShowSidebar(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-white/5 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                          <Users className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-200">
                            Participants
                          </span>
                          {/* <span className="text-[10px] text-gray-500">
                            Manage everyone
                          </span> */}
                        </div>
                      </button>
                      <button
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
                          {/* <span className="text-[10px] text-gray-500">
                            Change perspective
                          </span> */}
                        </div>
                      </button>

                      {isMentor && (
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

              <div className="w-[1px] h-6 bg-white/10 mx-1" />

              <button
                onClick={async () => {
                  if (isMentor) {
                    try {
                      const { data: authData } =
                        await supabase.auth.getSession();
                      await fetch(
                        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${authData.session?.access_token}`,
                          },
                          body: JSON.stringify({
                            session_id: sessionId,
                            action: "end",
                          }),
                        },
                      );
                    } catch (err) {
                      console.error(err);
                    }
                  }
                  room.disconnect();
                }}
                className="w-12 h-12 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-all"
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

                  {/* Camera Control */}
                  <div className="relative group">
                    <div className="relative flex items-center bg-white/10 rounded-2xl border border-white/10 transition-all overflow-hidden shadow-lg hover:border-white/30">
                      <MediaControl
                        source={Track.Source.Camera}
                        //disabled={!canSpeak}
                        onIcon={<Video className="w-5 h-5 text-white" />}
                        offIcon={<VideoOff className="w-5 h-5 text-red-500" />}
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
                    }}
                    icon={<MessageSquare className="w-5 h-5" />}
                    label="Chat"
                    isActive={showSidebar && sidebarTab === "chat"}
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

                  <ControlActionButton
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
                  />

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

                  {isMentor && (
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
                      if (isMentor) {
                        try {
                          // 1. Broadcast SESSION_ENDED via data channel for instant notification
                          const encoder = new TextEncoder();
                          await localParticipant.publishData(
                            encoder.encode(
                              JSON.stringify({ action: "SESSION_ENDED" }),
                            ),
                            { reliable: true },
                          );

                          // 2. Signal through metadata as backup
                          const currentMeta = JSON.parse(
                            localParticipant.metadata || "{}",
                          );
                          await localParticipant.setMetadata(
                            JSON.stringify({
                              ...currentMeta,
                              isSessionEnded: true,
                            }),
                          );

                          setSessionStatus("ended");

                          // 3. Cleanup via backend
                          const { data: authData } =
                            await supabase.auth.getSession();
                          fetch(
                            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${authData.session?.access_token}`,
                              },
                              body: JSON.stringify({
                                session_id: sessionId,
                                action: "end",
                              }),
                            },
                          ).catch((err) =>
                            console.warn("Backend cleanup failed:", err),
                          );

                          // 4. Disconnect and redirect
                          setTimeout(() => {
                            room.disconnect();
                            navigate("/", { replace: true });
                          }, 2000);
                        } catch (err) {
                          console.error(err);
                          room.disconnect();
                        }
                      } else {
                        room.disconnect();
                        navigate("/", { replace: true });
                      }
                    }}
                    className="w-12 h-12 md:w-auto md:px-6 md:py-4 bg-red-500 hover:bg-red-600 rounded-full md:rounded-2xl flex items-center justify-center gap-2 text-white shadow-lg active:scale-95 transition-all group"
                  >
                    <PhoneOff className="w-5 h-5 fill-current" />
                    <span className="hidden md:inline text-xs font-black uppercase tracking-widest">
                      {isMentor ? "End Session" : "Leave"}
                    </span>
                  </button>
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

  // Custom Participant Tile - Defined inside for closure access
  function CustomParticipantTile(props: any) {
    // Safe context access
    let contextTrack;
    try {
      contextTrack = useTrackRefContext();
    } catch (e) {
      // Expected when rendered outside a context provider
    }

    const trackRef = props.trackRef || contextTrack;
    const p = props.participant || trackRef?.participant;

    // Guard against missing participant early
    if (!p)
      return (
        <div className="bg-gray-900 w-full h-full animate-pulse flex items-center justify-center text-[10px] text-white/20 uppercase font-black">
          Connecting...
        </div>
      );

    return (
      <div className="relative w-full h-full group overflow-hidden">
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
              {/* <span className="text-[10px] font-medium text-white/40 truncate max-w-[100px] text-center">
                {p.name || p.identity}
              </span> */}
            </div>
          </div>
        )}

        {/* Participant Name Overlay */}
        <div className="absolute bottom-1 left-1 z-20 flex items-center gap-2 max-w-[calc(100%-32px)]">
          <div className="bg-black/60 backdrop-blur-md px-1.5 py-1 rounded border border-white/10 flex items-center gap-2 w-full overflow-hidden">
            <div
              className={`shrink-0 w-1.5 h-1.5 rounded-full ${p.isMicrophoneEnabled ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-[10px] font-bold text-white tracking-wide truncate">
              {p.name || p.identity}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Tile for grid mode — works with or without camera
  function ParticipantGridTile({
    participant,
    trackRef,
  }: {
    participant: any;
    trackRef?: any;
  }) {
    return (
      <div className="aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/60">
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

  // Compact avatar tile for speaker strip
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
}: any) {
  if (minimal) {
    return (
      <button
        onClick={onClick}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ${
          isActive
            ? "bg-white text-gray-900 border border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            : "bg-white/10 hover:bg-white/20 text-white"
        }`}
      >
        <div className="transition-transform duration-200 group-hover:scale-110">
          {icon}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`px-2 py-2 md:px-4 md:py-3 rounded-2xl flex flex-col items-center gap-1 md:gap-1.5 transition-all hover:bg-white/10 min-w-[50px] md:min-w-[80px] group ${isActive ? "bg-white/15 shadow-inner" : ""}`}
    >
      <div
        className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? activeColor : "text-gray-100"}`}
      >
        {icon}
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
    <div className="absolute bottom-full left-0 mb-4 w-64 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-up">
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
