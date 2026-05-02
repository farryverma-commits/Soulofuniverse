import React, { useEffect, useState } from 'react';
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
  Chat,
  useChat,
  useRoomContext,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { supabase } from '../../services/supabaseClient';
import { 
  Loader2, 
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
  Minimize
} from 'lucide-react';
import { ConferencingSidebar } from './ConferencingSidebar';

interface MeetingViewProps {
  token: string;
  serverUrl: string;
  sessionId: string;
  isMentor: boolean;
  onDisconnected: () => void;
}

export const MeetingView: React.FC<MeetingViewProps> = ({ token, serverUrl, sessionId, isMentor, onDisconnected }) => {
  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Connecting to meeting...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black overflow-hidden flex flex-col">
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        onDisconnected={onDisconnected}
        connectOptions={{ autoSubscribe: true }}
        className="flex-1 flex flex-col overflow-hidden text-white"
      >
        <MyVideoConference sessionId={sessionId} isMentor={isMentor} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
};

function MyVideoConference({ sessionId, isMentor }: { sessionId: string; isMentor: boolean }) {
  const [layout, setLayout] = useState<'grid' | 'speaker'>('speaker');
  const { localParticipant } = useLocalParticipant();
  const { metadata } = useParticipantInfo(localParticipant);
  const { chatMessages } = useChat();
  const room = useRoomContext();
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants' | 'approval'>('chat');

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
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

  const parsedMetadata = (() => {
    try {
      return JSON.parse(currentMetadata || '{}');
    } catch {
      return {};
    }
  })();

  const isHandRaised = !!parsedMetadata.handRaised;

  const toggleHand = async () => {
    if (!localParticipant) return;
    const newMetadata = {
      ...parsedMetadata,
      handRaised: !isHandRaised,
      raisedAt: !isHandRaised ? Date.now() : null
    };
    await localParticipant.setMetadata(JSON.stringify(newMetadata));
  };

  return (
    <LayoutContextProvider>
      <div className="flex-1 flex overflow-hidden relative bg-[#080808]">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header/Overlay Info */}
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-20 flex items-center gap-3">
             <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/20 flex items-center gap-2 md:gap-2.5 shadow-2xl">
                <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                <span className="text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">Live Session</span>
             </div>
          </div>

          <div className="flex-1 overflow-hidden p-4 md:p-6 mb-24 md:mb-28">
            {tracks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Loader2 className="w-10 h-10 animate-spin mb-6 text-primary" />
                <p className="font-bold text-lg tracking-tight">Preparing your session...</p>
              </div>
            ) : layout === 'grid' ? (
              <GridLayout tracks={tracks}>
                <CustomParticipantTile />
              </GridLayout>
            ) : (
              <div className="h-full flex flex-col gap-6">
                <div className="flex-1 min-h-0">
                  <FocusLayout trackRef={tracks.find(t => t.source === Track.Source.ScreenShare) || tracks[0]}>
                    <CustomParticipantTile />
                  </FocusLayout>
                </div>
                {tracks.length > 1 && (
                  <div className="h-44 shrink-0">
                    <CarouselLayout tracks={tracks.filter(t => t.source !== Track.Source.ScreenShare)}>
                      <CustomParticipantTile />
                    </CarouselLayout>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zoom-like Bottom Bar - Enhanced Contrast */}
          <div className="absolute bottom-0 left-0 right-0 z-20 px-2 py-3 md:px-8 md:py-5 bg-[#121212] border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.6)]">
             <div className="max-w-screen-2xl mx-auto flex items-center justify-between md:gap-4 overflow-x-auto no-scrollbar w-full">
                {/* Left: Audio/Video Toggles */}
                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                   <div className="relative flex items-center bg-white/10 rounded-2xl border border-white/10 hover:border-white/30 transition-all overflow-hidden shadow-lg">
                      <MediaControl 
                        participant={localParticipant} 
                        source={Track.Source.Microphone}
                        onIcon={<Mic className="w-5 h-5 text-white" />}
                        offIcon={<MicOff className="w-5 h-5 text-red-500" />}
                      />
                      <button 
                        onClick={() => setShowAudioMenu(!showAudioMenu)}
                        className="px-2 py-4 hover:bg-white/10 transition-colors border-l border-white/10"
                      >
                        <ChevronUp className={`w-4 h-4 text-gray-400 transition-transform ${showAudioMenu ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {showAudioMenu && (
                        <DeviceMenu 
                          kind="audioinput" 
                          onClose={() => setShowAudioMenu(false)} 
                        />
                      )}
                   </div>

                   <div className="relative flex items-center bg-white/10 rounded-2xl border border-white/10 hover:border-white/30 transition-all overflow-hidden shadow-lg">
                      <MediaControl 
                        participant={localParticipant} 
                        source={Track.Source.Camera}
                        onIcon={<Video className="w-5 h-5 text-white" />}
                        offIcon={<VideoOff className="w-5 h-5 text-red-500" />}
                      />
                      <button 
                        onClick={() => setShowVideoMenu(!showVideoMenu)}
                        className="px-2 py-4 hover:bg-white/10 transition-colors border-l border-white/10"
                      >
                        <ChevronUp className={`w-4 h-4 text-gray-400 transition-transform ${showVideoMenu ? 'rotate-180' : ''}`} />
                      </button>

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
                       if (showSidebar && sidebarTab === 'chat') {
                         setShowSidebar(false);
                       } else {
                         setSidebarTab('chat');
                         setShowSidebar(true);
                       }
                     }}
                     icon={<MessageSquare className="w-5 h-5" />}
                     label="Chat"
                     isActive={showSidebar && sidebarTab === 'chat'}
                    />

                    <ControlActionButton 
                     onClick={() => {
                       if (showSidebar && sidebarTab === 'participants') {
                         setShowSidebar(false);
                       } else {
                         setSidebarTab('participants');
                         setShowSidebar(true);
                       }
                     }}
                     icon={<Users className="w-5 h-5" />}
                     label="People"
                     isActive={showSidebar && sidebarTab === 'participants'}
                    />

                    <ControlActionButton 
                     onClick={() => setLayout(layout === 'grid' ? 'speaker' : 'grid')}
                    icon={layout === 'grid' ? <User className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
                    label={layout === 'grid' ? 'Speaker' : 'Grid'}
                    isActive={false}
                   />
                   
                   <ControlActionButton 
                    onClick={toggleHand}
                    icon={<Hand className={`w-5 h-5 ${isHandRaised ? 'text-yellow-400 fill-current' : 'text-gray-100'}`} />}
                    label="Raise Hand"
                    isActive={isHandRaised}
                    activeColor="text-yellow-400"
                   />

                   <ControlActionButton 
                    onClick={async () => {
                      const isEnabled = localParticipant?.isScreenShareEnabled;
                      await localParticipant?.setScreenShareEnabled(!isEnabled);
                    }}
                    icon={<MonitorUp className={`w-5 h-5 ${localParticipant?.isScreenShareEnabled ? 'text-green-400' : 'text-gray-100'}`} />}
                    label="Share Screen"
                    isActive={localParticipant?.isScreenShareEnabled}
                    activeColor="text-green-400"
                   />
                </div>

                 <div className="flex items-center gap-2 md:gap-4 shrink-0">
                    <ControlActionButton 
                      onClick={toggleFullscreen}
                      icon={isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                      label={isFullscreen ? "Exit Full" : "Full Screen"}
                      isActive={isFullscreen}
                      activeColor="text-white"
                    />

                    <button 
                     onClick={async () => {
                       if (isMentor) {
                         // Save chat explicitly before closing
                         if (chatMessages.length > 0) {
                           try {
                             const msgs = chatMessages.map(m => ({
                               sender_id: m.from?.identity,
                               text: m.message,
                               timestamp: m.timestamp
                             }));
                             
                             const { data: authData } = await supabase.auth.getSession();
                             await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-save-chat`, {
                               method: 'POST',
                               headers: {
                                 'Content-Type': 'application/json',
                                 'Authorization': `Bearer ${authData.session?.access_token}`,
                               },
                               body: JSON.stringify({ session_id: sessionId, messages: msgs }),
                             });
                           } catch (err) {
                             console.error("Failed to save chat:", err);
                           }
                         }

                         // End the meeting globally
                         try {
                           const { data: authData } = await supabase.auth.getSession();
                           await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`, {
                             method: 'POST',
                             headers: {
                               'Content-Type': 'application/json',
                               'Authorization': `Bearer ${authData.session?.access_token}`,
                             },
                             body: JSON.stringify({ session_id: sessionId, action: 'end' }),
                           });
                         } catch (err) {
                           console.error("Failed to end session:", err);
                         }
                       }

                       try {
                         room.disconnect();
                       } catch (e) {
                         console.error(e);
                       }
                       onDisconnected();
                     }}
                     className="w-12 h-12 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all shadow-xl shadow-red-600/40 flex items-center justify-center active:scale-90"
                     title={isMentor ? "End Meeting" : "Leave Meeting"}
                    >
                      <LogOut className="w-6 h-6 rotate-180" />
                    </button>
                </div>
             </div>
          </div>
        </div>
        
        {/* Sidebar for Chat, Participants, Approval */}
        {showSidebar && (
          <ConferencingSidebar 
            sessionId={sessionId} 
            isMentor={isMentor} 
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            onClose={() => setShowSidebar(false)}
          />
        )}
      </div>
    </LayoutContextProvider>
  );
}

// Custom Participant Tile to show Hand Raised
function CustomParticipantTile(props: any) {
  const p = props.participant || props.trackRef?.participant;
  const { metadata: hookMetadata } = useParticipantInfo(p);
  const currentMetadata = hookMetadata || p?.metadata;

  const isHandRaised = (() => {
    try {
      return JSON.parse(currentMetadata || '{}').handRaised === true;
    } catch {
      return false;
    }
  })();

  return (
    <div className="relative w-full h-full group">
      <ParticipantTile {...props} />
      {isHandRaised && (
        <div className="absolute top-4 left-4 z-30 animate-bounce">
          <div className="bg-yellow-500 text-white p-2.5 rounded-full shadow-[0_0_20px_rgba(234,179,8,0.5)] border-2 border-white/20">
            <Hand className="w-5 h-5 fill-current" />
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components for Zoom-like Controls
function MediaControl({ participant, source, onIcon, offIcon }: any) {
  const isEnabled = source === Track.Source.Microphone 
    ? participant?.isMicrophoneEnabled 
    : participant?.isCameraEnabled;

  const toggle = async () => {
    if (source === Track.Source.Microphone) {
      await participant?.setMicrophoneEnabled(!isEnabled);
    } else {
      await participant?.setCameraEnabled(!isEnabled);
    }
  };

  return (
    <button onClick={toggle} className="px-3 py-2 md:px-5 md:py-4 hover:bg-white/5 transition-colors flex flex-col items-center gap-1 md:gap-1.5 min-w-[60px] md:min-w-[80px]">
      <div className="mb-0.5">
        {isEnabled ? onIcon : offIcon}
      </div>
      <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest ${isEnabled ? 'text-gray-300' : 'text-red-500'}`}>
        {source === Track.Source.Microphone ? (isEnabled ? 'Mute' : 'Unmute') : (isEnabled ? 'Stop' : 'Start')}
      </span>
    </button>
  );
}

function ControlActionButton({ icon, label, onClick, isActive, activeColor = "text-white" }: any) {
  return (
    <button 
      onClick={onClick}
      className={`px-2 py-2 md:px-4 md:py-3 rounded-2xl flex flex-col items-center gap-1 md:gap-1.5 transition-all hover:bg-white/10 min-w-[60px] md:min-w-[80px] group ${isActive ? 'bg-white/15 shadow-inner' : ''}`}
    >
      <div className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? activeColor : 'text-gray-100'}`}>
        {icon}
      </div>
      <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] transition-colors ${isActive ? activeColor : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}

function DeviceMenu({ kind, onClose }: { kind: MediaDeviceKind; onClose: () => void }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  
  return (
    <div className="absolute bottom-full left-0 mb-4 w-64 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-up">
      <div className="px-4 py-3 border-b border-white/5 bg-white/5">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          Select {kind === 'audioinput' ? 'Microphone' : 'Camera'}
        </span>
      </div>
      <div className="py-2 max-h-64 overflow-y-auto">
        {devices.map((device) => (
          <button
            key={device.deviceId}
            onClick={() => {
              setActiveMediaDevice(device.deviceId);
              onClose();
            }}
            className={`w-full px-4 py-2.5 text-left text-xs transition-colors flex items-center justify-between group ${
              device.deviceId === activeDeviceId ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <span className="truncate pr-4">{device.label || `Device ${device.deviceId.slice(0, 5)}`}</span>
            {device.deviceId === activeDeviceId && (
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
