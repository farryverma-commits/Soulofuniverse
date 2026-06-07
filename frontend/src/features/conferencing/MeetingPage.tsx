import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "waiting" | "ready" | "error" | "not_started" | "permissions"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const checkSessionAndJoin = async () => {
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

        setIsMentor(session.mentor_id === user.id);
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

        const data = await response.json();
        console.log("livekit-get-token status:", response.status);

        if (response.ok) {
          //TODO issue in this
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
          setServerUrl(data.server_url);
          setStatus("permissions");
        } else {
          if (data.error?.includes("Approval required")) {
            setStatus("waiting");
            await supabase.from("session_participants").upsert(
              {
                session_id: sessionId,
                user_id: user.id,
                status: "pending",
              },
              {
                onConflict: "session_id,user_id",
              },
            );
          } else {
            setStatus("error");
            setErrorMsg(data.error || "Failed to join meeting.");
          }
        }
      } catch (err) {
        setStatus("error");
        setErrorMsg("An unexpected error occurred.");
      }
    };

    checkSessionAndJoin();

    const participantSubscription = supabase
      .channel(`session_participants_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.new.status === "approved") checkSessionAndJoin();
          if (payload.new.status === "rejected") {
            setStatus("error");
            setErrorMsg("Your request to join was declined by the host.");
          }
        },
      )
      .subscribe();

    const sessionSubscription = supabase
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
          if (payload.new.status === "live") checkSessionAndJoin();
        },
      )
      .subscribe();

    return () => {
      participantSubscription.unsubscribe();
      sessionSubscription.unsubscribe();
    };
  }, [sessionId, navigate]);

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
          {isMentor ? "Ready to start?" : "Meeting not started"}
        </h2>
        <p className="text-text-secondary text-sm max-w-sm">
          {isMentor
            ? "You are the host. Click below to go live and allow participants to join."
            : "The host hasn't started this meeting yet. Please wait or check back later."}
        </p>
        <div className="flex gap-3 mt-6">
          {isMentor && (
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

  if (status === "waiting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4 text-center">
        <OrbitalLoader variant="inline" label="Waiting for host..." />
        <h2 className="text-xl font-bold text-text mt-6 mb-1">
          Waiting for approval
        </h2>
        <p className="text-text-secondary text-sm max-w-sm mb-6">
          The meeting requires host approval. You'll enter automatically once
          approved.
        </p>
        <button
          onClick={() => navigate("/")}
          className="btn-secondary text-sm"
        >
          Back to dashboard
        </button>
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
      mentorId={mentorId!}
      onDisconnected={() => navigate("/")}
    />
  );
};
