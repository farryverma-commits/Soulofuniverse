import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { supabase } from "../../services/supabaseClient";
import type { RootState } from "../../store";

export interface VideoTimestamp {
  id: string;
  videoId: string;
  topicId: string;
  topicName: string;
  timestampSecs: number;
  note: string | null;
  created_at: string;
}

interface TimestampRow {
  id: string;
  video_id: string;
  topic_id: string;
  timestamp_secs: number | string;
  note: string | null;
  created_at: string;
  topics: { id: string; name: string } | null;
}

export const toSecs = (
  value: number | string | null | undefined,
): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

export const formatTimestamp = (secs: number): string => {
  const total = Math.max(0, Math.floor(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const mapRow = (row: TimestampRow): VideoTimestamp => ({
  id: row.id,
  videoId: row.video_id,
  topicId: row.topic_id,
  topicName: row.topics?.name ?? "Unknown topic",
  timestampSecs: toSecs(row.timestamp_secs) ?? 0,
  note: row.note,
  created_at: row.created_at,
});

export function useVideoTimestamps(videoId: string | null) {
  const { user } = useSelector((state: RootState) => state.auth);
  const [marks, setMarks] = useState<VideoTimestamp[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMarks = useCallback(async () => {
    if (!videoId) {
      setMarks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("video_timestamps")
      .select("id, video_id, topic_id, timestamp_secs, note, created_at, topics (id, name)")
      .eq("video_id", videoId)
      .order("timestamp_secs", { ascending: true });
    if (!error) setMarks((data as unknown as TimestampRow[] ?? []).map(mapRow));
    setLoading(false);
  }, [videoId]);

  useEffect(() => {
    fetchMarks();
  }, [fetchMarks]);

  const addMark = useCallback(
    async (input: {
      topicId: string;
      timestampSecs: number;
      note?: string;
    }): Promise<VideoTimestamp | null> => {
      if (!videoId || !user?.id) return null;
      const rounded = Math.max(0, Math.round(input.timestampSecs * 100) / 100);
      const { data, error } = await supabase
        .from("video_timestamps")
        .insert({
          video_id: videoId,
          topic_id: input.topicId,
          timestamp_secs: rounded,
          note: input.note?.trim() ? input.note.trim() : null,
          created_by: user.id,
        })
        .select("id, video_id, topic_id, timestamp_secs, note, created_at, topics (id, name)")
        .single();
      if (error || !data) return null;
      const mark = mapRow(data as unknown as TimestampRow);
      setMarks((prev) =>
        [...prev, mark].sort((a, b) => a.timestampSecs - b.timestampSecs),
      );
      return mark;
    },
    [videoId, user?.id],
  );

  const removeMark = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("video_timestamps")
      .delete()
      .eq("id", id);
    if (error) return false;
    setMarks((prev) => prev.filter((m) => m.id !== id));
    return true;
  }, []);

  return { marks, loading, refresh: fetchMarks, addMark, removeMark };
}
