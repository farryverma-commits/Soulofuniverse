import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  useParticipants,
  useLocalParticipant,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { supabase } from "../../services/supabaseClient";
import { Hand, UserCheck, Users, MessageSquare, MicOff } from "lucide-react";
import { PersistentChat } from "./PersistentChat";

interface SidebarProps {
  sessionId: string;
  isMentor: boolean;
  activeTab: "chat" | "participants" | "approval";
  onTabChange: (tab: "chat" | "participants" | "approval") => void;
  onMuteAll?: () => void;
  chatMessages: any[];
  sendChat: (msg: string) => Promise<any>;
  onClose?: () => void;
  isSending?: boolean;
}

export const ConferencingSidebar: React.FC<SidebarProps> = ({
  sessionId,
  isMentor,
  activeTab,
  onTabChange,
  onMuteAll,
  chatMessages,
  sendChat,
  onClose,
  isSending,
}) => {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadApproval, setUnreadApproval] = useState(0);
  const prevMessageCountRef = useRef(chatMessages.length);
  const prevPendingCountRef = useRef(0);

  // Fetch camera tracks to provide explicit trackRef to mini-tiles
  // const cameraTracks = useTracks([
  //   { source: Track.Source.Camera, withPlaceholder: false },
  // ]);

  const localMetadata = useMemo(() => {
    try {
      return JSON.parse(localParticipant?.metadata || "{}");
    } catch {
      return {};
    }
  }, [localParticipant?.metadata]);

  // Notification tracking: new chat messages
  useEffect(() => {
    if (
      activeTab !== "chat" &&
      chatMessages.length > prevMessageCountRef.current
    ) {
      setUnreadChat(
        (c) => c + (chatMessages.length - prevMessageCountRef.current),
      );
    }
    prevMessageCountRef.current = chatMessages.length;
  }, [chatMessages.length, activeTab]);

  // Notification tracking: new waiting room entries
  useEffect(() => {
    if (
      activeTab !== "approval" &&
      pendingParticipants.length > prevPendingCountRef.current
    ) {
      setUnreadApproval(
        (c) => c + (pendingParticipants.length - prevPendingCountRef.current),
      );
    }
    prevPendingCountRef.current = pendingParticipants.length;
  }, [pendingParticipants.length, activeTab]);

  // Clear unread counts when tab is opened
  useEffect(() => {
    if (activeTab === "chat") setUnreadChat(0);
    if (activeTab === "approval") setUnreadApproval(0);
  }, [activeTab]);

  // Memoize participant metadata to avoid 200+ JSON.parse per render
  const participantMeta = useMemo(() => {
    const map = new Map<string, any>();
    participants.forEach((p) => {
      try {
        map.set(p.identity, JSON.parse(p.metadata || "{}"));
      } catch {
        map.set(p.identity, {});
      }
    });
    return map;
  }, [participants]);

  // 1. Hand Raised Logic
  const raisedHandParticipants = useMemo(
    () =>
      participants
        .filter((p) => participantMeta.get(p.identity)?.handRaised)
        .sort((a, b) => {
          const metaA = participantMeta.get(a.identity);
          const metaB = participantMeta.get(b.identity);
          return (metaA?.raisedAt || 0) - (metaB?.raisedAt || 0);
        }),
    [participants, participantMeta],
  );

  const toggleHand = async () => {
    if (!localParticipant) return;
    try {
      const isRaised = localMetadata.handRaised === true;
      const newMetadata = {
        ...localMetadata,
        handRaised: !isRaised,
        raisedAt: !isRaised ? Date.now() : null,
      };
      await localParticipant.setMetadata(JSON.stringify(newMetadata));
    } catch (e) {
      console.error("Failed to toggle hand:", e);
    }
  };

  // 2. Approval Queue Logic (Mentor Only)
  useEffect(() => {
    if (!isMentor) return;

    const fetchPending = async () => {
      const { data } = await supabase
        .from("session_participants")
        .select(
          `
          *,
          user:profiles!session_participants_user_id_fkey(full_name)
        `,
        )
        .eq("session_id", sessionId)
        .eq("status", "pending");
      setPendingParticipants(data || []);
    };

    fetchPending();

    const sub = supabase
      .channel(`pending_parts_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        fetchPending,
      )
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, [sessionId, isMentor]);

  const handleApprove = async (userId: string) => {
    await supabase
      .from("session_participants")
      .update({ status: "approved" })
      .eq("session_id", sessionId)
      .eq("user_id", userId);
    setPendingParticipants((prev) => prev.filter((p) => p.user_id !== userId));
  };

  const handleReject = async (userId: string) => {
    await supabase
      .from("session_participants")
      .update({ status: "rejected" })
      .eq("session_id", sessionId)
      .eq("user_id", userId);
    setPendingParticipants((prev) => prev.filter((p) => p.user_id !== userId));
  };

  return (
    <div className="w-full md:w-80 bg-[#0F0F10] border-l border-white/5 flex flex-col h-full overflow-x-hidden absolute inset-0 z-40 md:relative md:z-auto">
      <div className="flex border-b border-white/5 bg-black/20">
        <TabButton
          active={activeTab === "chat"}
          onClick={() => onTabChange("chat")}
          icon={<MessageSquare className="w-4 h-4" />}
          label="Chat"
          badge={unreadChat > 0 ? unreadChat : undefined}
        />
        <TabButton
          active={activeTab === "participants"}
          onClick={() => onTabChange("participants")}
          icon={<Users className="w-4 h-4" />}
          label="Users"
        />
        {isMentor && (
          <TabButton
            active={activeTab === "approval"}
            onClick={() => onTabChange("approval")}
            icon={<UserCheck className="w-4 h-4" />}
            label="Wait Room"
            badge={
              pendingParticipants.length > 0
                ? pendingParticipants.length
                : undefined
            }
            notification={unreadApproval > 0}
          />
        )}
        <button
          onClick={onClose}
          className="md:hidden flex items-center justify-center w-12 shrink-0 text-gray-400 hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <PersistentChat
              messages={chatMessages}
              onSendMessage={sendChat}
              isSending={isSending}
              localParticipantIdentity={localParticipant?.identity}
            />
          </div>
        )}

        {activeTab === "participants" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* <button 
              onClick={toggleHand}
              className={`w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${
                localMetadata.handRaised 
                ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20' 
                : 'bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              <Hand className="w-4 h-4" />
              {localMetadata.handRaised ? 'Lower Hand' : 'Raise Hand'}
            </button> */}

            {raisedHandParticipants.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Hand Raised Queue
                </h4>
                {raisedHandParticipants.map((p, i) => (
                  <div
                    key={p.identity || i}
                    className="flex items-center justify-between p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/40 shadow-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                        {i + 1}
                      </div>
                      <span className="text-sm text-white font-black leading-tight truncate">
                        {p.name || p.identity || "Anonymous"}
                      </span>
                    </div>
                    {isMentor && (
                      <button
                        onClick={async () => {
                          const encoder = new TextEncoder();
                          const data = encoder.encode(
                            JSON.stringify({
                              action: "LOWER_HAND",
                              target: p.identity,
                            }),
                          );
                          await localParticipant?.publishData(data, {
                            reliable: true,
                          });
                        }}
                        className="px-3 py-1.5 bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 text-[9px] font-bold rounded-lg shrink-0 ml-2 transition-colors"
                      >
                        Lower
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  All Participants ({participants.length})
                </h4>
                {isMentor && onMuteAll && (
                  <button
                    onClick={onMuteAll}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-all"
                  >
                    <MicOff className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase">
                      Mute All
                    </span>
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {participants.map((p, i) => {
                  const pMetadata = participantMeta.get(p.identity) || {};
                  const isPublishingVideo = p.isCameraEnabled;

                  return (
                    <div
                      key={p.identity || i}
                      className="flex flex-col gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${p.isMicrophoneEnabled ? "bg-green-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" : "bg-gray-600"}`}
                        />
                        <span className="text-sm text-gray-200 font-medium leading-tight">
                          {p.name || p.identity || "Anonymous"}
                        </span>
                        {p.isLocal && (
                          <span className="ml-auto text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 uppercase font-black">
                            You
                          </span>
                        )}
                      </div>

                      {/* Mini Video Tile if publishing and not main speaker */}
                      {/* {isPublishingVideo && !p.isLocal && (
                        <div className="w-full aspect-video rounded-lg overflow-hidden border border-white/10 bg-black/40 mt-1">
                          <VideoTrack
                            trackRef={cameraTracks.find(
                              (t) => t.participant.identity === p.identity,
                            )}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )} */}

                      {isMentor && !p.isLocal && pMetadata.handRaised && (
                        <div className="flex items-center gap-2 mt-1 pt-1 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={async () => {
                              const encoder = new TextEncoder();
                              const data = encoder.encode(
                                JSON.stringify({
                                  action: "LOWER_HAND",
                                  target: p.identity,
                                }),
                              );
                              await localParticipant.publishData(data, {
                                reliable: true,
                              });
                            }}
                            className="px-2 py-1 bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 text-[9px] font-bold rounded"
                          >
                            Lower Hand
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "approval" && isMentor && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {pendingParticipants.length === 0 ? (
              <p className="text-xs text-gray-500 font-medium text-center py-10">
                Waiting room is empty.
              </p>
            ) : (
              pendingParticipants.map((part) => (
                <div
                  key={part.user_id}
                  className="p-3 bg-white/5 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs text-white font-bold">
                      {part.user?.full_name || "Anonymous"}
                    </p>
                    <p className="text-[10px] text-gray-500">Wants to join</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(part.user_id)}
                      className="p-2 bg-primary text-white rounded-lg hover:scale-105 transition-all"
                      title="Approve"
                    >
                      <UserCheck className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleReject(part.user_id)}
                      className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 hover:scale-105 transition-all"
                      title="Reject"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function TabButton({ active, onClick, icon, label, badge, notification }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-5 flex flex-col items-center gap-1.5 transition-all relative group ${active ? "text-primary" : "text-gray-400 hover:text-white"}`}
    >
      <div className="relative">
        <div
          className={`transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-105"} ${active ? "text-primary" : "text-gray-300"}`}
        >
          {icon}
        </div>
        {notification && !active && (
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0F0F10] animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
        )}
      </div>
      <span className="text-[9px] font-black uppercase tracking-[0.15em]">
        {label}
      </span>
      {active && (
        <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full shadow-[0_0_10px_rgba(33,150,243,0.5)]" />
      )}
      {badge && (
        <span className="absolute top-3 right-4 min-w-[14px] h-[14px] bg-red-500 text-white text-[7px] font-black rounded-full flex items-center justify-center px-1 shadow-lg border border-surface-dark">
          {badge}
        </span>
      )}
    </button>
  );
}
