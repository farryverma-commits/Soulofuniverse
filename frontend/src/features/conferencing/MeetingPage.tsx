import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../../store";
import { supabase } from "../../services/supabaseClient";
import { MeetingView } from "../../components/conferencing/MeetingView";
import { ShieldAlert, Lock, Video } from "lucide-react";
import { OrbitalLoader } from "../../components/OrbitalLoader";

export const MeetingPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isMentor, setIsMentor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const role = useSelector((s: RootState) => s.auth.role);
  const isHost = isMentor || isAdmin;
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "not_started" | "permissions"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  // Mirrors `token` so the realtime handlers (which close over the first-render
  // value) can check "already joined" without capturing a stale null.
  const hasTokenRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    // Guard against concurrent checkSessionAndJoin calls (mount + realtime
    // re-fires + rapid rejoin) that would each mint a token for the same identity
    // and collide as DUPLICATE_IDENTITY on LiveKit.
    const joiningRef = { current: false };
    let abortController: AbortController | null = null;
    let realtimeDebounce: ReturnType<typeof setTimeout> | null = null;

    let sessionSub: ReturnType<typeof supabase.channel> | null = null;

    const cleanupRealtimeChannels = () => {
      sessionSub?.unsubscribe();
      sessionSub = null;
    };

    const checkSessionAndJoin = async (signal?: AbortSignal) => {
      if (joiningRef.current) return;
      joiningRef.current = true;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          navigate("/login");
          return;
        }

        const { data: session, error: sessionError } = await supabase
          .from("group_sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (sessionError || !session) {
          setStatus("error");
          setErrorMsg("Meeting session not found.");
          return;
        }
        if (session.status !== "live") {
          setStatus("not_started");
          return;
        }

        const isAdminVal = role === "admin";
        setIsMentor(session.mentor_id === user.id);
        setIsAdmin(isAdminVal);
        setMentorId(session.mentor_id);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-get-token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ session_id: sessionId }),
          },
        );

        if (signal?.aborted) return;

        const data = await response.json();

        if (response.ok) {
          await supabase.from("session_participants").upsert(
            {
              session_id: sessionId,
              user_id: user.id,
              status: "joined",
              joined_at: new Date().toISOString(),
            },
            {
              onConflict: "session_id,user_id",
            },
          );
          setToken(data.participant_token);
          hasTokenRef.current = true;
          setServerUrl(data.server_url);
          setStatus("permissions");
          cleanupRealtimeChannels();
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Failed to join meeting.");
        }
      } catch (err) {
        if (!signal?.aborted) {
          setStatus("error");
          setErrorMsg("An unexpected error occurred.");
        }
      } finally {
        // Only release the guard if this invocation wasn't superseded/aborted.
        if (!signal?.aborted) joiningRef.current = false;
      }
    };

    // Realtime re-fires are debounced so an `approved` + `live` pair (or duplicate
    // events) don't each trigger a separate token request.
    const debouncedJoin = () => {
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      realtimeDebounce = setTimeout(() => {
        // Supersede any in-flight checkSessionAndJoin — aborting the prior
        // controller lets its catch/finally see signal.aborted and skip state
        // mutations, instead of letting a stale fetch land after the newer one.
        abortController?.abort();
        abortController = new AbortController();
        checkSessionAndJoin(abortController.signal);
      }, 500);
    };

    // Give the initial call its own signal so the unmount cleanup can abort it
    // (and so a teardown can't be followed by a late setStatus/setToken).
    abortController = new AbortController();
    checkSessionAndJoin(abortController.signal);

    sessionSub = supabase
      .channel(`group_session_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          // Only re-run join when we're not already connected/joining (the `live`
          // event is only needed before the initial join, not on every update).
          const needsInitialJoin =
            payload.new.status === "live" &&
            !hasTokenRef.current &&
            !joiningRef.current;
          if (needsInitialJoin) {
            debouncedJoin();
          }
        },
      )
      .subscribe();

    return () => {
      if (realtimeDebounce) clearTimeout(realtimeDebounce);
      if (abortController) abortController.abort();
      joiningRef.current = false;
      cleanupRealtimeChannels();
    };
  }, [sessionId, navigate, role]);

  if (status === "loading") {
    return <OrbitalLoader variant="page" label="Connecting to session..." />;
  }

  if (status === "not_started") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4 text-center">
        <div className="w-14 h-14 bg-primary-light rounded-lg flex items-center justify-center mb-4">
          <Lock size={24} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text mb-1">
          {isHost ? "Ready to start?" : "Meeting not started"}
        </h2>
        <p className="text-text-secondary text-sm max-w-sm">
          {isHost
            ? isAdmin
              ? "You are joining as Admin co-host. Start the session on behalf of the mentor."
              : "You are the host. Click below to go live and allow participants to join."
            : "The host hasn't started this meeting yet. Please wait or check back later."}
        </p>
        <div className="flex gap-3 mt-6">
          {isHost && (
            <button
              disabled={isStarting}
              onClick={async () => {
                setIsStarting(true);
                const {
                  data: { session },
                } = await supabase.auth.getSession();
                const response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({
                      session_id: sessionId,
                      action: "start",
                    }),
                  },
                );
                if (response.ok) window.location.reload();
                else {
                  const err = await response.json();
                  alert(`Error: ${err.error}`);
                  setIsStarting(false);
                }
              }}
              className="btn-primary text-sm"
            >
              {isStarting ? (
                <OrbitalLoader variant="button" />
              ) : (
                "Start session now"
              )}
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="btn-secondary text-sm"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  // if (status === 'permissions') {
  //   const isSecure = window.isSecureContext
  //   const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

  //   return (
  //     <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4 text-center">
  //       <div className="w-14 h-14 bg-primary-light rounded-lg flex items-center justify-center mb-4">
  //         <Video size={24} className="text-primary" />
  //       </div>
  //       <h2 className="text-xl font-bold text-text mb-1">Ready to join?</h2>
  //       <p className="text-text-secondary text-sm max-w-sm mb-6">
  //         {!isSecure
  //           ? "You are using an insecure connection (HTTP). Camera/mic access requires HTTPS."
  //           : "Soul of Universe needs access to your camera and microphone for the session."}
  //       </p>
  //       <div className="flex flex-col gap-2 w-full max-w-xs">
  //         <button
  //           onClick={async () => {
  //             if (!hasMediaDevices) { setStatus('error'); setErrorMsg('Your browser does not support camera/mic access.'); return }
  //             try {
  //               await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  //               setStatus('ready')
  //             } catch (err: any) {
  //               if (isMentor) { setStatus('error'); setErrorMsg('Camera and microphone access is required for hosts.') }
  //               else setStatus('ready')
  //             }
  //           }}
  //           className="btn-primary py-3 text-sm"
  //         >
  //           Allow permissions & join
  //         </button>
  //         {!isMentor && (
  //           <button onClick={() => setStatus('ready')} className="btn-secondary py-3 text-sm">
  //             Join as listener
  //           </button>
  //         )}
  //       </div>
  //     </div>
  //   )
  // }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4 text-center">
        <div className="w-14 h-14 bg-error-light rounded-lg flex items-center justify-center mb-4">
          <ShieldAlert size={24} className="text-error" />
        </div>
        <h2 className="text-xl font-bold text-text mb-1">Connection error</h2>
        <p className="text-error text-sm font-medium max-w-sm">{errorMsg}</p>
        <button
          onClick={() => navigate("/")}
          className="btn-secondary text-sm mt-6"
        >
          Back to dashboard
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
      isAdmin={isAdmin}
      mentorId={mentorId!}
      onDisconnected={() => {
        // All intentional leave/end paths now call navigate() explicitly.
        // This callback only fires for truly unexpected drops (SDK exhaustion).
        // The MeetingView handles the reconnection UX internally.
      }}
    />
  );
};
