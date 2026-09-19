import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { supabase } from "../../services/supabaseClient";
import type { RootState } from "../../store";

export interface Topic {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

export function useTopics() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("topics")
      .select("id, name, description, created_at")
      .order("name", { ascending: true });
    if (error) {
      setError("Could not load topics. Please try again.");
    } else {
      setTopics((data as Topic[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const createTopic = useCallback(
    async (name: string, description = ""): Promise<Topic | null> => {
      const clean = normalize(name);
      if (!clean || !user?.id) return null;
      const { data, error } = await supabase
        .from("topics")
        .insert({
          name: clean,
          description: description.trim(),
          created_by: user.id,
        })
        .select("id, name, description, created_at")
        .single();
      if (error || !data) return null;
      const topic = data as Topic;
      setTopics((prev) =>
        [...prev, topic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return topic;
    },
    [user?.id],
  );

  const getOrCreateTopic = useCallback(
    async (name: string): Promise<Topic | null> => {
      const clean = normalize(name);
      if (!clean) return null;
      const existing = topics.find(
        (t) => t.name.toLowerCase() === clean.toLowerCase(),
      );
      if (existing) return existing;
      const created = await createTopic(clean);
      if (created) return created;
      const { data } = await supabase
        .from("topics")
        .select("id, name, description, created_at")
        .ilike("name", clean)
        .limit(1)
        .maybeSingle();
      if (data) {
        const topic = data as Topic;
        setTopics((prev) =>
          prev.some((t) => t.id === topic.id)
            ? prev
            : [...prev, topic].sort((a, b) => a.name.localeCompare(b.name)),
        );
        return topic;
      }
      return null;
    },
    [topics, createTopic],
  );

  const renameTopic = useCallback(async (id: string, name: string) => {
    const clean = normalize(name);
    if (!clean) return false;
    const { error } = await supabase
      .from("topics")
      .update({ name: clean, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return false;
    setTopics((prev) =>
      prev
        .map((t) => (t.id === id ? { ...t, name: clean } : t))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    return true;
  }, []);

  const deleteTopic = useCallback(async (id: string) => {
    const { error } = await supabase.from("topics").delete().eq("id", id);
    if (error) return false;
    setTopics((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  return {
    topics,
    loading,
    error,
    refresh: fetchTopics,
    createTopic,
    getOrCreateTopic,
    renameTopic,
    deleteTopic,
  };
}
