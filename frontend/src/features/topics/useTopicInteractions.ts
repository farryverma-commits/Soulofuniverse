import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { supabase } from "../../services/supabaseClient";
import type { RootState } from "../../store";

export interface TopTopic {
  topicId: string;
  topicName: string;
  playCount: number;
}

interface InteractionRow {
  topic_id: string;
  type: string;
  created_at: string;
  topics: { id: string; name: string } | null;
}

export function useTopTopics(limit = 2) {
  const { user } = useSelector((state: RootState) => state.auth);
  const [topTopics, setTopTopics] = useState<TopTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTop = useCallback(async () => {
    if (!user?.id) {
      setTopTopics([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("topic_interactions")
      .select("topic_id, type, created_at, topics (id, name)")
      .eq("user_id", user.id)
      .eq("type", "play")
      .order("created_at", { ascending: false })
      .limit(200);
    const counts = new Map<string, { name: string; count: number }>();
    for (const row of (data as unknown as InteractionRow[]) ?? []) {
      const name = row.topics?.name;
      if (!name) continue;
      const entry = counts.get(row.topic_id) ?? { name, count: 0 };
      entry.count += 1;
      counts.set(row.topic_id, entry);
    }
    setTopTopics(
      [...counts.entries()]
        .map(([topicId, v]) => ({
          topicId,
          topicName: v.name,
          playCount: v.count,
        }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit),
    );
    setLoading(false);
  }, [user?.id, limit]);

  useEffect(() => {
    fetchTop();
  }, [fetchTop]);

  return { topTopics, loading, refresh: fetchTop };
}

export interface TrendingTopic {
  topicId: string;
  topicName: string;
  playCount: number;
  searchCount: number;
}

export function useTrendingTopics(limit = 10) {
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data } = await supabase
      .from("topic_interactions")
      .select("topic_id, type, topics (id, name)")
      .gte("created_at", since)
      .limit(1000);
    const counts = new Map<
      string,
      { name: string; play: number; search: number }
    >();
    for (const row of (data as unknown as InteractionRow[]) ?? []) {
      const name = row.topics?.name;
      if (!name) continue;
      const entry = counts.get(row.topic_id) ?? { name, play: 0, search: 0 };
      if (row.type === "play") entry.play += 1;
      else if (row.type === "search") entry.search += 1;
      counts.set(row.topic_id, entry);
    }
    setTrending(
      [...counts.entries()]
        .map(([topicId, v]) => ({
          topicId,
          topicName: v.name,
          playCount: v.play,
          searchCount: v.search,
        }))
        .sort((a, b) => b.playCount - a.playCount || b.searchCount - a.searchCount)
        .slice(0, limit),
    );
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  return { trending, loading, refresh: fetchTrending };
}
