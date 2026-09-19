import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Play, Search, X } from "lucide-react";
import { useTopics } from "./useTopics";
import { useTopicSearch, type TopicMoment } from "./useTopicSearch";
import { useTopTopics } from "./useTopicInteractions";
import { formatTimestamp } from "./useVideoTimestamps";

interface TopicSearchBarProps {
  onPlayMoment: (moment: TopicMoment) => void;
}

export const TopicSearchBar: React.FC<TopicSearchBarProps> = ({
  onPlayMoment,
}) => {
  const { topics, loading: topicsLoading } = useTopics();
  const { topTopics } = useTopTopics(3);
  const {
    results,
    searching,
    searchByTopic,
    clear,
  } = useTopicSearch();

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeTopic, setActiveTopic] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!activeTopic) return;
    if (!topics.some((t) => t.id === activeTopic.id)) {
      setActiveTopic(null);
      setResultsOpen(false);
      clear();
    }
  }, [topics, activeTopic, clear]);

  const filtered = query.trim()
    ? topics.filter((t) =>
        t.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : topics;

  const highlighted = topTopics
    .map((t) => topics.find((x) => x.id === t.topicId))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const visibleChips = expanded ? topics : topics.slice(0, 8);

  const pickTopic = (id: string, name: string) => {
    setActiveTopic({ id, name });
    setQuery("");
    setFocused(false);
    setResultsOpen(true);
    void searchByTopic(id, name);
  };

  const reset = () => {
    setQuery("");
    setFocused(false);
    setActiveTopic(null);
    setResultsOpen(false);
    clear();
  };

  const showDropdown = focused && !topicsLoading;

  return (
    <div ref={boxRef} className="relative space-y-3">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={
            topicsLoading
              ? "Loading topics…"
              : topics.length === 0
                ? "No topics yet — check back soon"
                : "Find a topic — pick from the list below…"
          }
          disabled={topics.length === 0}
          className="input w-full !pl-11 !pr-11 h-12"
          aria-label="Find a topic"
          aria-expanded={showDropdown}
          aria-controls="topic-suggestions"
          role="combobox"
          aria-autocomplete="list"
        />
        {(query || activeTopic) && (
          <button
            type="button"
            onClick={reset}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-text-muted hover:text-text transition-colors"
            aria-label="Clear topic selection"
          >
            <X size={16} />
          </button>
        )}
        {showDropdown && (
          <div
            id="topic-suggestions"
            role="listbox"
            className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-surface-raised border border-border rounded-xl shadow-xl p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-text-muted">
                {query.trim()
                  ? `No topic matches “${query.trim()}”. Try one from the list.`
                  : "No topics available yet."}
              </p>
            ) : (
              <>
                {query.trim() && (
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    {filtered.length} match{filtered.length !== 1 ? "es" : ""} —
                    pick one
                  </p>
                )}
                {filtered.slice(0, 10).map((s) => (
                  <button
                    key={s.id}
                    role="option"
                    aria-selected={activeTopic?.id === s.id}
                    onClick={() => pickTopic(s.id, s.name)}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-text hover:bg-surface transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {highlighted.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Popular topics"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Popular:
          </span>
          {highlighted.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTopic(t.id, t.name)}
              className={`badge inline-flex items-center h-11 px-3.5 transition-colors ${
                activeTopic?.id === t.id
                  ? "badge-primary"
                  : "badge-accent hover:border-primary/40"
              }`}
              aria-pressed={activeTopic?.id === t.id}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {topics.length > 0 && (
        <div aria-label="All topics">
          <div className="flex flex-wrap gap-2">
            {visibleChips.map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  activeTopic?.id === t.id ? reset() : pickTopic(t.id, t.name)
                }
                className={`badge inline-flex items-center h-11 px-3.5 transition-colors ${
                  activeTopic?.id === t.id
                    ? "badge-primary"
                    : "hover:border-primary/40"
                }`}
                aria-pressed={activeTopic?.id === t.id}
              >
                {t.name}
              </button>
            ))}
          </div>
          {topics.length > 8 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-primary transition-colors h-11 px-1"
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : `Show all ${topics.length} topics`}
              <ChevronDown
                size={14}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      )}

      {resultsOpen &&
        activeTopic &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Moments about ${activeTopic.name}`}
            className="fixed inset-0 bg-[#060610]/80 z-[100] flex items-start md:items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setResultsOpen(false);
              }
            }}
          >
            <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl p-5 md:p-6 mt-10 md:mt-0 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-base font-bold text-text truncate">
                    Moments about
                  </h2>
                  <span className="badge badge-primary flex-none">
                    {activeTopic.name}
                  </span>
                </div>
                <button
                  onClick={() => setResultsOpen(false)}
                  className="h-11 w-11 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-raised transition-colors flex-none"
                  aria-label="Close search results"
                >
                  <X size={18} />
                </button>
              </div>
              {searching ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton aspect-video rounded-xl" />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <p className="text-sm text-text-muted py-6 text-center">
                  No moments tagged “{activeTopic.name}” yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {results.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setResultsOpen(false);
                        onPlayMoment(m);
                      }}
                      className="group text-left rounded-xl overflow-hidden bg-surface-raised border border-border hover:border-primary/40 transition-colors"
                    >
                      <div className="relative aspect-video bg-[#060610]">
                        {m.videoThumbnail ? (
                          <img
                            src={m.videoThumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-[#060610]/30 group-hover:bg-[#060610]/10 transition-colors flex items-center justify-center">
                          <span className="inline-flex items-center gap-1.5 px-3 h-11 rounded-lg bg-primary text-canvas text-xs font-bold">
                            <Play size={13} className="fill-current" />
                            Play from {formatTimestamp(m.timestampSecs)}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-text line-clamp-2">
                          {m.videoTitle}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="badge badge-primary">
                            {m.topicName}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-text-muted">
                            {formatTimestamp(m.timestampSecs)}
                          </span>
                        </div>
                        {m.note && (
                          <p className="text-xs text-text-muted mt-1.5 line-clamp-2">
                            {m.note}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
