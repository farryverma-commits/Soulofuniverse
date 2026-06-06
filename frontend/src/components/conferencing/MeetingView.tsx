import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  LayoutContextProvider,
  FocusLayout,
  CarouselLayout,
  GridLayout,
  ParticipantTile,
  useLocalParticipant,
  useParticipantInfo,
  useMediaDeviceSelect,
  useChat,
  useRoomContext,
  useTrackToggle,
  useTrackRefContext,
  useParticipants,
} from "@livekit/components-react";
import { Track, DataPacket_Kind } from "livekit-client";
//import "@livekit/components-styles";
import "./MeetingView.css";
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
  const [layout, setLayout] = useState<"grid" | "speaker">("speaker");
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
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
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
      { source: Track.Source.Camera, withPlaceholder: true },
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
  const isMutedByMentor = !!parsedMetadata.isMutedByMentor;
  const canSpeak = isMentor || (!!parsedMetadata.canSpeak && !isMutedByMentor);

  const allParticipants = useParticipants();

  useEffect(() => {
    console.log("Permissions updated:", {
      isMentor,
      canSpeak,
      isMutedByMentor,
      metadata: currentMetadata,
    });

    // Auto-mute if mentor has global mute on OR if specifically muted by mentor
    const checkMuteState = async () => {
      if (!localParticipant) return;

      // Check mentor's metadata for global mute or session end
      // Look through all participants to find the mentor
      const allP = [localParticipant, ...allParticipants];
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

          // Check for session end
          if (mentorMeta.isSessionEnded && sessionStatus !== "ended") {
            console.log("Session end signal received from mentor");
            setSessionStatus("ended");
            setTimeout(() => {
              room.disconnect();
              window.location.href = "/";
            }, 3000);
            return;
          }

          // Check for global mute
          const globalMute = !!mentorMeta.muteAllActive;
          if ((globalMute || isMutedByMentor) && !isMentor) {
            if (localParticipant.isMicrophoneEnabled) {
              console.log("Auto-muting due to mentor signal");
              await localParticipant.setMicrophoneEnabled(false);
            }
          }
        } catch (e) {
          console.error("Failed to parse mentor metadata:", e);
        }
      }
    };

    checkMuteState();
  }, [
    isMentor,
    canSpeak,
    isMutedByMentor,
    currentMetadata,
    room,
    mentorId,
    localParticipant,
    sessionStatus,
    allParticipants,
  ]);

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
        console.log("Data message received:", data);

        if (data.action === "MUTE_ALL" && !isMentor) {
          console.log("Received MUTE_ALL command");
          await localParticipant.setMicrophoneEnabled(false);
          // Also update local metadata to reflect we are following the command
          const currentMeta = JSON.parse(localParticipant.metadata || "{}");
          await localParticipant.setMetadata(
            JSON.stringify({ ...currentMeta, isMutedByMentor: true }),
          );
        }

        if (data.target === localParticipant?.identity) {
          const currentMeta = JSON.parse(localParticipant?.metadata || "{}");

          if (data.action === "ALLOW_SPEAK") {
            console.log("Received ALLOW_SPEAK permission");
            const newMetadata = {
              ...currentMeta,
              canSpeak: true,
              isMutedByMentor: false,
              handRaised: false,
              raisedAt: null,
            };
            await localParticipant.setMetadata(JSON.stringify(newMetadata));
          } else if (data.action === "REVOKE_SPEAK") {
            console.log("Received REVOKE_SPEAK command");
            const newMetadata = {
              ...currentMeta,
              canSpeak: false,
              isMutedByMentor: true,
            };
            await localParticipant.setMetadata(JSON.stringify(newMetadata));
            await localParticipant.setMicrophoneEnabled(false);
            await localParticipant.setCameraEnabled(false);
          } else if (data.action === "LOWER_HAND") {
            console.log("Received LOWER_HAND command");
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

      console.log("Global Mute All initiated via metadata and data channel");
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
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
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
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
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

    console.log(
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
      console.log("Found mentor track:", mentorTrack.participant.identity);
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
        console.log("Using local mentor camera fallback");
        return localCamera;
      }
    }

    // Secondary fallback: Any camera track if no mentor track found
    const anyCamera = tracks.find((t) => t.source === Track.Source.Camera);
    if (anyCamera) {
      console.log(
        "Using secondary fallback camera:",
        anyCamera.participant.identity,
      );
      return anyCamera;
    }

    return null;
  }, [tracks, mentorId, isMentor, localParticipant]);

  // 2. Filter secondary tracks (all cameras except the one in main view)
  const secondaryTracks = useMemo(() => {
    if (!mainSpeakerTrack)
      return tracks.filter((t) => t.source === Track.Source.Camera);
    return tracks.filter(
      (t) =>
        t.source === Track.Source.Camera &&
        t.publication?.trackSid !== mainSpeakerTrack?.publication?.trackSid,
    );
  }, [tracks, mainSpeakerTrack]);

  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare,
  );

  const otherParticipants = tracks.filter(
    (t) =>
      String(t.participant?.identity) !== String(mentorId) &&
      t.source !== Track.Source.ScreenShare,
  );

  const activeSpeakers = otherParticipants
    .filter((t) => t.participant?.isSpeaking)
    .sort(
      (a, b) =>
        (b.participant?.lastSpokeAt?.getTime() || 0) -
        (a.participant?.lastSpokeAt?.getTime() || 0),
    );

  // Determine main focus: Screen Share > Mentor
  const mainTrack = screenShareTrack || mainSpeakerTrack || tracks[0];

  useEffect(() => {
    console.log("Track Filtering Debug:", {
      mentorId,
      tracksCount: tracks.length,
      mentorTrackFound: !!mainSpeakerTrack,
      screenShareTrackFound: !!screenShareTrack,
      mainTrackParticipant: mainTrack?.participant?.identity,
      allIdentities: tracks.map((t) => t.participant?.identity),
    });
  }, [mentorId, tracks, mainSpeakerTrack, screenShareTrack, mainTrack]);

  // Secondary track: Mentor (if screen sharing) or top active speaker
  const secondaryTrack = screenShareTrack
    ? mainSpeakerTrack
    : activeSpeakers[0];

  return (
    <LayoutContextProvider>
      <div className="flex-1 flex overflow-hidden relative bg-[#080808]">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header/Overlay Info */}
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20 flex items-center gap-3">
            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/20 flex items-center gap-2 md:gap-2.5 shadow-2xl">
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">
                Live Session
              </span>
            </div>
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
            {tracks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <OrbitalLoader variant="inline" label="Waiting for mentor..." />
                <p className="font-bold text-lg tracking-tight mt-4">
                  Preparing your session...
                </p>
              </div>
            ) : layout === "grid" ? (
              <GridLayout tracks={tracks}>
                <CustomParticipantTile />
              </GridLayout>
            ) : (
              <div className="h-full w-full flex flex-col md:flex-row gap-4">
                {/* Main Focus Area (Mentor or ScreenShare) */}
                <div
                  className={`relative border border-white/10 rounded-2xl overflow-hidden bg-black/40 shadow-2xl transition-all duration-500 flex-[1.5]`}
                >
                  <FocusLayout trackRef={mainTrack}>
                    <CustomParticipantTile />
                  </FocusLayout>
                </div>

                {/* Side Focus Area: Mentor (if sharing) and Active Speakers */}
                {(secondaryTrack || activeSpeakers.length > 1) && (
                  <div className="flex-1 flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-500 min-h-0 overflow-y-auto">
                    {secondaryTrack && (
                      <div className="flex-1 relative border border-white/10 rounded-2xl overflow-hidden bg-black/40 shadow-2xl min-h-[200px]">
                        <FocusLayout trackRef={secondaryTrack}>
                          <CustomParticipantTile />
                        </FocusLayout>
                      </div>
                    )}

                    {/* More Speakers (Carousel) if > 1 active speaker */}
                    {activeSpeakers.length >
                      (secondaryTrack === mainSpeakerTrack ? 0 : 1) && (
                      <div className="h-32 md:h-48 shrink-0">
                        <CarouselLayout
                          tracks={activeSpeakers.filter(
                            (t) => t !== secondaryTrack,
                          )}
                        >
                          <CustomParticipantTile />
                        </CarouselLayout>
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
                disabled={!canSpeak}
                minimal={true}
                onIcon={<Video className="w-5 h-5" />}
                offIcon={<VideoOff className="w-5 h-5" />}
              />
              <MediaControl
                source={Track.Source.Microphone}
                disabled={!canSpeak}
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
                          <span className="text-[10px] text-gray-500">
                            Send messages to all
                          </span>
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
                          <span className="text-[10px] text-gray-500">
                            Manage everyone
                          </span>
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
                          <span className="text-[10px] text-gray-500">
                            Change perspective
                          </span>
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
                                Record Session {isRecording ? recordingDuration : ""}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {isRecording
                                  ? "Stop cloud recording"
                                  : "Save this meeting"}
                              </span>
                            </div>
                          </button>
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
                    <div
                      className={`relative flex items-center bg-white/10 rounded-2xl border border-white/10 transition-all overflow-hidden shadow-lg ${!canSpeak ? "opacity-50 cursor-not-allowed" : "hover:border-white/30"}`}
                    >
                      <MediaControl
                        source={Track.Source.Microphone}
                        disabled={!canSpeak}
                        onIcon={<Mic className="w-5 h-5 text-white" />}
                        offIcon={<MicOff className="w-5 h-5 text-red-500" />}
                      />
                      <button
                        disabled={!canSpeak}
                        onClick={() => setShowAudioMenu(!showAudioMenu)}
                        className="px-2 py-4 hover:bg-white/10 transition-colors border-l border-white/10 disabled:hover:bg-transparent"
                      >
                        <ChevronUp
                          className={`w-4 h-4 text-gray-400 transition-transform ${showAudioMenu ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>

                    {showAudioMenu && canSpeak && (
                      <DeviceMenu
                        kind="audioinput"
                        onClose={() => setShowAudioMenu(false)}
                      />
                    )}
                  </div>

                  {/* Camera Control */}
                  <div className="relative group">
                    <div
                      className={`relative flex items-center bg-white/10 rounded-2xl border border-white/10 transition-all overflow-hidden shadow-lg ${!canSpeak ? "opacity-50 cursor-not-allowed" : "hover:border-white/30"}`}
                    >
                      <MediaControl
                        source={Track.Source.Camera}
                        disabled={!canSpeak}
                        onIcon={<Video className="w-5 h-5 text-white" />}
                        offIcon={<VideoOff className="w-5 h-5 text-red-500" />}
                      />
                      <button
                        disabled={!canSpeak}
                        onClick={() => setShowVideoMenu(!showVideoMenu)}
                        className="px-2 py-4 hover:bg-white/10 transition-colors border-l border-white/10 disabled:hover:bg-transparent"
                      >
                        <ChevronUp
                          className={`w-4 h-4 text-gray-400 transition-transform ${showVideoMenu ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>

                    {showVideoMenu && canSpeak && (
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

                  {isMentor && (
                    <ControlActionButton
                      onClick={handleToggleRecording}
                      icon={
                        <CircleDot
                          className={`w-5 h-5 ${isRecording ? "text-red-500 animate-pulse" : "text-gray-100"}`}
                        />
                      }
                      label={isRecording ? `Rec ${recordingDuration}` : "Record"}
                      isActive={isRecording}
                      activeColor="text-red-500"
                    />
                  )}
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
                          // 1. Signal everyone via metadata
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

                          // 2. Cleanup via backend (optional but good for DB)
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

                          // 3. Give time for metadata to propagate before disconnecting
                          setTimeout(() => {
                            room.disconnect();
                            window.location.href = "/";
                          }, 2000);
                        } catch (err) {
                          console.error(err);
                          room.disconnect();
                        }
                      } else {
                        room.disconnect();
                        window.location.href = "/";
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
        <ParticipantTile
          {...props}
          trackRef={trackRef}
          className="w-full h-full"
        />

        {/* Participant Name Overlay */}
        {/* <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 max-w-[calc(100%-32px)]">
          <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 w-full overflow-hidden">
            <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${p.isMicrophoneEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-bold text-white tracking-wide truncate">
              {p.name || p.identity}
            </span>
          </div>
        </div> */}
      </div>
    );
  }
}

// Helper Components for Zoom-like Controls
function MediaControl({ source, onIcon, offIcon, disabled, minimal }: any) {
  const { toggle, enabled } = useTrackToggle({ source });

  const handleToggle = async () => {
    if (disabled) {
      console.warn(`Attempted to toggle ${source} while disabled.`);
      return;
    }

    try {
      console.log(`Toggling ${source}. Current state: ${enabled}`);
      await toggle();
    } catch (err) {
      console.error(`Failed to toggle ${source}:`, err);
    }
  };

  if (minimal) {
    return (
      <button
        onClick={handleToggle}
        disabled={disabled}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ${
          enabled
            ? "bg-white/10 hover:bg-white/20"
            : "bg-white text-gray-900 border border-white"
        } ${disabled ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
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
      disabled={disabled}
      className={`px-3 py-2 md:px-5 md:py-4 transition-colors flex flex-col items-center gap-1 md:gap-1.5 min-w-[60px] md:min-w-[80px] hover:bg-white/5 disabled:hover:bg-transparent ${disabled ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
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
