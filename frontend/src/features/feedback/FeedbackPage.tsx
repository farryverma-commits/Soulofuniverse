import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BadgeQuestionMark,
  CheckCircle2,
  CircleAlert,
  Lightbulb,
  MessageSquare,
  MoreHorizontal,
  Send,
} from "lucide-react";
import toast from "react-hot-toast";
import { OrbitalLoader } from "../../components/OrbitalLoader";
import { useFeedback } from "./useFeedback";
import type { FeedbackCategory } from "./useFeedback";

const MAX_LENGTH = 5000;

const CATEGORIES: {
  value: FeedbackCategory;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "question",
    label: "I have a question",
    hint: "Ask about a class, booking, or video",
    icon: <BadgeQuestionMark size={18} />,
  },
  {
    value: "problem",
    label: "Something is not working",
    hint: "Tell us what went wrong",
    icon: <CircleAlert size={18} />,
  },
  {
    value: "idea",
    label: "I have an idea",
    hint: "Suggest something new",
    icon: <Lightbulb size={18} />,
  },
  {
    value: "other",
    label: "Something else",
    hint: "Anything on your mind",
    icon: <MoreHorizontal size={18} />,
  },
];

export const FeedbackPage: React.FC = () => {
  const { submit, loading, error, succeeded, reset } = useFeedback();
  const [category, setCategory] = useState<FeedbackCategory>("question");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submit(category, message);
    if (ok) toast.success("Thank you! We received your feedback.");
    else toast.error("Could not send your feedback. Please try again.");
  };

  const handleSendAnother = () => {
    setCategory("question");
    setMessage("");
    reset();
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-text tracking-tight">
          Share your feedback
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Ask a question or tell us how to make things better. We read every
          message.
        </p>
      </div>

      <div className="max-w-[640px]">
        <div className="card card-glow p-6">
          {succeeded ? (
            <div className="text-center py-8 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-success" />
              </div>
              <h2 className="text-lg font-bold text-text mb-2">
                Thank you! We received your feedback.
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed mb-8 max-w-[380px] mx-auto">
                Our team will read your message and get back to you if needed.
              </p>
              <button
                onClick={handleSendAnother}
                className="btn-secondary min-h-[44px]"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <span
                  id="feedback-category-label"
                  className="text-xs font-semibold text-text-secondary tracking-wide"
                >
                  What is this about?
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="feedback-category-label"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  {CATEGORIES.map((option) => {
                    const selected = category === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setCategory(option.value)}
                        className={`flex items-center gap-3 text-left px-4 py-3 rounded-xl border min-h-[44px] transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-surface hover:border-border-strong"
                        }`}
                      >
                        <span
                          className={
                            selected ? "text-primary" : "text-text-muted"
                          }
                        >
                          {option.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-text">
                            {option.label}
                          </span>
                          <span className="block text-xs text-text-secondary truncate">
                            {option.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feedback-message"
                  className="text-xs font-semibold text-text-secondary tracking-wide"
                >
                  Tell us in your own words
                </label>
                <div className="relative group">
                  <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                  <textarea
                    id="feedback-message"
                    required
                    rows={5}
                    maxLength={MAX_LENGTH}
                    className="input pl-11 text-sm resize-none"
                    placeholder="Example: I tried to join my class but..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-text-muted text-right">
                  {message.length} / {MAX_LENGTH}
                </p>
              </div>

              {error && (
                <div className="bg-error/8 text-error px-4 py-3 rounded-xl text-sm font-medium border border-error/10 animate-fade-in">
                  {error}
                </div>
              )}

              <button
                disabled={loading}
                className="btn-primary w-full py-3 text-sm min-h-[44px]"
              >
                {loading ? (
                  <OrbitalLoader variant="button" />
                ) : (
                  <>
                    <Send size={15} /> Send feedback
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
