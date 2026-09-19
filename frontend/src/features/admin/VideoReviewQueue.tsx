import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  EyeOff,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../services/supabaseClient";
import { OrbitalLoader } from "../../components/OrbitalLoader";

export type VideoStatus = "processing" | "under_review" | "published" | "failed";

export interface ReviewVideo {
  id: string;
  title: string;
  thumbnail: string;
  status: VideoStatus;
  created_at: string;
  timestampCount: number;
}

const STATUS_META: Record<VideoStatus, { label: string; badge: string }> = {
  under_review: { label: "Needs review", badge: "badge-warning" },
  processing: { label: "Processing", badge: "badge-accent" },
  failed: { label: "Failed", badge: "badge-live" },
  published: { label: "Published", badge: "badge-success" },
};

export const VideoReviewQueue: React.FC = () => {
  const [videos, setVideos] = useState<ReviewVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchVideos = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("videos")
      .select("id, title, thumb_url, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setLoadError(true);
      if (!silent) toast.error("Could not load videos. Please try again.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const rows = ((data as unknown as {
      id: string;
      title: string;
      thumb_url: string | null;
      status: VideoStatus;
      created_at: string;
    }[]) ?? []);
    const ids = rows.map((r) => r.id);
    let counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: marks } = await supabase
        .from("video_timestamps")
        .select("video_id")
        .in("video_id", ids);
      for (const row of (marks as { video_id: string }[] | null) ?? []) {
        counts[row.video_id] = (counts[row.video_id] ?? 0) + 1;
      }
    }
    const order: Record<VideoStatus, number> = {
      under_review: 0,
      failed: 1,
      processing: 2,
      published: 3,
    };
    setVideos(
      rows
        .map((r) => ({
          id: r.id,
          title: r.title,
          thumbnail: r.thumb_url ?? "",
          status: r.status as VideoStatus,
          created_at: r.created_at,
          timestampCount: counts[r.id] ?? 0,
        }))
        .sort((a, b) => order[a.status] - order[b.status]),
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const togglePublish = async (video: ReviewVideo) => {
    const toStatus: VideoStatus =
      video.status === "published" ? "under_review" : "published";
    setTogglingId(video.id);
    const { error } = await supabase
      .from("videos")
      .update({ status: toStatus })
      .eq("id", video.id);
    if (error) {
      toast.error("Could not update video status. Please try again.");
    } else if (toStatus === "published") {
      toast.success(
        video.timestampCount === 0
          ? `"${video.title}" is live — consider adding timestamps`
          : `"${video.title}" is live in the library`,
      );
      fetchVideos(true);
    } else {
      toast.success(`"${video.title}" hidden from the library`);
      fetchVideos(true);
    }
    setTogglingId(null);
  };

  const pendingCount = videos.filter((v) => v.status === "under_review").length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to admin
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">
              Video review
            </h1>
            <p className="text-text-secondary text-sm mt-1" role="status">
              {pendingCount > 0
                ? `${pendingCount} video${pendingCount !== 1 ? "s" : ""} waiting for timestamping and publish`
                : "Every video has been reviewed"}
            </p>
          </div>
          <button
            onClick={() => fetchVideos(true)}
            disabled={loading || refreshing}
            className="btn-secondary h-11 px-4 flex-none self-start sm:self-auto disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <OrbitalLoader variant="inline" />
        </div>
      ) : loadError && videos.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <CircleAlert className="w-12 h-12 text-danger mx-auto" />
          <p className="text-text font-medium">Could not load videos</p>
          <p className="text-text-muted text-sm">
            Check your connection and try again. Your work is safe.
          </p>
          <button
            onClick={() => fetchVideos()}
            className="btn-primary h-11 px-5 mx-auto"
          >
            Try again
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="card p-8 text-center">
          <Clapperboard className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text font-medium">No videos yet</p>
          <p className="text-text-muted text-sm mt-1">
            Transcoded uploads will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
          {videos.map((video) => {
            const meta = STATUS_META[video.status];
            const published = video.status === "published";
            return (
              <div
                key={video.id}
                className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    to={`/admin/videos/${video.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1 group"
                  >
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt=""
                        className="w-24 aspect-video object-cover rounded-lg bg-[#060610] shrink-0"
                      />
                    ) : (
                      <div className="w-24 aspect-video rounded-lg bg-[#060610] border border-border flex items-center justify-center shrink-0">
                        <Clapperboard className="w-6 h-6 text-white/20" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-text font-semibold truncate group-hover:text-primary transition-colors">
                        {video.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className={`badge ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-text-muted">
                          {video.timestampCount} timestamp
                          {video.timestampCount !== 1 ? "s" : ""}
                        </span>
                        {published && video.timestampCount === 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                            <CircleAlert size={12} />
                            No timestamps yet
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex gap-2 w-full sm:w-auto shrink-0">
                    <Link
                      to={`/admin/videos/${video.id}`}
                      className="flex-1 sm:flex-none h-11 px-4 rounded-lg bg-surface-raised border border-border text-text-secondary hover:text-text text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      Timestamp
                    </Link>
                    <button
                      onClick={() => togglePublish(video)}
                      disabled={togglingId === video.id}
                      aria-label={
                        published
                          ? `Unpublish ${video.title}`
                          : `Publish ${video.title}`
                      }
                      className={`flex-1 sm:flex-none h-11 px-4 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                        published
                          ? "bg-danger/10 hover:bg-danger/20 text-danger"
                          : "bg-success/10 hover:bg-success/20 text-success"
                      }`}
                    >
                      {togglingId === video.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : published ? (
                        <EyeOff size={14} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {togglingId === video.id
                        ? published
                          ? "Unpublishing…"
                          : "Publishing…"
                        : published
                          ? "Unpublish"
                          : "Publish"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
