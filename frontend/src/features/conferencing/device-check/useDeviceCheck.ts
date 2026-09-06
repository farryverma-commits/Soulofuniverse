import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Standalone mic/camera permission + quality check.
 * Deliberately has zero dependencies on LiveKit or MeetingView so it can be
 * reused anywhere (pre-join green room, /device-check page, future surfaces).
 */

export type DeviceStatus =
  | "checking" // initial probe still running
  | "insecure" // page not served over HTTPS — getUserMedia unavailable
  | "unsupported" // browser has no mediaDevices.getUserMedia
  | "prompt" // permission not decided yet — needs a user gesture
  | "granted"
  | "denied";

export type DeviceCheckError =
  | "not-allowed"
  | "not-found"
  | "not-readable"
  | "overconstrained"
  | "unknown";

const MEDIA_PERMISSIONS = ["microphone", "camera"] as const;
type MediaPermissionName = (typeof MEDIA_PERMISSIONS)[number];

const queryPermission = async (
  name: MediaPermissionName,
): Promise<PermissionState | "unsupported"> => {
  try {
    if (!navigator.permissions?.query) return "unsupported";
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    });
    return status.state;
  } catch {
    // Safari and older browsers reject these permission names
    return "unsupported";
  }
};

const classifyError = (err: unknown): DeviceCheckError => {
  switch ((err as DOMException | undefined)?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "not-allowed";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "not-found";
    case "NotReadableError":
    case "TrackStartError":
      return "not-readable";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "overconstrained";
    default:
      return "unknown";
  }
};

export function useDeviceCheck() {
  const [mic, setMic] = useState<DeviceStatus>("checking");
  const [camera, setCamera] = useState<DeviceStatus>("checking");
  const [error, setError] = useState<DeviceCheckError | null>(null);
  const [testing, setTesting] = useState(false);
  const [micDevice, setMicDevice] = useState<string | null>(null);
  const [cameraDevice, setCameraDevice] = useState<string | null>(null);

  // The panel always renders these elements so the hook can attach the probe
  // stream the moment it arrives (no ref-null race with conditional renders).
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  // Guard so tracks firing "ended" from our own stop() don't reset UI state.
  const stoppingRef = useRef(false);
  const permissionStatusesRef = useRef<PermissionStatus[]>([]);
  const disposedRef = useRef(false);

  const cleanupMedia = useCallback(() => {
    stoppingRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setTesting(false);
    stoppingRef.current = false;
  }, []);

  const evaluatePermissions = useCallback(async (): Promise<{
    mic: DeviceStatus;
    camera: DeviceStatus;
  }> => {
    if (!window.isSecureContext) return { mic: "insecure", camera: "insecure" };
    if (!navigator.mediaDevices?.getUserMedia) {
      return { mic: "unsupported", camera: "unsupported" };
    }

    const [micPerm, cameraPerm] = await Promise.all([
      queryPermission("microphone"),
      queryPermission("camera"),
    ]);

    const fromPermission = (perm: PermissionState | "unsupported") =>
      perm === "granted" ? "granted" : perm === "denied" ? "denied" : null;

    let micStatus: DeviceStatus | null = fromPermission(micPerm);
    let cameraStatus: DeviceStatus | null = fromPermission(cameraPerm);

    if (micStatus === null || cameraStatus === null) {
      // Permissions API unavailable or "prompt" (Safari & friends): fall back
      // to the device-label heuristic — browsers hide labels until access was
      // granted at least once (same trick as MeetingView's DeviceMenu).
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (micStatus === null) {
          micStatus = devices.some(
            (device) => device.kind === "audioinput" && device.label,
          )
            ? "granted"
            : "prompt";
        }
        if (cameraStatus === null) {
          cameraStatus = devices.some(
            (device) => device.kind === "videoinput" && device.label,
          )
            ? "granted"
            : "prompt";
        }
      } catch {
        if (micStatus === null) micStatus = "prompt";
        if (cameraStatus === null) cameraStatus = "prompt";
      }
    }

    return { mic: micStatus, camera: cameraStatus };
  }, []);

  const refreshDeviceLabels = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevice(
        devices.find(
          (device) => device.kind === "audioinput" && device.label,
        )?.label ?? null,
      );
      setCameraDevice(
        devices.find(
          (device) => device.kind === "videoinput" && device.label,
        )?.label ?? null,
      );
    } catch {
      // labels are cosmetic — never block the check on them
    }
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) return;
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return;

      const audioCtx = new AudioContextCtor();
      audioCtxRef.current = audioCtx;
      audioCtx.resume().catch(() => {});

      const source = audioCtx.createMediaStreamSource(
        new MediaStream([audioTrack]),
      );
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      let display = 0;

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        // Perceptual map: silence floor ~0.015 RMS, full bar ~0.3 RMS, with a
        // fast attack / slow decay so the bar reads like a real VU meter.
        const level = Math.min(1, Math.max(0, (rms - 0.015) / 0.285));
        display = Math.max(level, display * 0.88);
        if (meterRef.current) {
          meterRef.current.style.transform = `scaleX(${display.toFixed(3)})`;
        }
      };
      tick();
    } catch {
      // the meter is best-effort — permission verdict doesn't depend on it
    }
  }, []);

  const start = useCallback(async () => {
    cleanupMedia();
    setError(null);

    const env = await evaluatePermissions();
    if (env.mic === "insecure" || env.mic === "unsupported") {
      setMic(env.mic);
      setCamera(env.camera);
      return;
    }

    // One combined prompt: a single Allow grants both mic and camera.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      // Unmounted while the prompt was open — stop the late stream instead of
      // storing it (nothing would ever stop it; camera light would stay on).
      if (disposedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setMic("granted");
      setCamera("granted");
      setTesting(true);

      if (videoRef.current) videoRef.current.srcObject = stream;

      for (const track of stream.getTracks()) {
        track.addEventListener("ended", () => {
          if (stoppingRef.current) return;
          // Device unplugged / revoked mid-test → back to a retryable state.
          cleanupMedia();
          setMic((prev) => (prev === "granted" ? "prompt" : prev));
          setCamera((prev) => (prev === "granted" ? "prompt" : prev));
        });
      }

      startMeter(stream);
      await refreshDeviceLabels();
    } catch (err) {
      const kind = classifyError(err);
      setError(kind);

      if (kind === "not-allowed") {
        // Figure out per-device truth where the Permissions API can tell us
        // (e.g. Chrome partial grants: camera allowed, mic blocked).
        const [micPerm, cameraPerm] = await Promise.all([
          queryPermission("microphone"),
          queryPermission("camera"),
        ]);
        const resolveDenied = (perm: PermissionState | "unsupported") =>
          perm === "denied"
            ? "denied"
            : perm === "granted"
              ? "granted"
              : "denied";
        const micStatus = resolveDenied(micPerm);
        const cameraStatus = resolveDenied(cameraPerm);
        setMic(micStatus);
        setCamera(cameraStatus);

        // Salvage the device that was granted so its preview/meter still works.
        const wanted: MediaStreamConstraints = {};
        if (micStatus === "granted") wanted.audio = true;
        if (cameraStatus === "granted") wanted.video = true;
        if (wanted.audio || wanted.video) {
          try {
            const partial = await navigator.mediaDevices.getUserMedia(wanted);
            if (disposedRef.current) {
              for (const track of partial.getTracks()) track.stop();
              return;
            }
            streamRef.current = partial;
            setTesting(true);
            if (videoRef.current && partial.getVideoTracks().length > 0) {
              videoRef.current.srcObject = partial;
            }
            startMeter(partial);
            await refreshDeviceLabels();
          } catch {
            // partial salvage failed — statuses above still stand
          }
        }
      } else {
        // Device-level problems (busy, missing) are retryable — not verdicts.
        setMic((prev) => (prev === "granted" ? prev : "prompt"));
        setCamera((prev) => (prev === "granted" ? prev : "prompt"));
      }
    }
  }, [cleanupMedia, evaluatePermissions, refreshDeviceLabels, startMeter]);

  useEffect(() => {
    let disposed = false;
    // StrictMode re-runs setup after a simulated unmount — re-arm the guard.
    disposedRef.current = false;

    evaluatePermissions()
      .then((env) => {
        if (disposed) return;
        setMic(env.mic);
        setCamera(env.camera);
        // Already granted earlier → silently start preview/meter. When a
        // gesture turns out to be required (some iOS versions), the failure
        // lands back in "prompt" and the panel shows its Allow button.
        if (env.mic === "granted" && env.camera === "granted") {
          start().catch(() => {});
        }
      })
      .catch(() => {
        if (!disposed) {
          setMic("prompt");
          setCamera("prompt");
        }
      });

    // Live updates when the user flips permissions in browser settings while
    // the page stays open (no reload needed in Chromium).
    const handlePermissionChange = () => {
      evaluatePermissions().then((env) => {
        if (disposedRef.current) return;
        setMic(env.mic);
        setCamera(env.camera);
        if (env.mic === "denied" || env.camera === "denied") {
          cleanupMedia();
          setError("not-allowed");
        } else if (
          env.mic === "granted" &&
          env.camera === "granted" &&
          !streamRef.current
        ) {
          start().catch(() => {});
        }
      });
    };

    const attach = async () => {
      for (const name of MEDIA_PERMISSIONS) {
        try {
          if (!navigator.permissions?.query) return;
          const status = await navigator.permissions.query({
            name: name as PermissionName,
          });
          if (disposedRef.current) {
            status.onchange = null;
            return;
          }
          permissionStatusesRef.current.push(status);
          status.onchange = handlePermissionChange;
        } catch {
          // Safari — no live permission events, heuristic refresh is enough
        }
      }
    };
    attach();

    return () => {
      disposed = true;
      disposedRef.current = true;
      for (const status of permissionStatusesRef.current) {
        status.onchange = null;
      }
      permissionStatusesRef.current = [];
      cleanupMedia();
    };
  }, [cleanupMedia, evaluatePermissions, start]);

  return {
    mic,
    camera,
    error,
    testing,
    micDevice,
    cameraDevice,
    videoRef,
    meterRef,
    start,
  };
}
