import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

// Quality Selector Plugins
import 'videojs-contrib-quality-levels';
import 'videojs-hls-quality-selector';

// Type augmentation for video.js plugins
declare module 'video.js' {
  export interface Player {
    hlsQualitySelector: (options?: { displayCurrentQuality?: boolean }) => void;
  }
}

interface VideoPlayerProps {
  options: any;
  onReady?: (player: any) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ options, onReady }) => {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      const videoElement = document.createElement("video-js");
      
      videoElement.classList.add('vjs-big-play-centered');
      videoElement.classList.add('vjs-theme-youtube');
      
      if (videoRef.current) {
        videoRef.current.appendChild(videoElement);
      }

      const player = playerRef.current = videojs(videoElement, options, () => {
        videojs.log('player is ready');
        
        // Initialize HLS quality selector
        if (player.hlsQualitySelector) {
          player.hlsQualitySelector({
            displayCurrentQuality: true,
          });
        }
        
        onReady && onReady(player);
      });
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
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, [playerRef]);

  return (
    <div data-vjs-player className="w-full h-full">
      <style>{`
        .vjs-theme-youtube.video-js {
          color: #fff;
          font-family: 'Inter', sans-serif;
        }
        .vjs-theme-youtube .vjs-control-bar {
          background: linear-gradient(transparent, rgba(0,0,0,0.95)) !important;
          height: 60px !important;
          display: flex !important;
          padding: 0 15px !important;
          opacity: 1 !important;
          visibility: visible !important;
          align-items: center !important;
        }
        /* Make icons bigger */
        .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
        .vjs-theme-youtube .vjs-playback-rate .vjs-playback-rate-value {
          font-size: 24px !important;
          line-height: 60px !important;
        }
        /* Group left controls */
        .vjs-theme-youtube .vjs-play-control,
        .vjs-theme-youtube .vjs-volume-panel,
        .vjs-theme-youtube .vjs-current-time,
        .vjs-theme-youtube .vjs-time-divider,
        .vjs-theme-youtube .vjs-duration {
          order: 1 !important;
        }
        /* The spacer should take up all available space */
        .vjs-theme-youtube .vjs-custom-control-spacer,
        .vjs-theme-youtube .vjs-spacer {
          display: block !important;
          flex: 1 1 auto !important;
          order: 2 !important;
        }
        /* Right controls */
        .vjs-theme-youtube .vjs-playback-rate,
        .vjs-theme-youtube .vjs-quality-selector,
        .vjs-theme-youtube .vjs-fullscreen-control {
          order: 3 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 50px !important;
        }
        /* Fix Quality selector to look like YouTube gear */
        .vjs-theme-youtube .vjs-quality-selector .vjs-menu-button-popup .vjs-icon-placeholder:before {
          content: "\f110" !important; /* Video.js gear icon */
          font-family: VideoJS !important;
          font-size: 24px !important;
        }
        /* Style the quality menu to be cleaner */
        .vjs-theme-youtube .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
          background-color: rgba(28, 28, 28, 0.95) !important;
          border-radius: 8px !important;
          bottom: 50px !important;
          padding: 8px 0 !important;
        }
        .vjs-theme-youtube .vjs-menu-item {
          padding: 10px 20px !important;
          font-size: 14px !important;
          text-transform: none !important;
        }
        .vjs-theme-youtube .vjs-menu-item.vjs-selected {
          background-color: rgba(255, 255, 255, 0.1) !important;
          color: #FF0000 !important;
        }
        .vjs-theme-youtube .vjs-progress-control {
          position: absolute !important;
          width: calc(100% - 30px) !important;
          left: 15px !important;
          top: -10px !important;
          height: 10px !important;
          order: 0 !important;
        }
        .vjs-theme-youtube .vjs-play-progress {
          background-color: #FF0000 !important;
        }
        .vjs-theme-youtube .vjs-play-progress:before {
          color: #FF0000 !important;
        }
        .vjs-theme-youtube .vjs-big-play-button {
          background-color: rgba(255, 0, 0, 0.9) !important;
          border: none !important;
          width: 68px !important;
          height: 48px !important;
          line-height: 48px !important;
          border-radius: 12px !important;
          margin-top: -24px !important;
          margin-left: -34px !important;
        }
        .vjs-theme-youtube:hover .vjs-big-play-button {
          background-color: #FF0000 !important;
        }
        .vjs-theme-youtube .vjs-load-progress {
          background-color: rgba(255, 255, 255, 0.3) !important;
        }
        .vjs-theme-youtube .vjs-slider {
          background-color: rgba(255, 255, 255, 0.2) !important;
        }
        .vjs-theme-youtube .vjs-volume-level {
          background-color: #fff !important;
        }
        /* Ensure the player takes full height of container */
        .video-js.vjs-fill {
          height: 100% !important;
          width: 100% !important;
        }
      `}</style>
      <div ref={videoRef} className="w-full h-full" />
    </div>
  );
};
