import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { supabase } from "../../services/supabaseClient";
import { toSecs } from "./useVideoTimestamps";
import type { RootState } from "../../store";

export interface TopicMoment {
  id: string;
  videoId: string;
  topicId: string;
  topicName: string;
  timestampSecs: number;
  note: string | null;
  videoTitle: string;
  videoThumbnail: string;
}

interface MomentRow {
  id: string;
  video_id: string;
  topic_id: string;
  timestamp_secs: number | string;
  note: string | null;
  topics: { id: string; name: string } | null;
  videos: { id: string; title: string; thumb_url: string | null } | null;
}

const mapRow = (row: MomentRow): TopicMoment | null => {
  if (!row.videos || !row.topics) return null;
  return {
    id: row.id,
    videoId: row.video_id,
    topicId: row.topic_id,
    topicName: row.topics.name,
    timestampSecs: toSecs(row.timestamp_secs) ?? 0,
    note: row.note,
    videoTitle: row.videos.title,
    videoThumbnail: row.videos.thumb_url ?? "",
  };
};

const MOMENT_COLUMNS =
  "id, video_id, topic_id, timestamp_secs, note, topics!inner (id, name), videos!inner (id, title, thumb_url)";

async function fetchMomentsForTopics(topicIds: string[]): Promise<TopicMoment[]> {
  if (topicIds.length === 0) return [];
  const { data, error } = await supabase
    .from("video_timestamps")
    .select(MOMENT_COLUMNS)
    .in("topic_id", topicIds)
    .eq("videos.status", "published")
    .order("timestamp_secs", { ascending: true })
    .limit(50);
  if (error) throw error;
  const moments: TopicMoment[] = [];
  for (const row of (data as unknown as MomentRow[]) ?? []) {
    const m = mapRow(row);
    if (m) moments.push(m);
  }
  return moments;
}

export function useTopicSearch() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [results, setResults] = useState<TopicMoment[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const searchByTopic = useCallback(
    async (topicId: string, topicName: string) => {
      setSearching(true);
      setSearchError(false);
      try {
        const moments = await fetchMomentsForTopics([topicId]);
        setResults(moments);
      } catch {
        setResults([]);
        setSearchError(true);
      } finally {
        setSearching(false);
      }
      if (user?.id) {
        void supabase.from("topic_interactions").insert({
          user_id: user.id,
          topic_id: topicId,
          type: "search",
        });
      }
      return topicName;
    },
    [user?.id],
  );

  const logPlay = useCallback(
    (topicId: string, videoId: string) => {
      if (!user?.id) return;
      void supabase.from("topic_interactions").insert({
        user_id: user.id,
        topic_id: topicId,
        video_id: videoId,
        type: "play",
      });
    },
    [user?.id],
  );

  const clear = useCallback(() => {
    setResults([]);
    setSearchError(false);
  }, []);

  return {
    results,
    searching,
    searchError,
    searchByTopic,
    logPlay,
    clear,
  };
}
