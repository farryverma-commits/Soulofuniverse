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

        /* Control Bar Base - Remove !important to allow auto-hide */
        .vjs-theme-youtube .vjs-control-bar {
          background: linear-gradient(transparent, rgba(0,0,0,0.85)) !important;
          height: 60px !important;
          display: flex !important;
          padding: 0 10px !important;
          align-items: center !important;
          transition: opacity 0.3s ease, visibility 0.3s ease !important;
        }

        /* Responsive Control Bar */
        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-control-bar {
            height: 48px !important;
            padding: 0 5px !important;
          }
        }

        /* Ensure consistent icon styling */
        .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
        .vjs-theme-youtube .vjs-playback-rate .vjs-playback-rate-value,
        .vjs-theme-youtube .vjs-menu-button-popup .vjs-icon-placeholder:before {
          font-family: VideoJS !important;
          font-size: 22px !important;
          line-height: 60px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          opacity: 0.9;
          transition: opacity 0.2s, transform 0.2s;
        }

        .vjs-theme-youtube .vjs-button:hover > .vjs-icon-placeholder:before {
          opacity: 1;
          transform: scale(1.1);
        }

        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-button > .vjs-icon-placeholder:before,
          .vjs-theme-youtube .vjs-playback-rate .vjs-playback-rate-value,
          .vjs-theme-youtube .vjs-menu-button-popup .vjs-icon-placeholder:before {
            font-size: 18px !important;
            line-height: 48px !important;
          }
        }

        /* Group left controls */
        .vjs-theme-youtube .vjs-play-control,
        .vjs-theme-youtube .vjs-volume-panel,
        .vjs-theme-youtube .vjs-current-time,
        .vjs-theme-youtube .vjs-time-divider,
        .vjs-theme-youtube .vjs-duration {
          order: 1 !important;
        }
        
        /* Hide volume panel on mobile as it's often redundant and takes space */
        @media (max-width: 480px) {
          .vjs-theme-youtube .vjs-volume-panel,
          .vjs-theme-youtube .vjs-time-divider,
          .vjs-theme-youtube .vjs-duration {
            display: none !important;
          }
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
          width: 45px !important;
        }
        
        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-playback-rate,
          .vjs-theme-youtube .vjs-quality-selector,
          .vjs-theme-youtube .vjs-fullscreen-control {
            width: 36px !important;
          }
        }

        /* Fix Quality selector to look like YouTube gear */
        .vjs-theme-youtube .vjs-quality-selector .vjs-menu-button-popup .vjs-icon-placeholder:before {
          content: "\f110" !important; /* Video.js gear icon */
        }
        
        /* Style the quality menu to be cleaner */
        .vjs-theme-youtube .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
          background-color: rgba(28, 28, 28, 0.9) !important;
          border-radius: 8px !important;
          bottom: 65px !important;
          padding: 8px 0 !important;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
          backdrop-filter: blur(10px);
        }
        
        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
            bottom: 55px !important;
            width: 150px !important;
            left: -50px !important;
          }
        }

        .vjs-theme-youtube .vjs-menu-item {
          padding: 10px 20px !important;
          font-size: 13px !important;
          text-transform: none !important;
          transition: background 0.2s;
        }
        
        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-menu-item {
            padding: 12px 20px !important; /* Larger touch target */
          }
        }

        .vjs-theme-youtube .vjs-menu-item.vjs-selected {
          background-color: rgba(255, 255, 255, 0.1) !important;
          color: #FF0000 !important;
        }

        .vjs-theme-youtube .vjs-menu-item:hover {
          background-color: rgba(255, 255, 255, 0.05) !important;
        }

        /* Progress Control - Unified with Control Bar visibility */
        .vjs-theme-youtube .vjs-progress-control {
          position: absolute !important;
          width: calc(100% - 20px) !important;
          left: 10px !important;
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
          background-color: rgba(255, 255, 255, 0.2) !important;
        }

        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-progress-control {
            width: 100% !important;
            left: 0 !important;
            top: -12px !important;
            height: 24px !important;
          }
        }

        .vjs-theme-youtube .vjs-progress-control:hover .vjs-slider,
        .vjs-theme-youtube .vjs-progress-control.vjs-sliding .vjs-slider {
          height: 7px !important;
        }

        .vjs-theme-youtube .vjs-play-progress {
          background-color: #FF0000 !important;
        }

        .vjs-theme-youtube .vjs-play-progress:before {
          color: #FF0000 !important;
          font-size: 12px !important;
          top: -3px !important;
        }

        /* Big Play Button */
        .vjs-theme-youtube .vjs-big-play-button {
          background-color: rgba(255, 0, 0, 0.85) !important;
          border: none !important;
          width: 68px !important;
          height: 48px !important;
          line-height: 48px !important;
          border-radius: 12px !important;
          margin-top: -24px !important;
          margin-left: -34px !important;
          transition: transform 0.2s, background-color 0.2s !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
        }
        
        @media (max-width: 768px) {
          .vjs-theme-youtube .vjs-big-play-button {
            width: 56px !important;
            height: 40px !important;
            line-height: 40px !important;
            margin-top: -20px !important;
            margin-left: -28px !important;
          }
        }

        .vjs-theme-youtube:hover .vjs-big-play-button {
          background-color: #FF0000 !important;
          transform: scale(1.1);
        }

        .vjs-theme-youtube .vjs-load-progress {
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

        /* When the control bar is hidden, the progress bar should also follow the same logic */
        .video-js.vjs-user-inactive.vjs-playing .vjs-control-bar {
          opacity: 0 !important;
          visibility: hidden !important;
        }
      `}</style>
      <div ref={videoRef} className="w-full h-full" />
    </div>
  );
};
