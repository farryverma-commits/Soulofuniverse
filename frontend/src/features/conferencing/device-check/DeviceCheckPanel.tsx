import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LogIn,
  Mic,
  MicOff,
  RefreshCw,
  ShieldCheck,
  Video,
  VideoOff,
} from "lucide-react";
import { OrbitalLoader } from "../../../components/OrbitalLoader";
import {
  useDeviceCheck,
  type DeviceCheckError,
  type DeviceStatus,
} from "./useDeviceCheck";

const REENABLE_GUIDANCE =
  "iPhone/iPad (Safari): tap the aA icon in the address bar, open Website Settings and allow Camera & Microphone, then reload. Android (Chrome): tap the lock icon beside the address bar, open Permissions and allow access, then reload. Desktop: use the lock icon in the address bar to edit Site settings.";

interface DeviceCheckPanelProps {
  /** "pre-join" renders a full-screen green room; "page" renders inline content for /device-check */
  mode: "pre-join" | "page";
  /** Hosts (mentor + admin co-host) cannot join until BOTH mic and camera are granted */
  requireMedia?: boolean;
  joinLabel?: string;
  onJoin?: () => void;
  onBack?: () => void;
}

const StatusBadge: React.FC<{ status: DeviceStatus }> = ({ status }) => {
  switch (status) {
    case "granted":
      return <span className="badge badge-success">Allowed</span>;
    case "denied":
      return <span className="badge badge-warning">Blocked</span>;
    case "checking":
      return <span className="badge">Checking</span>;
    case "insecure":
    case "unsupported":
      return <span className="badge badge-warning">Unavailable</span>;
    default:
      return <span className="badge badge-warning">Action needed</span>;
  }
};

export const DeviceCheckPanel: React.FC<DeviceCheckPanelProps> = ({
  mode,
  requireMedia = false,
  joinLabel = "Join session",
  onJoin,
  onBack,
}) => {
  const {
    mic,
    camera,
    error,
    testing,
    micDevice,
    cameraDevice,
    videoRef,
    meterRef,
    start,
  } = useDeviceCheck();

  const bothGranted = mic === "granted" && camera === "granted";
  const anyDenied = mic === "denied" || camera === "denied";
  // "Passing" means both permissions granted AND the probe stream is actually
  // live (preview + meter running) — not just a permission-query verdict.
  const allPassed = bothGranted && testing;
  // No point offering a request button when the environment itself blocks
  // media (HTTP, no API) or while the initial probe is still running.
  const envBroken =
    mic === "insecure" ||
    camera === "insecure" ||
    mic === "unsupported" ||
    camera === "unsupported";
  const probeDone = mic !== "checking" && camera !== "checking";
  const showAllowButton =
    !envBroken && probeDone && (mode === "page" ? true : !bothGranted);

  const primaryAction = bothGranted
    ? { label: "Test again", Icon: RefreshCw }
    : anyDenied
      ? { label: "Try again", Icon: RefreshCw }
      : { label: "Allow mic & camera", Icon: ShieldCheck };

  const issues: { title: string; body: string }[] = [];
  if (mic === "insecure") {
    issues.push({
      title: "Secure connection required",
      body: "Camera and microphone access only works over HTTPS. If this page was opened over HTTP (common when testing on a phone), reopen it using the site's secure address.",
    });
  } else if (mic === "unsupported") {
    issues.push({
      title: "Browser not supported",
      body: "This browser doesn't support camera or microphone access. Please open Soul of Universe in the latest Chrome, Safari, or Edge.",
    });
  }
  if (mic === "denied") {
    issues.push({
      title: "Microphone is blocked",
      body: `${requireMedia ? "You need to allow microphone access before you can host the session." : "You won't be able to speak in the session."} ${REENABLE_GUIDANCE}`,
    });
  }
  if (camera === "denied") {
    issues.push({
      title: "Camera is blocked",
      body: `${requireMedia ? "You need to allow camera access before you can host the session." : "You can still watch the session without your camera."} ${REENABLE_GUIDANCE}`,
    });
  }
  if (error && error !== "not-allowed") {
    const deviceIssues: Record<
      Exclude<DeviceCheckError, "not-allowed">,
      { title: string; body: string }
    > = {
      "not-readable": {
        title: "Device is busy",
        body: "Another app seems to be using your camera or microphone (an active call, or another meeting tab). Close it and try again.",
      },
      "not-found": {
        title: "No device found",
        body: "We couldn't find a camera or microphone on this device. Check that it's connected and not disabled in system settings.",
      },
      overconstrained: {
        title: "Device can't start",
        body: "Your camera or microphone couldn't start with the required settings. Try again, or restart your browser.",
      },
      unknown: {
        title: "Something went wrong",
        body: "We couldn't access your camera or microphone. Try again, or restart your browser.",
      },
    };
    issues.push(deviceIssues[error]);
  }

  const checkCard = (
    <div className="card card-glow p-5 text-left space-y-5">
      {/* Success status */}
      {allPassed && (
        <div className="flex gap-3 rounded-xl border border-success/20 bg-success-light px-4 py-3 animate-fade-in">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
          <div>
            <p className="text-xs font-bold text-success">
              All checks passed
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              Camera and microphone are ready — you're set to join the session.
            </p>
          </div>
        </div>
      )}

      {/* Camera */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                camera === "denied" ? "bg-error-light" : "bg-primary-light"
              }`}
            >
              {camera === "denied" ? (
                <VideoOff size={17} className="text-error" />
              ) : (
                <Video size={17} className="text-primary" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-text">Camera</p>
              <p className="text-xs text-text-secondary">
                {cameraDevice ?? "Default camera"}
              </p>
            </div>
          </div>
          <StatusBadge status={camera} />
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-canvas">
          {/* Always mounted so the hook can attach the probe stream the moment
              it resolves; visibility is toggled with CSS instead of unmounting. */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${camera === "granted" && testing ? "" : "hidden"}`}
          />
          {!(camera === "granted" && testing) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              {camera === "checking" ? (
                <OrbitalLoader variant="inline" />
              ) : camera === "denied" ? (
                <>
                  <VideoOff size={20} className="text-error" />
                  <p className="text-xs text-text-secondary">
                    Camera access blocked
                  </p>
                </>
              ) : (
                <>
                  <Video size={20} className="text-text-muted" />
                  <p className="text-xs text-text-muted">
                    {camera === "insecure"
                      ? "Camera needs a secure (HTTPS) connection"
                      : camera === "unsupported"
                        ? "Camera not supported in this browser"
                        : "Allow access to see your preview"}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Microphone */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                mic === "denied" ? "bg-error-light" : "bg-primary-light"
              }`}
            >
              {mic === "denied" ? (
                <MicOff size={17} className="text-error" />
              ) : (
                <Mic size={17} className="text-primary" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-text">Microphone</p>
              <p className="text-xs text-text-secondary">
                {micDevice ?? "Default microphone"}
              </p>
            </div>
          </div>
          <StatusBadge status={mic} />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            ref={meterRef}
            className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-100 ease-out"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          {mic === "granted" && testing
            ? "Speak normally — the bar should move with your voice."
            : "Allow access, then speak to see the bar move."}
        </p>
      </div>

      {/* Warnings */}
      {issues.length > 0 && (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div
              key={issue.title}
              className="flex gap-3 rounded-xl border border-warning/20 bg-warning-light px-4 py-3 animate-fade-in"
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-warning"
              />
              <div>
                <p className="text-xs font-bold text-warning">{issue.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                  {issue.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Access action */}
      {showAllowButton && (
        <button
          onClick={() => start()}
          className="btn-primary w-full py-3 text-sm"
        >
          <primaryAction.Icon size={15} />
          {primaryAction.label}
        </button>
      )}
    </div>
  );

  if (mode === "pre-join") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas px-4 py-8 text-center">
        <div className="w-full max-w-md animate-fade-in">
          <div className="w-14 h-14 bg-primary-light rounded-lg flex items-center justify-center mb-4 mx-auto">
            <Video size={24} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-text mb-1">Ready to join?</h2>
          <p className="text-text-secondary text-sm max-w-sm mb-6">
            Check your camera and microphone before entering the session — this
            avoids surprises once you're live.
          </p>

          {checkCard}

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={onJoin}
              disabled={requireMedia && !bothGranted}
              className="btn-primary w-full py-3 text-sm"
            >
              <LogIn size={15} />
              {joinLabel}
            </button>
            {requireMedia && !bothGranted && (
              <p className="text-[11px] text-text-muted">
                Hosting requires camera and microphone access. Allow both above
                to unlock joining.
              </p>
            )}
            <button
              onClick={onBack}
              className="btn-secondary w-full py-3 text-sm"
            >
              <ArrowLeft size={15} />
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return checkCard;
};
