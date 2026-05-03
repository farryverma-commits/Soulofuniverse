import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { MeetingView } from '../../components/conferencing/MeetingView';
import { ShieldAlert, Lock } from 'lucide-react';
import { OrbitalLoader } from '../../components/OrbitalLoader';

export const MeetingPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isMentor, setIsMentor] = useState(false);
  const [status, setStatus] = useState<'loading' | 'waiting' | 'ready' | 'error' | 'not_started'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const checkSessionAndJoin = async () => {
      console.log('Starting checkSessionAndJoin for:', sessionId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        // 1. Fetch session details
        const { data: session, error: sessionError } = await supabase
          .from('group_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError || !session) {
          setStatus('error');
          setErrorMsg('Meeting session not found.');
          return;
        }

        if (session.status !== 'live') {
          setStatus('not_started');
          return;
        }

        setIsMentor(session.mentor_id === user.id);

        // 2. Try to get token
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-get-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await response.json();

        if (response.ok) {
          console.log('Token received successfully');
          
          // Mark user as officially joined
          await supabase.from('session_participants').upsert({
            session_id: sessionId,
            user_id: user.id,
            status: 'joined',
            joined_at: new Date().toISOString()
          });

          setToken(data.participant_token);
          setServerUrl(data.server_url);
          setStatus('ready');
        } else {
          console.error('Token request failed:', data);
          if (data.error?.includes('Approval required')) {
            setStatus('waiting');
            // Request approval if not already done
            await supabase.from('session_participants').upsert({
              session_id: sessionId,
              user_id: user.id,
              status: 'pending'
            });
          } else {
            setStatus('error');
            setErrorMsg(data.error || 'Failed to join meeting.');
          }
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setErrorMsg('An unexpected error occurred.');
      }
    };

    checkSessionAndJoin();

    // Subscribe to session_participants for approval
    const subscription = supabase
      .channel(`session_participants_${sessionId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'session_participants',
        filter: `session_id=eq.${sessionId}` 
      }, (payload) => {
        if (payload.new.status === 'approved') {
          checkSessionAndJoin(); // Retry getting token
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, navigate]);

  if (status === 'loading') {
    return <OrbitalLoader variant="page" label="Connecting to Session..." />;
  }

  if (status === 'not_started') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface-light px-4 text-center">
        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-black text-dark tracking-tight mb-2">
          {isMentor ? 'Ready to Start?' : 'Meeting Not Started'}
        </h2>
        <p className="text-gray-500 max-w-sm font-medium">
          {isMentor 
            ? 'You are the host of this masterclass. Click below to go live and allow participants to join.'
            : "The host hasn't started this meeting yet. Please wait or check back later."}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          {isMentor && (
            <button 
              disabled={isStarting}
              onClick={async () => {
                setIsStarting(true);
                const { data: { session } } = await supabase.auth.getSession();
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                  },
                  body: JSON.stringify({ session_id: sessionId, action: 'start' }),
                });
                if (response.ok) {
                  window.location.reload();
                } else {
                  const err = await response.json();
                  alert(`Error starting session: ${err.error}`);
                  setIsStarting(false);
                }
              }}
              className="px-8 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-xl shadow-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStarting ? <OrbitalLoader variant="button" /> : 'Start Session Now'}
            </button>
          )}
          <button 
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-white text-dark border-2 border-gray-100 rounded-xl font-black text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface-light px-4 text-center">
        <div className="w-20 h-20 bg-yellow-50 rounded-3xl flex items-center justify-center mb-6">
          <OrbitalLoader variant="inline" label="Waiting for host..." />
        </div>
        <h2 className="text-3xl font-black text-dark tracking-tight mb-2">Waiting for Approval</h2>
        <p className="text-gray-500 max-w-sm font-medium">
          The meeting requires host approval. You'll enter automatically once approved.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface-light px-4 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-black text-dark tracking-tight mb-2">Connection Error</h2>
        <p className="text-red-500 max-w-sm font-bold">{errorMsg}</p>
        <button 
          onClick={() => navigate('/')}
          className="mt-8 px-8 py-3 bg-dark text-white rounded-xl font-black text-sm"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <MeetingView 
      token={token!} 
      serverUrl={serverUrl!} 
      sessionId={sessionId!}
      isMentor={isMentor}
      onDisconnected={() => navigate('/')} 
    />
  );
};
