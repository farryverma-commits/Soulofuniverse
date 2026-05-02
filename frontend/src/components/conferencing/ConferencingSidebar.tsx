import React, { useEffect, useState } from 'react';
import {
  useParticipants,
  useLocalParticipant,
  Chat,
  useChat,
} from '@livekit/components-react';
import { supabase } from '../../services/supabaseClient';
import { Hand, UserCheck, Users, MessageSquare } from 'lucide-react';

interface SidebarProps {
  sessionId: string;
  isMentor: boolean;
  activeTab: 'chat' | 'participants' | 'approval';
  onTabChange: (tab: 'chat' | 'participants' | 'approval') => void;
  onClose?: () => void;
}

export const ConferencingSidebar: React.FC<SidebarProps> = ({ 
  sessionId, 
  isMentor,
  activeTab,
  onTabChange,
  onClose
}) => {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const { chatMessages } = useChat();
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([]);

  // 0. Chat Persistence (Mentor only)
  useEffect(() => {
    return () => {
      if (isMentor && chatMessages.length > 0) {
        const saveChat = async () => {
          const msgs = chatMessages.map(m => ({
            sender_id: m.from?.identity,
            text: m.message,
            timestamp: m.timestamp
          }));

          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-save-chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ session_id: sessionId, messages: msgs }),
          });
        };
        saveChat();
      }
    };
  }, [isMentor, sessionId, chatMessages]);

  // 1. Hand Raised Logic
  const raisedHandParticipants = participants
    .filter(p => {
      try {
        const metadata = JSON.parse(p.metadata || '{}');
        return metadata.handRaised;
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      const metaA = JSON.parse(a.metadata || '{}');
      const metaB = JSON.parse(b.metadata || '{}');
      return (metaA.raisedAt || 0) - (metaB.raisedAt || 0);
    });

  const toggleHand = async () => {
    try {
      const metadata = JSON.parse(localParticipant.metadata || '{}');
      const isRaised = metadata.handRaised === true;
      const newMetadata = {
        ...metadata,
        handRaised: !isRaised,
        raisedAt: !isRaised ? Date.now() : null
      };
      await localParticipant.setMetadata(JSON.stringify(newMetadata));
    } catch (e) {
      console.error('Failed to toggle hand:', e);
    }
  };

  // 2. Approval Queue Logic (Mentor Only)
  useEffect(() => {
    if (!isMentor) return;

    const fetchPending = async () => {
      const { data } = await supabase
        .from('session_participants')
        .select(`
          *,
          user:profiles!session_participants_user_id_fkey(full_name)
        `)
        .eq('session_id', sessionId)
        .eq('status', 'pending');
      setPendingParticipants(data || []);
    };

    fetchPending();

    const sub = supabase
      .channel(`pending_parts_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` }, fetchPending)
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [sessionId, isMentor]);

  const handleApprove = async (userId: string) => {
    await supabase
      .from('session_participants')
      .update({ status: 'approved' })
      .eq('session_id', sessionId)
      .eq('user_id', userId);
  };

  return (
    <div className="w-full md:w-80 bg-surface-dark border-l border-white/5 flex flex-col h-full overflow-x-hidden absolute inset-0 z-40 md:relative md:z-auto">
      <div className="flex border-b border-white/5 bg-black/20">
        <TabButton active={activeTab === 'chat'} onClick={() => onTabChange('chat')} icon={<MessageSquare className="w-4 h-4" />} label="Chat" />
        <TabButton active={activeTab === 'participants'} onClick={() => onTabChange('participants')} icon={<Users className="w-4 h-4" />} label="Users" />
        {isMentor && (
          <TabButton 
            active={activeTab === 'approval'} 
            onClick={() => onTabChange('approval')} 
            icon={<UserCheck className="w-4 h-4" />} 
            label="Wait Room" 
            badge={pendingParticipants.length > 0 ? pendingParticipants.length : undefined}
          />
        )}
        <button 
          onClick={onClose}
          className="md:hidden flex items-center justify-center w-12 text-gray-400 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === 'chat' && (
          <div className="h-full flex flex-col overflow-x-hidden">
            <Chat className="flex-1" />
          </div>
        )}
        
        {activeTab === 'participants' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <button 
              onClick={toggleHand}
              className={`w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${
                JSON.parse(localParticipant.metadata || '{}').handRaised 
                ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20' 
                : 'bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              <Hand className="w-4 h-4" />
              {JSON.parse(localParticipant.metadata || '{}').handRaised ? 'Lower Hand' : 'Raise Hand'}
            </button>

            {raisedHandParticipants.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hand Raised Queue</h4>
                {raisedHandParticipants.map((p, i) => (
                  <div key={p.identity} className="flex items-center justify-between p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/40 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] font-black text-white">
                        {i + 1}
                      </div>
                      <span className="text-sm text-white font-black">{p.name || p.identity}</span>
                    </div>
                    <Hand className="w-4 h-4 text-yellow-400 fill-current" />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">All Participants ({participants.length})</h4>
              <div className="space-y-1">
                {participants.map(p => (
                  <div key={p.identity} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20" />
                    </div>
                    <span className="text-sm text-gray-200 font-medium">{p.name || p.identity}</span>
                    {p.isLocal && <span className="ml-auto text-[8px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 uppercase font-black">You</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'approval' && isMentor && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {pendingParticipants.length === 0 ? (
              <p className="text-xs text-gray-500 font-medium text-center py-10">Waiting room is empty.</p>
            ) : (
              pendingParticipants.map(part => (
                <div key={part.user_id} className="p-3 bg-white/5 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white font-bold">{part.user?.full_name || 'Anonymous'}</p>
                    <p className="text-[10px] text-gray-500">Wants to join</p>
                  </div>
                  <button 
                    onClick={() => handleApprove(part.user_id)}
                    className="p-2 bg-primary text-white rounded-lg hover:scale-105 transition-all"
                  >
                    <UserCheck className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function TabButton({ active, onClick, icon, label, badge }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 py-5 flex flex-col items-center gap-1.5 transition-all relative group ${active ? 'text-primary' : 'text-gray-400 hover:text-white'}`}
    >
      <div className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'} ${active ? 'text-primary' : 'text-gray-300'}`}>
        {icon}
      </div>
      <span className="text-[9px] font-black uppercase tracking-[0.15em]">{label}</span>
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
