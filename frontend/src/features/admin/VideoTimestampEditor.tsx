import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  Loader2,
  MapPin,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../services/supabaseClient";
import { VideoPlayer } from "../../components/VideoPlayer";
import { OrbitalLoader } from "../../components/OrbitalLoader";
import { useTopics } from "../topics/useTopics";
import {
  formatTimestamp,
  useVideoTimestamps,
} from "../topics/useVideoTimestamps";
import type { VideoStatus } from "./VideoReviewQueue";

interface EditorVideo {
  id: string;
  title: string;
  master_url: string | null;
  status: VideoStatus;
}

export const VideoTimestampEditor: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const [video, setVideo] = useState<EditorVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const [draftTime, setDraftTime] = useState<number | null>(null);
  const [topicQuery, setTopicQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  const { topics, getOrCreateTopic } = useTopics();
  const { marks, addMark, removeMark } = useVideoTimestamps(videoId ?? null);

  const fetchVideo = useCallback(async () => {
    if (!videoId) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("videos")
      .select("id, title, master_url, status")
      .eq("id", videoId)
      .single();
    if (error || !data) {
      toast.error("Video not found.");
      navigate("/admin/videos");
      return;
    }
    setVideo(data as EditorVideo);
    setLoading(false);
  }, [videoId, navigate]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleReady = useCallback((p: any) => {
    playerRef.current = p;
    setPlayer(p);
  }, []);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.paused()) {
      p.play();
      setPlaying(true);
    } else {
      p.pause();
      setPlaying(false);
    }
  };

  const step = (delta: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.currentTime(Math.max(0, p.currentTime() + delta));
    } catch {
      /* ignore */
    }
  };

  const seekTo = (secs: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.currentTime(secs);
      p.play();
      setPlaying(true);
    } catch {
      /* ignore */
    }
  };

  const markCurrentTime = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const t = p.currentTime();
      if (typeof t === "number" && Number.isFinite(t) && t >= 0) {
        setDraftTime(Math.round(t * 100) / 100);
        setPickerOpen(true);
      }
    } catch {
      /* ignore */
    }
  };

  const filteredTopics = topicQuery.trim()
    ? topics.filter((t) =>
        t.name.toLowerCase().includes(topicQuery.trim().toLowerCase()),
      )
    : topics;

  const exactExists =
    topicQuery.trim().length > 0 &&
    topics.some(
      (t) => t.name.toLowerCase() === topicQuery.trim().toLowerCase(),
    );

  const handleSaveMark = async (topicName: string, createNew: boolean) => {
    if (draftTime === null) return;
    const nearDupe = marks.some(
      (m) =>
        m.topicName.toLowerCase() === topicName.trim().toLowerCase() &&
        Math.abs(m.timestampSecs - draftTime) <= 3,
    );
    if (nearDupe) {
      toast.error("This topic is already marked within 3 seconds of here.");
      return;
    }
    setSaving(true);
    const topic = createNew
      ? await getOrCreateTopic(topicName)
      : (topics.find(
          (t) => t.name.toLowerCase() === topicName.trim().toLowerCase(),
        ) ?? (await getOrCreateTopic(topicName)));
    if (!topic) {
      toast.error("Could not save topic. Please try again.");
      setSaving(false);
      return;
    }
    const mark = await addMark({
      topicId: topic.id,
      timestampSecs: draftTime,
      note,
    });
    if (mark) {
      toast.success(`Marked “${topic.name}” at ${formatTimestamp(draftTime)}`);
      setDraftTime(null);
      setTopicQuery("");
      setNote("");
      setPickerOpen(false);
    } else {
      toast.error("Could not save timestamp. Please try again.");
    }
    setSaving(false);
  };

  const handleDeleteMark = async () => {
    if (!deleteId) return;
    const ok = await removeMark(deleteId);
    if (ok) toast.success("Timestamp removed");
    else toast.error("Could not remove timestamp. Please try again.");
    setDeleteId(null);
  };

  const togglePublish = async () => {
    if (!video) return;
    const toPublished = video.status !== "published";
    if (toPublished && marks.length === 0) {
      toast(
        "Publishing without timestamps — users can watch but topic search won't find it.",
        { icon: "⚠️" },
      );
    }
    setPublishing(true);
    const { error } = await supabase
      .from("videos")
      .update({ status: toPublished ? "published" : "under_review" })
      .eq("id", video.id);
    if (error) {
      toast.error("Could not update status. Please try again.");
    } else {
      setVideo({
        ...video,
        status: toPublished ? "published" : "under_review",
      });
      toast.success(
        toPublished ? "Video is live in the library" : "Video hidden from the library",
      );
    }
    setPublishing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <OrbitalLoader variant="inline" />
      </div>
    );
  }

  if (!video) return null;

  const published = video.status === "published";

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/videos"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to review queue
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-text tracking-tight truncate">
              {video.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className={`badge ${published ? "badge-success" : "badge-warning"}`}
              >
                {published ? "Published" : "Under review"}
              </span>
              <span className="text-xs text-text-muted">
                {marks.length} timestamp{marks.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <button
            onClick={togglePublish}
            disabled={publishing}
            className={`flex-none h-11 px-5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
              published
                ? "bg-danger/10 hover:bg-danger/20 text-danger"
                : "bg-success/10 hover:bg-success/20 text-success"
            }`}
          >
            {publishing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : published ? (
              <EyeOff size={14} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="aspect-video bg-[#060610] rounded-xl overflow-hidden border border-border">
            {video.master_url ? (
              <VideoPlayer
                exactSeek
                onReady={handleReady}
                onProgress={({ currentTime }) => setCurrentTime(currentTime)}
                options={{
                  autoplay: false,
                  controls: true,
                  responsive: true,
                  fill: true,
                  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
                  sources: [
                    { src: video.master_url, type: "application/x-mpegURL" },
                  ],
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-white/30 text-sm">Video source not ready</p>
              </div>
            )}
          </div>

          <div className="card p-4 flex flex-wrap items-center gap-2">
            <button
              onClick={togglePlay}
              disabled={!player}
              className="btn-primary h-11 w-11 !px-0 justify-center flex-none disabled:opacity-50"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={() => step(-10)}
              disabled={!player}
              className="btn-secondary h-11 px-4 flex-none disabled:opacity-50"
              aria-label="Back 10 seconds"
            >
              <RotateCcw size={16} />
              10s
            </button>
            <button
              onClick={() => step(10)}
              disabled={!player}
              className="btn-secondary h-11 px-4 flex-none disabled:opacity-50"
              aria-label="Forward 10 seconds"
            >
              <RotateCw size={16} />
              10s
            </button>
            <span className="text-sm font-mono font-semibold text-text ml-1">
              {formatTimestamp(currentTime)}
            </span>
            <button
              onClick={markCurrentTime}
              disabled={!player}
              className="btn-primary h-11 px-5 ml-auto disabled:opacity-50"
            >
              <MapPin size={15} />
              Mark current time
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {draftTime !== null && (
            <div className="card p-5 space-y-3 border-primary/40">
              <h2 className="section-label">
                New mark at {formatTimestamp(draftTime)}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setDraftTime((t) => (t === null ? t : Math.max(0, t - 1)))
                  }
                  className="btn-secondary h-11 w-11 !px-0 justify-center flex-none"
                  aria-label="One second earlier"
                >
                  <Minus size={14} />
                </button>
                <span className="flex-1 text-center text-lg font-mono font-bold text-text">
                  {formatTimestamp(draftTime)}
                </span>
                <button
                  onClick={() =>
                    setDraftTime((t) => (t === null ? t : t + 1))
                  }
                  className="btn-secondary h-11 w-11 !px-0 justify-center flex-none"
                  aria-label="One second later"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div ref={pickerRef} className="relative">
                <input
                  value={topicQuery}
                  onChange={(e) => {
                    setTopicQuery(e.target.value);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  placeholder="Search topics or type a new one…"
                  className="input w-full"
                  aria-label="Topic for this mark"
                />
                {pickerOpen && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-surface-raised border border-border rounded-xl shadow-xl p-1">
                    {topicQuery.trim() && !exactExists && (
                      <button
                        onClick={() => handleSaveMark(topicQuery, true)}
                        disabled={saving}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        + Create “{topicQuery.trim()}”
                      </button>
                    )}
                    {filteredTopics.slice(0, 8).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSaveMark(t.name, false)}
                        disabled={saving}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-text hover:bg-surface transition-colors disabled:opacity-50"
                      >
                        {t.name}
                      </button>
                    ))}
                    {filteredTopics.length === 0 && !topicQuery.trim() && (
                      <p className="px-3 py-2.5 text-sm text-text-muted">
                        No topics yet — type a name above to create one.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional, 280 chars)"
                maxLength={280}
                className="input w-full"
                aria-label="Mark note"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDraftTime(null);
                    setTopicQuery("");
                    setNote("");
                    setPickerOpen(false);
                  }}
                  className="btn-secondary h-11 px-4 flex-1"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                Pick a topic or create it inline — no need to leave this page.
              </p>
            </div>
          )}

          <div className="card p-5">
            <h2 className="section-label mb-3">
              Timestamps ({marks.length})
            </h2>
            {marks.length === 0 ? (
              <p className="text-sm text-text-muted">
                No timestamps yet. Play the video and hit “Mark current time”.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {marks.map((mark) => (
                  <div
                    key={mark.id}
                    className="flex items-center gap-2 bg-surface-raised border border-border rounded-lg px-3 py-2.5"
                  >
                    <button
                      onClick={() => seekTo(mark.timestampSecs)}
                      className="min-w-0 flex-1 text-left group"
                      title="Jump to this moment"
                    >
                      <span className="text-xs font-mono font-bold text-primary">
                        {formatTimestamp(mark.timestampSecs)}
                      </span>
                      <span className="block text-sm text-text font-medium truncate group-hover:text-primary transition-colors">
                        {mark.topicName}
                      </span>
                      {mark.note && (
                        <span className="block text-xs text-text-muted truncate">
                          {mark.note}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteId(mark.id)}
                      className="flex-none h-11 w-11 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 inline-flex items-center justify-center transition-colors"
                      aria-label={`Remove ${mark.topicName} mark`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {deleteId && (
        <div
          className="fixed inset-0 bg-[#060610]/80 z-[100] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Remove timestamp"
            className="card max-w-sm w-full p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-text">Remove timestamp?</h2>
            <p className="text-sm text-text-secondary">
              Users will no longer find this moment through topic search.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="btn-secondary h-11 px-5"
              >
                Keep it
              </button>
              <button
                onClick={handleDeleteMark}
                className="h-11 px-5 rounded-lg bg-danger hover:bg-danger/90 text-white text-xs font-bold transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
