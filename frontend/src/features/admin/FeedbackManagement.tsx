import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeQuestionMark,
  Calendar,
  CheckCircle,
  CheckCircle2,
  CircleAlert,
  Inbox,
  Lightbulb,
  Mail,
  MoreHorizontal,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../services/supabaseClient";
import { OrbitalLoader } from "../../components/OrbitalLoader";
import type { FeedbackCategory } from "../feedback/useFeedback";

type StatusFilter = "all" | "new" | "reviewed";

interface FeedbackItem {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  message: string;
  status: "new" | "reviewed";
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
    role: string;
  } | null;
}

const CATEGORY_META: Record<
  FeedbackCategory,
  { label: string; icon: React.ReactNode; badge: string }
> = {
  question: {
    label: "Question",
    icon: <BadgeQuestionMark size={12} />,
    badge: "badge-primary",
  },
  problem: {
    label: "Not working",
    icon: <CircleAlert size={12} />,
    badge: "badge-live",
  },
  idea: {
    label: "Idea",
    icon: <Lightbulb size={12} />,
    badge: "badge-accent",
  },
  other: {
    label: "Other",
    icon: <MoreHorizontal size={12} />,
    badge: "badge-success",
  },
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
];

export const FeedbackManagement: React.FC = () => {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("new");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchFeedback = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    let query = supabase
      .from("feedback")
      .select(
        "id, user_id, category, message, status, created_at, profiles:user_id (full_name, email, role)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (!error) setItems((data as unknown as FeedbackItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFeedback(filter);
  }, [fetchFeedback, filter]);

  const handleMarkReviewed = async (id: string) => {
    setProcessingId(id);
    const { error } = await supabase
      .from("feedback")
      .update({ status: "reviewed" })
      .eq("id", id);
    if (error) {
      toast.error("Could not mark as reviewed. Please try again.");
    } else {
      toast.success("Marked as reviewed");
      fetchFeedback(filter);
    }
    setProcessingId(null);
  };

  const newCount = items.filter((i) => i.status === "new").length;

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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">
              User feedback
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              {filter === "new"
                ? `${newCount} message${newCount !== 1 ? "s" : ""} waiting for review`
                : `${items.length} message${items.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={`px-4 h-11 rounded-lg text-xs font-bold transition-colors ${
                  filter === f.value
                    ? "bg-primary text-canvas"
                    : "bg-surface border border-border text-text-secondary hover:text-text"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <OrbitalLoader variant="inline" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          {filter === "new" ? (
            <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
          ) : (
            <Inbox className="w-12 h-12 text-text-muted mx-auto mb-3" />
          )}
          <p className="text-text font-medium">
            {filter === "new" ? "All caught up!" : "No feedback yet"}
          </p>
          <p className="text-text-muted text-sm mt-1">
            {filter === "new"
              ? "Every message has been reviewed"
              : "Messages from users will appear here"}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {items.map((item) => {
            const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other;
            return (
              <div
                key={item.id}
                className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-text font-medium truncate">
                        {item.profiles?.full_name || "New seeker"}
                      </h3>
                      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 mt-1 text-sm">
                        <span className="text-text-secondary flex items-center gap-1 min-w-0">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {item.profiles?.email || "No email"}
                          </span>
                        </span>
                        <span className="text-text-muted flex items-center gap-1">
                          <Calendar className="w-3 h-3 shrink-0" />
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span
                          className={`badge ${meta.badge} inline-flex items-center gap-1`}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                        {item.status === "reviewed" ? (
                          <span className="badge badge-success inline-flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Reviewed
                          </span>
                        ) : (
                          <span className="badge badge-warning">New</span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary leading-relaxed mt-3 whitespace-pre-wrap break-words">
                        {item.message}
                      </p>
                    </div>
                  </div>
                  {item.status === "new" && (
                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                      <button
                        onClick={() => handleMarkReviewed(item.id)}
                        disabled={processingId === item.id}
                        className="flex-1 sm:flex-none h-11 px-4 rounded-lg bg-success/10 hover:bg-success/20 text-success text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 size={16} />
                        Mark as reviewed
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
