import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { supabase } from "../../services/supabaseClient";
import type { RootState } from "../../store";

export interface Video {
  id: string;
  title: string;
  mentor: string;
  category: string;
  duration: string;
  thumbnail: string;
  master_url: string;
  description: string;
}

export interface WatchProgressEntry {
  videoId: string;
  positionSecs: number;
  durationSecs: number | null;
  completed: boolean;
  updatedAt: string;
}

interface WatchProgressRow {
  video_id: string;
  position_secs: number | string;
  duration_secs: number | string | null;
  completed: boolean;
  updated_at: string;
}

const toNum = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const mapRow = (row: WatchProgressRow): WatchProgressEntry => ({
  videoId: row.video_id,
  positionSecs: toNum(row.position_secs) ?? 0,
  durationSecs: toNum(row.duration_secs),
  completed: row.completed,
  updatedAt: row.updated_at,
});

export function useWatchProgress(videos: Video[]) {
  const { user } = useSelector((state: RootState) => state.auth);

  // Recency-ordered entries (most recent first), matching the query ordering.
  const [entries, setEntries] = useState<WatchProgressEntry[]>([]);

  useEffect(() => {
    if (!user?.id) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    async function fetchProgress() {
      const { data, error } = await supabase
        .from("video_watch_progress")
        .select("video_id, position_secs, duration_secs, completed, updated_at")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Error fetching watch progress:", error);
        return;
      }
      setEntries((data ?? []).map(mapRow));
    }

    fetchProgress();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const upsertProgress = useCallback(
    (input: {
      videoId: string;
      positionSecs: number;
      durationSecs: number | null;
      completed: boolean;
    }) => {
      if (!user?.id) return;

      const updatedAt = new Date().toISOString();
      setEntries((prev) => [
        {
          videoId: input.videoId,
          positionSecs: input.positionSecs,
          durationSecs: input.durationSecs,
          completed: input.completed,
          updatedAt,
        },
        ...prev.filter((e) => e.videoId !== input.videoId),
      ]);

      void supabase
        .from("video_watch_progress")
        .upsert(
          {
            user_id: user.id,
            video_id: input.videoId,
            position_secs: input.positionSecs,
            duration_secs: input.durationSecs,
            completed: input.completed,
            updated_at: updatedAt,
          },
          { onConflict: "user_id,video_id" },
        )
        .then(({ error }) => {
          if (error) console.error("Error saving watch progress:", error);
        });
    },
    [user?.id],
  );

  const progressMap = useMemo(() => {
    const map: Record<string, WatchProgressEntry> = {};
    for (const entry of entries) map[entry.videoId] = entry;
    return map;
  }, [entries]);

  const lastWatched = useMemo(() => {
    const knownIds = new Set(videos.map((v) => v.id));
    return entries.find((e) => knownIds.has(e.videoId)) ?? null;
  }, [entries, videos]);

  return { progressMap, lastWatched, upsertProgress };
}
