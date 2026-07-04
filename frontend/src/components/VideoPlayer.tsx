import React, { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";

// Quality Selector Plugins
import "videojs-contrib-quality-levels";
import "videojs-hls-quality-selector";

interface VideoPlayerProps {
  options: any;
  onReady?: (player: any) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  options,
  onReady,
}) => {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const seekIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cleanupTapRef = useRef<(() => void) | null>(null);

  const [seekIndicator, setSeekIndicator] = useState<
    "forward" | "backward" | null
  >(null);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      const videoElement = document.createElement("video-js");

      videoElement.classList.add("vjs-big-play-centered");
      videoElement.classList.add("vjs-theme-youtube");

      if (videoRef.current) {
        videoRef.current.appendChild(videoElement);
      }

      const player = (playerRef.current = videojs(
        videoElement,
        {
          ...options,
          userActions: { ...options.userActions, doubleClick: false },
        },
        () => {
          videojs.log("player is ready");

          // Initialize HLS quality selector
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((playerRef.current as any).hlsQualitySelector) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (playerRef.current as any).hlsQualitySelector({
              displayCurrentQuality: true,
            });
          }

          // Double-tap / double-click to seek — works on both mobile and desktop
          const playerEl = playerRef.current.el();

          const seekBySide = (clientX: number) => {
            if (playerRef.current.paused()) return;
            const rect = playerEl.getBoundingClientRect();
            const x = clientX - rect.left;

            if (x < rect.width / 2) {
              playerRef.current.currentTime(
                Math.max(0, playerRef.current.currentTime() - 10),
              );
              setSeekIndicator("backward");
            } else {
              playerRef.current.currentTime(
                Math.min(
                  playerRef.current.duration(),
                  playerRef.current.currentTime() + 10,
                ),
              );
              setSeekIndicator("forward");
            }
            if (seekIndicatorTimeoutRef.current)
              clearTimeout(seekIndicatorTimeoutRef.current);
            seekIndicatorTimeoutRef.current = setTimeout(
              () => setSeekIndicator(null),
              600,
            );
          };

          // Mobile: double-tap via touchend
          const onTouchEnd = (e: TouchEvent) => {
            if (playerRef.current.paused()) return;
            const now = Date.now();
            if (now - lastTapRef.current < 300) {
              const touch = e.changedTouches[0];
              seekBySide(touch.clientX);
              e.preventDefault();
              lastTapRef.current = 0;
            } else {
              lastTapRef.current = now;
            }
          };

          // Desktop: double-click with three zones
          // Left 35% → backward seek, Right 35% → forward seek, Center 30% → fullscreen
          const onDblClick = (e: MouseEvent) => {
            if (playerRef.current.paused()) return;
            const rect = playerEl.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;

            if (x < 0.35) {
              // Left zone — backward seek
              playerRef.current.currentTime(
                Math.max(0, playerRef.current.currentTime() - 10),
              );
              setSeekIndicator("backward");
              if (seekIndicatorTimeoutRef.current)
                clearTimeout(seekIndicatorTimeoutRef.current);
              seekIndicatorTimeoutRef.current = setTimeout(
                () => setSeekIndicator(null),
                600,
              );
            } else if (x > 0.65) {
              // Right zone — forward seek
              playerRef.current.currentTime(
                Math.min(
                  playerRef.current.duration(),
                  playerRef.current.currentTime() + 10,
                ),
              );
              setSeekIndicator("forward");
              if (seekIndicatorTimeoutRef.current)
                clearTimeout(seekIndicatorTimeoutRef.current);
              seekIndicatorTimeoutRef.current = setTimeout(
                () => setSeekIndicator(null),
                600,
              );
            } else {
              // Center zone — toggle fullscreen
              if (playerRef.current.isFullscreen()) {
                playerRef.current.exitFullscreen();
              } else {
                playerRef.current.requestFullscreen();
              }
            }
          };

          playerEl.addEventListener("touchend", onTouchEnd);
          playerEl.addEventListener("dblclick", onDblClick);
          cleanupTapRef.current = () => {
            playerEl.removeEventListener("touchend", onTouchEnd);
            playerEl.removeEventListener("dblclick", onDblClick);
          };

          onReady && onReady(playerRef.current);
        },
      ));
    } else {
      const player = playerRef.current;

      // Only update source if it has changed to prevent restarting
      const currentSrc = player.src();
      const newSrc = options.sources?.[0]?.src;

      if (newSrc && currentSrc !== newSrc) {
        player.src(options.sources);
      }

      if (options.autoplay !== undefined) {
        player.autoplay(options.autoplay);
      }
    }
  }, [options, videoRef, onReady]);

  // Dispose the Video.js player when the functional component unmounts
  useEffect(() => {
    const player = playerRef.current;

    return () => {
      if (cleanupTapRef.current) cleanupTapRef.current();
      if (seekIndicatorTimeoutRef.current)
        clearTimeout(seekIndicatorTimeoutRef.current);
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, [playerRef]);

  return (
    <div data-vjs-player className="w-full h-full relative">
      <style>{`
        /* ============================================
           Cosmic Depths Video Player Theme
           -- Soul of Universe
           ============================================ */

        .vjs-theme-youtube.video-js {
          color: #F0EDF5;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* ---- Control Bar ---- */
        .vjs-theme-youtube .vjs-control-bar {
          background: linear-gradient(transparent, rgba(10, 10, 20, 0.92)) !important;
          height: 60px !important;
          display: flex !important;
          padding: 0 16px !important;
          padding-bottom: env(safe-area-inset-bottom, 0px) !important;
          padding-left: max(1px, env(safe-area-inset-left)) !important;
          padding-right: max(1px, env(safe-area-inset-right)) !important;
          align-items: center !important;
          transition: opacity 0.35s ease, visibility 0.35s ease !important;
          border-top: 1px solid rgba(212, 168, 83, 0.06) !important;
        }

        /* Auto-hide when user is inactive and playing */
        .video-js.vjs-user-inactive.vjs-playing .vjs-control-bar {
          opacity: 0 !important;
          visibility: hidden !important;
        }

        /* ---- Icon sizing ---- */
        .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
        .vjs-theme-youtube .vjs-menu-button-popup .vjs-icon-placeholder:before {
          font-family: VideoJS !important;
          font-size: 22px !important;
          line-height: 60px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          opacity: 0.85;
          transition: opacity 0.2s, color 0.2s;
        }

        .vjs-theme-youtube .vjs-button:hover > .vjs-icon-placeholder:before {
          opacity: 1;
          color: #D4A853;
        }

        /* ---- Control groups ---- */

        /* Left group */
        .vjs-theme-youtube .vjs-play-control,
        .vjs-theme-youtube .vjs-volume-panel,
        .vjs-theme-youtube .vjs-current-time,
        .vjs-theme-youtube .vjs-time-divider,
        .vjs-theme-youtube .vjs-duration {
          order: 1 !important;
        }

        /* Time display */
        .vjs-theme-youtube .vjs-current-time,
        .vjs-theme-youtube .vjs-duration {
          display: flex !important;
          align-items: center !important;
          font-size: 13px !important;
          font-weight: 500;
          padding: 0 4px !important;
          min-width: auto !important;
          line-height: 60px !important;
          color: rgba(240, 237, 245, 0.7) !important;
        }

        .vjs-theme-youtube .vjs-time-divider {
          display: flex !important;
          align-items: center !important;
          font-size: 13px !important;
          padding: 0 2px !important;
          color: rgba(240, 237, 245, 0.3) !important;
          min-width: auto !important;
          line-height: 60px !important;
        }

        /* Spacer */
        .vjs-theme-youtube .vjs-custom-control-spacer,
        .vjs-theme-youtube .vjs-spacer {
          display: block !important;
          flex: 1 1 auto !important;
          order: 2 !important;
        }

        /* Right group */
        .vjs-theme-youtube .vjs-playback-rate,
        .vjs-theme-youtube .vjs-quality-selector,
        .vjs-theme-youtube .vjs-fullscreen-control {
          order: 3 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 44px !important;
          line-height: 60px !important;
        }

        .vjs-theme-youtube .vjs-playback-rate .vjs-playback-rate-value {
          font-size: 13px !important;
          font-weight: 500;
          line-height: 60px !important;
        }

        .vjs-theme-youtube .vjs-quality-selector.vjs-menu-button-popup .vjs-icon-placeholder:before {
          content: "\f110" !important;
        }

        /* ---- Progress bar ---- */
        .vjs-theme-youtube .vjs-progress-control {
          position: absolute !important;
          width: 100% !important;
          left: 0 !important;
          top: -10px !important;
          height: 20px !important;
          display: flex !important;
          align-items: center !important;
          order: 0 !important;
          transition: top 0.3s, opacity 0.3s !important;
          z-index: 10 !important;
        }

        .vjs-theme-youtube .vjs-progress-control .vjs-slider {
          height: 4px !important;
          transition: height 0.2s !important;
          background-color: rgba(240, 237, 245, 0.15) !important;
        }

        .vjs-theme-youtube .vjs-progress-control:hover .vjs-slider,
        .vjs-theme-youtube .vjs-progress-control.vjs-sliding .vjs-slider {
          height: 7px !important;
        }

        .vjs-theme-youtube .vjs-load-progress {
          background-color: rgba(240, 237, 245, 0.25) !important;
        }

        .vjs-theme-youtube .vjs-load-progress div {
          background-color: rgba(240, 237, 245, 0.35) !important;
        }

        .vjs-theme-youtube .vjs-play-progress {
          background-color: #D4A853 !important;
        }

        .vjs-theme-youtube .vjs-play-progress:before {
          color: #D4A853 !important;
          font-size: 12px !important;
          top: -3px !important;
          opacity: 0;
          transition: opacity 0.15s;
        }

        .vjs-theme-youtube .vjs-progress-control:hover .vjs-play-progress:before,
        .vjs-theme-youtube .vjs-progress-control.vjs-sliding .vjs-play-progress:before {
          opacity: 1;
        }

        /* ---- Volume ---- */
        .vjs-theme-youtube .vjs-volume-panel {
          transition: width 0.25s ease !important;
          align-items: center !important;
        }

        .vjs-theme-youtube .vjs-mute-control {
          line-height: 60px !important;
        }

        .vjs-theme-youtube .vjs-volume-control.vjs-volume-horizontal {
          height: 60px !important;
          display: flex !important;
          align-items: center !important;
        }

        .vjs-theme-youtube .vjs-volume-bar.vjs-slider-horizontal {
          margin: 0 0.45em !important;
        }

        .vjs-theme-youtube .vjs-volume-level {
          background-color: #D4A853 !important;
        }

        .vjs-theme-youtube .vjs-volume-panel.vjs-hover {
          width: 10em !important;
        }

        /* ---- Big Play Button ---- */
        .vjs-theme-youtube .vjs-big-play-button {
          background-color: rgba(212, 168, 83, 0.88) !important;
          border: none !important;
          width: 72px !important;
          height: 72px !important;
          line-height: 72px !important;
          border-radius: 50% !important;
          margin-top: -36px !important;
          margin-left: -36px !important;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                      background-color 0.25s,
                      box-shadow 0.25s !important;
          box-shadow: 0 0 60px rgba(212, 168, 83, 0.2),
                      0 8px 32px rgba(0, 0, 0, 0.4) !important;
          font-size: 28px !important;
        }

        .vjs-theme-youtube .vjs-big-play-button .vjs-icon-placeholder:before {
          color: #0A0A14 !important;
          line-height: 72px !important;
        }

        .vjs-theme-youtube:hover .vjs-big-play-button {
          background-color: #D4A853 !important;
          transform: scale(1.08);
          box-shadow: 0 0 80px rgba(212, 168, 83, 0.35),
                      0 12px 40px rgba(0, 0, 0, 0.5) !important;
        }

        /* ---- Menu dropdowns ---- */
        .vjs-theme-youtube .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
          background-color: rgba(12, 12, 26, 0.96) !important;
          border-radius: 10px !important;
          bottom: 68px !important;
          padding: 6px 0 !important;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6),
                      0 0 0 1px rgba(212, 168, 83, 0.08) !important;
          backdrop-filter: blur(16px);
          min-width: 140px !important;
        }

        .vjs-theme-youtube .vjs-menu-item {
          padding: 10px 20px !important;
          font-size: 13px !important;
          font-weight: 500;
          text-transform: none !important;
          transition: background 0.15s, color 0.15s;
          color: rgba(240, 237, 245, 0.7) !important;
        }

        .vjs-theme-youtube .vjs-menu-item.vjs-selected {
          background-color: rgba(212, 168, 83, 0.08) !important;
          color: #D4A853 !important;
        }

        .vjs-theme-youtube .vjs-menu-item:hover {
          background-color: rgba(123, 94, 168, 0.12) !important;
          color: #F0EDF5 !important;
        }

        /* ============================================
           PORTRAIT / NARROW ADAPTATION
           (phones, portrait fullscreen)
           ============================================ */

        @media (max-width: 640px), (orientation: portrait) and (max-height: 500px) {
          .vjs-theme-youtube .vjs-control-bar {
            height: 52px !important;
            padding: 0 10px !important;
            padding-bottom: env(safe-area-inset-bottom, 0px) !important;
            padding-left: max(10px, env(safe-area-inset-left)) !important;
            padding-right: max(10px, env(safe-area-inset-right)) !important;
          }

          .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
          .vjs-theme-youtube .vjs-menu-button-popup .vjs-icon-placeholder:before {
            font-size: 19px !important;
            line-height: 52px !important;
          }

          .vjs-theme-youtube .vjs-playback-rate .vjs-playback-rate-value {
            font-size: 12px !important;
            line-height: 52px !important;
          }

          .vjs-theme-youtube .vjs-current-time,
          .vjs-theme-youtube .vjs-duration,
          .vjs-theme-youtube .vjs-time-divider {
            font-size: 11px !important;
          }

          .vjs-theme-youtube .vjs-playback-rate,
          .vjs-theme-youtube .vjs-quality-selector,
          .vjs-theme-youtube .vjs-fullscreen-control {
            width: 38px !important;
          }

          .vjs-theme-youtube .vjs-progress-control {
            width: 100% !important;
            left: 0 !important;
            top: -10px !important;
            height: 22px !important;
          }

          .vjs-theme-youtube .vjs-progress-control .vjs-slider {
            height: 4px !important;
          }

          .vjs-theme-youtube .vjs-progress-control:hover .vjs-slider,
          .vjs-theme-youtube .vjs-progress-control.vjs-sliding .vjs-slider {
            height: 8px !important;
          }

          .vjs-theme-youtube .vjs-big-play-button {
            width: 56px !important;
            height: 56px !important;
            line-height: 56px !important;
            margin-top: -28px !important;
            margin-left: -28px !important;
            font-size: 22px !important;
            border-radius: 50% !important;
          }

          .vjs-theme-youtube .vjs-big-play-button .vjs-icon-placeholder:before {
            line-height: 56px !important;
          }

          .vjs-theme-youtube .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
            bottom: 58px !important;
            min-width: 130px !important;
          }

          .vjs-theme-youtube .vjs-menu-item {
            padding: 13px 20px !important;
            font-size: 14px !important;
          }

          /* Hide volume + duration divider on cramped portrait */
          .vjs-theme-youtube .vjs-volume-panel,
          .vjs-theme-youtube .vjs-time-divider,
          .vjs-theme-youtube .vjs-duration {
            display: none !important;
          }
        }

        /* ============================================
           VERY SMALL / THUMB-REACH PRIORITY
           (iPhone SE, narrow portrait)
           ============================================ */

        @media (max-width: 380px) {
          .vjs-theme-youtube .vjs-control-bar {
            height: 48px !important;
            padding: 0 8px !important;
          }

          .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
          .vjs-theme-youtube .vjs-menu-button-popup .vjs-icon-placeholder:before {
            font-size: 17px !important;
            line-height: 48px !important;
          }

          .vjs-theme-youtube .vjs-playback-rate .vjs-playback-rate-value {
            font-size: 11px !important;
            line-height: 48px !important;
          }

          .vjs-theme-youtube .vjs-current-time {
            font-size: 10px !important;
          }

          .vjs-theme-youtube .vjs-playback-rate,
          .vjs-theme-youtube .vjs-quality-selector,
          .vjs-theme-youtube .vjs-fullscreen-control {
            width: 34px !important;
          }

          .vjs-theme-youtube .vjs-big-play-button {
            width: 48px !important;
            height: 48px !important;
            line-height: 48px !important;
            margin-top: -24px !important;
            margin-left: -24px !important;
            font-size: 20px !important;
            border-radius: 50% !important;
          }

          .vjs-theme-youtube .vjs-big-play-button .vjs-icon-placeholder:before {
            line-height: 48px !important;
          }

          .vjs-theme-youtube .vjs-menu-item {
            padding: 14px 18px !important;
            font-size: 14px !important;
          }
        }

        /* ============================================
           FULLSCREEN LANDSCAPE EXPANSION
           ============================================ */

        .vjs-theme-youtube.vjs-fullscreen .vjs-control-bar {
          height: 68px !important;
          padding: 0 24px !important;
          padding-bottom: env(safe-area-inset-bottom, 12px) !important;
          padding-left: max(24px, env(safe-area-inset-left)) !important;
          padding-right: max(24px, env(safe-area-inset-right)) !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-button > .vjs-icon-placeholder:before,
        .vjs-theme-youtube.vjs-fullscreen .vjs-menu-button-popup .vjs-icon-placeholder:before {
          font-size: 24px !important;
          line-height: 68px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-playback-rate .vjs-playback-rate-value {
          font-size: 14px !important;
          line-height: 68px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-current-time,
        .vjs-theme-youtube.vjs-fullscreen .vjs-duration {
          font-size: 14px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-time-divider {
          font-size: 14px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-playback-rate,
        .vjs-theme-youtube.vjs-fullscreen .vjs-quality-selector,
        .vjs-theme-youtube.vjs-fullscreen .vjs-fullscreen-control {
          width: 52px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-progress-control {
          width: 100% !important;
          left: 0 !important;
          top: -12px !important;
          height: 24px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-progress-control .vjs-slider {
          height: 5px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-progress-control:hover .vjs-slider,
        .vjs-theme-youtube.vjs-fullscreen .vjs-progress-control.vjs-sliding .vjs-slider {
          height: 9px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-big-play-button {
          width: 88px !important;
          height: 88px !important;
          line-height: 88px !important;
          margin-top: -44px !important;
          margin-left: -44px !important;
          font-size: 34px !important;
          border-radius: 50% !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-big-play-button .vjs-icon-placeholder:before {
          line-height: 88px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
          bottom: 76px !important;
        }

        .vjs-theme-youtube.vjs-fullscreen .vjs-menu-item {
          padding: 12px 24px !important;
          font-size: 14px !important;
        }

        /* ---- Fill mode ---- */
        .video-js.vjs-fill {
          height: 100% !important;
          width: 100% !important;
        }

        /* ---- Reduced motion ---- */
        @media (prefers-reduced-motion: reduce) {
          .vjs-theme-youtube .vjs-control-bar,
          .vjs-theme-youtube .vjs-progress-control,
          .vjs-theme-youtube .vjs-big-play-button,
          .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
          .vjs-theme-youtube .vjs-progress-control .vjs-slider {
            transition: none !important;
          }

          .vjs-theme-youtube:hover .vjs-big-play-button {
            transform: none;
          }
        }

        /* ---- Double-tap seek indicator ---- */
        .seek-indicator-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(10, 10, 20, 0.78);
          border: 1px solid rgba(212, 168, 83, 0.18);
          border-radius: 12px;
          padding: 8px 14px;
          color: #F0EDF5;
          backdrop-filter: blur(8px);
          animation: seek-fade 0.6s ease forwards;
        }

        @keyframes seek-fade {
          0% { opacity: 1; transform: scale(1); }
          60% { opacity: 1; transform: scale(1.06); }
          100% { opacity: 0; transform: scale(1.12); }
        }
      `}</style>
      {seekIndicator && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-10 ${
            seekIndicator === "forward" ? "right-6" : "left-6"
          }`}
        >
          <div className="seek-indicator-badge">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {seekIndicator === "forward" ? (
                <>
                  <polyline points="13 17 18 12 13 7" />
                  <polyline points="6 17 11 12 6 7" />
                </>
              ) : (
                <>
                  <polyline points="11 17 6 12 11 7" />
                  <polyline points="18 17 13 12 18 7" />
                </>
              )}
            </svg>
            <span className="text-sm font-semibold">10s</span>
          </div>
        </div>
      )}
      <div ref={videoRef} className="w-full h-full" />
    </div>
  );
};
