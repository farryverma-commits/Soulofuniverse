import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, TrendingUp, X } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../services/supabaseClient";
import { OrbitalLoader } from "../../components/OrbitalLoader";
import { useTopics } from "../topics/useTopics";
import { useTrendingTopics } from "../topics/useTopicInteractions";

export const TopicManagement: React.FC = () => {
  const {
    topics,
    loading,
    createTopic,
    renameTopic,
    deleteTopic,
  } = useTopics();
  const { trending } = useTrendingTopics(5);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      if (topics.length === 0) {
        setUsage({});
        return;
      }
      const { data } = await supabase
        .from("video_timestamps")
        .select("topic_id")
        .in(
          "topic_id",
          topics.map((t) => t.id),
        );
      const counts: Record<string, number> = {};
      for (const row of (data as { topic_id: string }[] | null) ?? []) {
        counts[row.topic_id] = (counts[row.topic_id] ?? 0) + 1;
      }
      setUsage(counts);
    }
    fetchUsage();
  }, [topics]);

  useEffect(() => {
    if (!deleteTarget) return;
    deleteTriggerRef.current = document.activeElement as HTMLElement;
    confirmButtonRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteTarget(null);
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
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
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      deleteTriggerRef.current?.focus();
    };
  }, [deleteTarget]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const topic = await createTopic(name, description);
    if (topic) {
      toast.success(`Topic "${topic.name}" added`);
      setName("");
      setDescription("");
    } else {
      toast.error("Could not add topic. It may already exist.");
    }
    setCreating(false);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    const ok = await renameTopic(id, editName);
    if (ok) {
      toast.success("Topic renamed");
      setEditingId(null);
    } else {
      toast.error("Could not rename. That name may already exist.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const count = usage[deleteTarget.id] ?? 0;
    if (count > 0) {
      toast.error(
        `"${deleteTarget.name}" is used by ${count} timestamp${count !== 1 ? "s" : ""}. Remove them first.`,
      );
      setDeleting(false);
      setDeleteTarget(null);
      return;
    }
    const ok = await deleteTopic(deleteTarget.id);
    if (ok) {
      toast.success("Topic deleted");
    } else {
      toast.error("Could not delete topic. It may still be in use.");
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

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
        <h1 className="text-2xl font-bold text-text tracking-tight">Topics</h1>
        <p className="text-text-secondary text-sm mt-1">
          Master list of tags used to timestamp videos. Admins can also create
          topics inline while timestamping.
        </p>
      </div>

      {trending.length > 0 && (
        <section aria-label="Trending topics" className="card p-5">
          <h2 className="section-label flex items-center gap-1.5">
            <TrendingUp size={13} />
            Trending last 30 days
          </h2>
          <div className="flex flex-wrap gap-2 mt-3">
            {trending.map((t) => (
              <span
                key={t.topicId}
                className="badge badge-primary inline-flex items-center gap-1.5"
              >
                {t.topicName}
                <span className="opacity-70">
                  {t.playCount} play{t.playCount !== 1 ? "s" : ""}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={handleCreate} className="card p-5 space-y-3">
        <h2 className="section-label">Add a topic</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Topic name, e.g. Breathwork basics"
            maxLength={80}
            className="input flex-1"
            aria-label="Topic name"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="btn-primary h-11 px-5 flex-none disabled:opacity-50"
          >
            <Plus size={16} />
            Add topic
          </button>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description (optional)"
          maxLength={280}
          className="input w-full"
          aria-label="Topic description"
        />
      </form>

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <OrbitalLoader variant="inline" />
        </div>
      ) : topics.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-text font-medium">No topics yet</p>
          <p className="text-text-muted text-sm mt-1">
            Add the first topic above, or create one while timestamping a video.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {topics.map((topic) => {
            const count = usage[topic.id] ?? 0;
            const isEditing = editingId === topic.id;
            return (
              <div
                key={topic.id}
                className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={80}
                          className="input flex-1"
                          aria-label="Rename topic"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRename(topic.id)}
                          className="btn-primary h-11 px-4 flex-none"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="btn-secondary h-11 px-4 flex-none"
                          aria-label="Cancel rename"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-text font-semibold truncate">
                          {topic.name}
                        </h3>
                        <p className="text-xs text-text-muted mt-1">
                          Used by {count} timestamp{count !== 1 ? "s" : ""}
                          {topic.description ? ` • ${topic.description}` : ""}
                        </p>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(topic.id);
                          setEditName(topic.name);
                        }}
                        className="flex-1 sm:flex-none h-11 px-4 rounded-lg bg-surface-raised border border-border text-text-secondary hover:text-text text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                        aria-label={`Rename ${topic.name}`}
                      >
                        <Pencil size={14} />
                        Rename
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({ id: topic.id, name: topic.name })
                        }
                        className="flex-1 sm:flex-none h-11 px-4 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                        aria-label={`Delete ${topic.name}`}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-[#060610]/80 z-[100] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Delete topic ${deleteTarget.name}`}
            className="card max-w-md w-full p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-text">
              Delete “{deleteTarget.name}”?
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {(usage[deleteTarget.id] ?? 0) > 0 ? (
                <>
                  This topic is used by{" "}
                  {usage[deleteTarget.id] ?? 0} timestamp
                  {(usage[deleteTarget.id] ?? 0) !== 1 ? "s" : ""}. Remove
                  those timestamps first — the database will block deleting a
                  topic that is still in use.
                </>
              ) : (
                "This topic is not used by any video yet. This cannot be undone."
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn-secondary h-11 px-5"
              >
                Keep it
              </button>
              <button
                ref={confirmButtonRef}
                onClick={handleDelete}
                disabled={deleting}
                className="h-11 px-5 rounded-lg bg-danger hover:bg-danger/90 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
