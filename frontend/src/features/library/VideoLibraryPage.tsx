import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Play, X, PlayCircle, BookOpen, Check } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { VideoPlayer } from "../../components/VideoPlayer";
import { useWatchProgress, type Video } from "./useWatchProgress";

interface ProgressView {
  percent: number;
  completed: boolean;
  timeLabel?: string;
}

function formatTimeLeft(secs: number): string {
  const totalMin = Math.max(1, Math.round(secs / 60));
  if (totalMin < 60) return `${totalMin} min left`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours} hr ${mins} min left` : `${hours} hr left`;
}

const WatchProgressBar: React.FC<{ progress: ProgressView | undefined }> = ({
  progress,
}) => {
  if (!progress || progress.percent < 1) return null;
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
      <div
        className="h-full bg-primary"
        style={{ width: `${Math.min(100, progress.percent)}%` }}
      />
    </div>
  );
};

const VideoCardSkeleton: React.FC = () => (
  <div>
    <div className="skeleton aspect-video rounded-xl" />
    <div className="mt-3 space-y-2 px-0.5">
      <div className="skeleton h-3.5 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  </div>
);

export const VideoLibraryPage: React.FC = () => {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const { progressMap, lastWatched, upsertProgress } =
    useWatchProgress(videos);

  const heroVideo = useMemo(
    () =>
      lastWatched
        ? videos.find((v) => v.id === lastWatched.videoId) ?? null
        : null,
    [lastWatched, videos],
  );

  const getProgress = useCallback(
    (videoId: string): ProgressView | undefined => {
      const entry = progressMap[videoId];
      if (!entry) return undefined;
      if (entry.completed) {
        return { percent: 100, completed: true, timeLabel: "Watched" };
      }
      if (entry.durationSecs && entry.durationSecs > 0) {
        const percent = (entry.positionSecs / entry.durationSecs) * 100;
        if (percent < 1) return undefined;
        return {
          percent,
          completed: false,
          timeLabel: formatTimeLeft(entry.durationSecs - entry.positionSecs),
        };
      }
      return undefined;
    },
    [progressMap],
  );

  const restVideos = useMemo(
    () => (heroVideo ? videos.filter((v) => v.id !== heroVideo.id) : videos),
    [heroVideo, videos],
  );

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
      <div className="space-y-8">
        <div className="border-b border-border pb-5 space-y-2">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
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

  const heroProgress = heroVideo ? getProgress(heroVideo.id) : undefined;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <h2 className="text-lg font-bold text-text">Video library</h2>
          <p className="text-xs text-text-secondary mt-1">Recorded sessions</p>
        </div>
        <span className="section-label">{videos.length} recordings</span>
      </div>

      {heroVideo && (
        <section aria-label="Continue watching">
          <h2 className="section-label">Continue watching</h2>
          <button
            onClick={() => setSelectedVideo(heroVideo)}
            className="group relative mt-3 block w-full text-left rounded-2xl overflow-hidden animate-fade-in shadow-lg shadow-black/20 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            <div className="absolute inset-0">
              <img
                src={heroVideo.thumbnail}
                alt=""
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060610] via-[#060610]/75 to-[#060610]/10 md:hidden" />
              <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-[#060610] via-[#060610]/90 to-[#060610]/25" />
            </div>

            <div className="relative flex flex-col justify-end gap-4 p-5 min-h-[200px] sm:min-h-[220px] md:flex-row md:items-end md:justify-between md:gap-8 md:p-8">
              <div className="min-w-0 space-y-2">
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight line-clamp-2">
                  {heroVideo.title}
                </h3>
                <p className="text-xs font-medium text-white/60 truncate">
                  {heroVideo.mentor} • {heroVideo.category}
                </p>
                {heroProgress?.timeLabel && (
                  <p
                    className={`text-xs font-semibold ${
                      heroProgress.completed ? "text-white/60" : "text-primary"
                    }`}
                  >
                    {heroProgress.timeLabel}
                  </p>
                )}
              </div>
              <span className="btn-primary shrink-0 self-start w-fit md:self-auto">
                <Play size={15} className="fill-current" />
                {heroProgress?.completed ? "Watch again" : "Resume"}
              </span>
            </div>

            {heroProgress && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, heroProgress.percent)}%` }}
                />
              </div>
            )}
          </button>
        </section>
      )}

      {restVideos.length > 0 && (
        <section>
          {heroVideo && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-label">All recordings</h2>
              <span className="section-label">{restVideos.length}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {restVideos.map((video, i) => {
              const progress = getProgress(video.id);
              return (
                <button
                  key={video.id}
                  onClick={() => setSelectedVideo(video)}
                  className="group cursor-pointer animate-fade-in text-left w-full focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-xl transition-transform duration-300 ease-out hover:-translate-y-1"
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
                        <Play
                          size={18}
                          className="text-canvas ml-0.5 fill-current"
                        />
                      </div>
                    </div>
                    {video.duration && (
                      <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-nav/90 backdrop-blur-sm text-white text-[10px] font-semibold rounded-md border border-white/5">
                        {video.duration}
                      </div>
                    )}
                    <WatchProgressBar progress={progress} />
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
                    {progress?.timeLabel && (
                      <p
                        className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${
                          progress.completed
                            ? "text-text-secondary"
                            : "text-primary"
                        }`}
                      >
                        {progress.completed && (
                          <Check size={12} className="shrink-0" />
                        )}
                        {progress.timeLabel}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Player modal */}
      {selectedVideo && (
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Video player: ${selectedVideo.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          className="fixed inset-0 bg-[#060610]/95 z-[100] flex flex-col items-center justify-start md:justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <button
            ref={closeButtonRef}
            onClick={closeModal}
            className="fixed top-4 right-4 md:top-6 md:right-6 text-white/30 hover:text-white transition-colors z-[110] bg-white/[0.04] hover:bg-white/[0.08] rounded-xl p-3"
            aria-label="Close video player"
          >
            <X size={20} />
          </button>

          <div className="w-full max-w-5xl aspect-video bg-[#060610] rounded-xl overflow-hidden shadow-2xl relative mt-12 md:mt-0 flex-shrink-0 border border-white/[0.04]">
            {selectedVideo.master_url ? (
              <VideoPlayer
                resumeAt={
                  progressMap[selectedVideo.id]?.completed
                    ? 0
                    : progressMap[selectedVideo.id]?.positionSecs
                }
                onProgress={({ currentTime, duration, ended }) => {
                  upsertProgress({
                    videoId: selectedVideo.id,
                    positionSecs: currentTime,
                    durationSecs: duration > 0 ? duration : null,
                    completed:
                      ended || (duration > 0 && currentTime >= duration * 0.95),
                  });
                }}
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
              <div className="absolute inset-0 flex items-center justify-center bg-[#060610]">
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
