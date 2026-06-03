import React, { useState, useEffect, useCallback, useRef } from "react";
import { Play, X, PlayCircle, BookOpen, Sparkles } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { VideoPlayer } from "../../components/VideoPlayer";
import { OrbitalLoader } from "../../components/OrbitalLoader";

interface Video {
  id: string;
  title: string;
  mentor: string;
  category: string;
  duration: string;
  thumbnail: string;
  master_url: string;
  description: string;
}

export const VideoLibraryPage: React.FC = () => {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closeModal = useCallback(() => {
    previousFocusRef.current?.focus();
    setSelectedVideo(null);
  }, []);

  useEffect(() => {
    if (!selectedVideo) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    // Focus trap
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTab);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "";
    };
  }, [selectedVideo, closeModal]);

  useEffect(() => {
    async function fetchVideos() {
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (data) {
          const mappedVideos: Video[] = data.map((v) => ({
            id: v.id,
            title: v.title,
            mentor: v.metadata?.mentor || "Soul Of Universe",
            category: v.metadata?.category || "General",
            duration: v.metadata?.duration || "",
            thumbnail: v.thumb_url || "",
            master_url: v.master_url || "",
            description: v.metadata?.description || "No description available.",
          }));
          setVideos(mappedVideos);
        }
      } catch (err) {
        console.error("Error fetching videos:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <OrbitalLoader variant="inline" label="Scanning the cosmos..." />
      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-text-muted" />
        </div>
        <h2 className="text-lg font-bold text-text">The library is empty</h2>
        <p className="text-sm text-text-secondary text-center max-w-xs">
          No recordings have been added yet. Check back as new knowledge
          arrives.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <h2 className="text-lg font-bold text-text">Video library</h2>
          <p className="text-xs text-text-secondary mt-1">Recorded sessions</p>
        </div>
        <span className="section-label">{videos.length} recordings</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {videos.map((video, i) => (
          <button
            key={video.id}
            onClick={() => setSelectedVideo(video)}
            className="group cursor-pointer animate-fade-in text-left w-full focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-xl"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="relative aspect-video rounded-xl overflow-hidden bg-surface border border-border group-hover:border-border-strong transition-colors">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-nav/0 group-hover:bg-nav/40 transition-colors flex items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg shadow-primary/20">
                  <Play size={18} className="text-canvas ml-0.5 fill-current" />
                </div>
              </div>
              {video.duration && (
                <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-nav/90 backdrop-blur-sm text-white text-[10px] font-semibold rounded-md border border-white/5">
                  {video.duration}
                </div>
              )}
            </div>
            <div className="mt-3 px-0.5">
              <h3 className="text-sm font-semibold text-text group-hover:text-primary transition-colors leading-snug line-clamp-2">
                {video.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className="text-xs text-text-muted font-medium">
                  {video.mentor}
                </p>
                <span className="w-1 h-1 bg-text-muted/30 rounded-full" />
                <p className="text-xs text-text-muted font-medium">
                  {video.category}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Player modal */}
      {selectedVideo && (
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Video player: ${selectedVideo.title}`}
          className="fixed inset-0 bg-nav/95 z-[100] flex flex-col items-center justify-start md:justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <button
            ref={closeButtonRef}
            onClick={closeModal}
            className="fixed top-4 right-4 md:top-6 md:right-6 text-white/30 hover:text-white transition-colors z-[110] bg-white/[0.04] hover:bg-white/[0.08] rounded-xl p-3"
            aria-label="Close video player"
          >
            <X size={20} />
          </button>

          <div className="w-full max-w-5xl aspect-video bg-nav rounded-xl overflow-hidden shadow-2xl relative mt-12 md:mt-0 flex-shrink-0 border border-white/[0.04]">
            {selectedVideo.master_url ? (
              <VideoPlayer
                options={{
                  autoplay: true,
                  controls: true,
                  responsive: true,
                  fill: true,
                  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                  controlBar: {
                    children: [
                      "playToggle",
                      "volumePanel",
                      "currentTimeDisplay",
                      "timeDivider",
                      "durationDisplay",
                      "progressControl",
                      "spacer",
                      "playbackRateMenuButton",
                      "subsCapsButton",
                      "audioTrackButton",
                      "fullscreenToggle",
                    ],
                  },
                  sources: [
                    {
                      src: selectedVideo.master_url,
                      type: "application/x-mpegURL",
                    },
                  ],
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-nav">
                <div className="text-center space-y-3">
                  <PlayCircle className="w-12 h-12 text-white/10 mx-auto" />
                  <p className="text-white/20 text-xs font-semibold uppercase tracking-wider">
                    Video source not found
                  </p>
                  <p className="text-white/50 text-sm font-semibold">
                    {selectedVideo.title}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="max-w-5xl w-full mt-6 mb-12">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              {selectedVideo.title}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-white/30 text-xs font-medium mt-3">
              <span className="text-primary/60">{selectedVideo.mentor}</span>
              <span className="w-0.5 h-0.5 bg-white/10 rounded-full" />
              <span>{selectedVideo.category}</span>
              <span className="w-0.5 h-0.5 bg-white/10 rounded-full" />
              <span>{selectedVideo.duration}</span>
            </div>
            <p className="text-white/40 text-sm leading-relaxed mt-4 max-w-2xl">
              {selectedVideo.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
