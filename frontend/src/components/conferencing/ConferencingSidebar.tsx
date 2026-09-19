import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  useParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { Hand, Users, MessageSquare, MicOff, ChevronDown } from "lucide-react";
import { PersistentChat } from "./PersistentChat";

interface SidebarProps {
  sessionId: string;
  isMentor: boolean;
  isAdmin?: boolean;
  activeTab: "chat" | "participants";
  onTabChange: (tab: "chat" | "participants") => void;
  onMuteAll?: () => void;
  chatMessages: any[];
  sendChat: (msg: string) => Promise<any>;
  onClose?: () => void;
  isSending?: boolean;
  raisedHandQueue?: { identity: string; name?: string }[];
  turnIdentity?: string | null;
}

export const ConferencingSidebar: React.FC<SidebarProps> = ({
  sessionId,
  isMentor,
  isAdmin = false,
  activeTab,
  onTabChange,
  onMuteAll,
  chatMessages,
  sendChat,
  onClose,
  isSending,
  raisedHandQueue,
  turnIdentity,
}) => {
  const isHost = isMentor || isAdmin;
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [unreadChat, setUnreadChat] = useState(0);
  const prevMessageCountRef = useRef(chatMessages.length);
  // Expandable panels: queue open by default, full roster closed by default.
  const [queueOpen, setQueueOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(false);

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

  // Clear unread counts when tab is opened
  useEffect(() => {
    if (activeTab === "chat") setUnreadChat(0);
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

  // 1. Hand Raised Logic — single source of truth lives in MeetingView
  // (passed as props so sidebar + turn banner can't drift apart); falls back
  // to local computation when rendered without them.
  const localRaisedHandParticipants = useMemo(
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
  const raisedHandParticipants = useMemo(() => {
    if (raisedHandQueue) {
      const byIdentity = new Map(participants.map((p) => [p.identity, p]));
      return raisedHandQueue
        .map((q) => byIdentity.get(q.identity))
        .filter((p): p is (typeof participants)[number] => !!p);
    }
    return localRaisedHandParticipants;
  }, [raisedHandQueue, participants, localRaisedHandParticipants]);
  const currentTurnIdentity =
    turnIdentity !== undefined
      ? turnIdentity
      : (raisedHandParticipants[0]?.identity ?? null);

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


  return (
    <div className="w-full md:w-80 bg-[#0F0F10] border-l border-white/5 flex flex-col h-[100dvh] md:h-full overflow-hidden fixed inset-0 z-40 md:relative md:inset-auto md:z-auto pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] md:pt-0 md:pb-0">
      <div className="flex items-center border-b border-white/5 bg-black/20 pr-[max(0.5rem,env(safe-area-inset-right,0px))]">
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
        <button
          onClick={onClose}
          aria-label="Close sidebar"
          className="md:hidden flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-colors border border-white/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
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

            <div className="space-y-3">
              <PanelHeader
                open={queueOpen}
                onToggle={() => setQueueOpen((o) => !o)}
                label="Hand Raised Queue"
                count={raisedHandParticipants.length}
                controlsId="hand-raised-queue"
              />
              {queueOpen && (
                <div id="hand-raised-queue" className="space-y-3">
                  {raisedHandParticipants.length === 0 ? (
                    <p className="text-xs text-gray-500 px-2">
                      No hands raised. Students appear here in order.
                    </p>
                  ) : (
                    raisedHandParticipants.map((p, i) => {
                      const isTurn =
                        currentTurnIdentity != null &&
                        p.identity === currentTurnIdentity;
                      return (
                        <div
                          key={p.identity || i}
                          className={`flex items-center justify-between p-3 rounded-xl border shadow-lg ${
                            isTurn
                              ? "bg-yellow-500/15 border-primary shadow-[0_0_15px_rgba(212,168,83,0.25)]"
                              : "bg-yellow-500/10 border-yellow-500/40"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                              {i + 1}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm text-white font-black leading-tight truncate block">
                                {p.name || p.identity || "Anonymous"}
                              </span>
                              {isTurn && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                                  Current turn
                                </span>
                              )}
                            </div>
                          </div>
                          {isHost && (
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
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <PanelHeader
                    open={allOpen}
                    onToggle={() => setAllOpen((o) => !o)}
                    label="All Participants"
                    count={participants.length}
                    controlsId="all-participants"
                  />
                </div>
                {isHost && onMuteAll && (
                  <button
                    onClick={onMuteAll}
                    className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-all shrink-0"
                  >
                    <MicOff className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase">
                      Mute All
                    </span>
                  </button>
                )}
              </div>
              {allOpen && (
              <div id="all-participants" className="space-y-1">
                {(() => {
                  const sortedParticipants = [...participants].sort((a, b) => {
                    if (a.isMicrophoneEnabled !== b.isMicrophoneEnabled) {
                      return a.isMicrophoneEnabled ? -1 : 1;
                    }
                    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
                    return (a.name || a.identity || "").localeCompare(b.name || b.identity || "");
                  });
                  return sortedParticipants.map((p, i) => {
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
                        {isHost && !p.isLocal && p.isMicrophoneEnabled && (
                          <button
                            onClick={async () => {
                              const encoder = new TextEncoder();
                              const data = encoder.encode(
                                JSON.stringify({
                                  action: "MUTE_USER",
                                  target: p.identity,
                                }),
                              );
                              await localParticipant.publishData(data, {
                                reliable: true,
                              });
                            }}
                            className="ml-auto p-1.5 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/40 transition-colors"
                            title="Mute"
                          >
                            <MicOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.isLocal && (
                          <span className="ml-auto text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 uppercase font-black">
                            You
                          </span>
                        )}
                      </div>

                      {isHost && !p.isLocal && pMetadata.handRaised && (
                        <div className="flex items-center gap-2 mt-1 pt-1 border-t border-white/5 transition-opacity">
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
                });
              })()}
              </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

function PanelHeader({
  open,
  onToggle,
  label,
  count,
  controlsId,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  controlsId: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
      className="w-full flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
    >
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
        {label} ({count})
      </span>
      <ChevronDown
        className={`w-4 h-4 text-gray-500 transition-transform ${open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

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
