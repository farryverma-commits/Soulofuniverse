import React, { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { useTopTopics } from "./useTopicInteractions";
import type { Video } from "../library/useWatchProgress";

interface PersonalTopicRowProps {
  videos: Video[];
  onPlayVideo: (video: Video, resumeAt?: number) => void;
}

export const PersonalTopicRow: React.FC<PersonalTopicRowProps> = ({
  videos,
  onPlayVideo,
}) => {
  const { topTopics, loading } = useTopTopics(2);
  const [videoIds, setVideoIds] = useState<string[]>([]);

  const top = topTopics[0] ?? null;

  useEffect(() => {
    async function fetchVideosForTopic(topicId: string) {
      const { data } = await supabase
        .from("video_timestamps")
        .select("video_id, videos!inner (id, status)")
        .eq("topic_id", topicId)
        .eq("videos.status", "published")
        .order("timestamp_secs", { ascending: true })
        .limit(20);
      const ids: string[] = [];
      for (const row of (data as { video_id: string }[] | null) ?? []) {
        if (!ids.includes(row.video_id)) ids.push(row.video_id);
      }
      setVideoIds(ids.slice(0, 8));
    }
    if (top) fetchVideosForTopic(top.topicId);
    else setVideoIds([]);
  }, [top?.topicId]);

  if (loading || !top) return null;
  const row = videos.filter((v) => videoIds.includes(v.id));
  if (row.length === 0) return null;

  return (
    <section aria-label={`Because you watch ${top.topicName}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-label">Because you watch {top.topicName}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {row.map((video) => (
          <button
            key={video.id}
            onClick={() => onPlayVideo(video)}
            className="group cursor-pointer text-left w-56 sm:w-64 flex-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-xl transition-transform duration-300 ease-out hover:-translate-y-1"
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
            </div>
            <div className="mt-3 px-0.5">
              <h3 className="text-sm font-semibold text-text group-hover:text-primary transition-colors leading-snug line-clamp-2">
                {video.title}
              </h3>
              <p className="text-xs text-text-muted font-medium mt-1.5">
                {video.mentor}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
