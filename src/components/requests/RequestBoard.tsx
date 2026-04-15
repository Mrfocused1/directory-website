"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDate } from "@/lib/utils";
import { STATUS_CONFIG, type ContentRequest } from "@/lib/requests/mock-data";

type Sort = "votes" | "newest";
type StatusFilter = "all" | ContentRequest["status"];

export default function RequestBoard({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [sort, setSort] = useState<Sort>("votes");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const params = new URLSearchParams({ siteId, sort, status: statusFilter });
      const res = await fetch(`/api/requests?${params}`);
      const data = await res.json();
      setRequests(data.requests);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [siteId, sort, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleVote = async (requestId: string) => {
    // Optimistic update
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, voteCount: r.hasVoted ? r.voteCount - 1 : r.voteCount + 1, hasVoted: !r.hasVoted }
          : r,
      ),
    );

    // Get sessionId for vote tracking
    const sessionId = typeof window !== "undefined"
      ? (sessionStorage.getItem("bmd_session") || crypto.randomUUID())
      : "unknown";
    if (typeof window !== "undefined" && !sessionStorage.getItem("bmd_session")) {
      sessionStorage.setItem("bmd_session", sessionId);
    }

    await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "vote", sessionId }),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, title, description, authorName }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests((prev) => [data.request, ...prev]);
        setTitle("");
        setDescription("");
        setAuthorName("");
        setShowForm(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusCounts = requests.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      acc.all++;
      return acc;
    },
    { all: 0 } as Record<string, number>,
  );

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-[var(--bg)]/70 via-[var(--bg)]/30 to-[var(--bg)]/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <main className="container mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-20 max-w-3xl">
          {/* Header */}
          <header className="text-center mb-8 animate-fade-in">
            <a href={`/${siteId}`} className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition">
              &larr; Back to {siteName}
            </a>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mt-3 mb-2">
              Content Requests
            </h1>
            <p className="text-sm sm:text-base text-[color:var(--fg-muted)] max-w-lg mx-auto">
              Suggest topics you&apos;d like to see covered. Vote on others&apos; suggestions to help prioritize.
            </p>
          </header>

          {/* Submit button */}
          <div className="flex justify-center mb-6 animate-fade-in">
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="h-11 px-6 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-full text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Suggest a Topic
            </button>
          </div>

          {/* Submit form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden mb-6"
              >
                <form
                  onSubmit={handleSubmit}
                  className="bg-white border-2 border-[color:var(--fg)] rounded-2xl p-5 space-y-4"
                >
                  <div>
                    <label htmlFor="req-title" className="text-sm font-semibold mb-1.5 block">
                      What topic should be covered?
                    </label>
                    <input
                      id="req-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. The economics of African football transfers"
                      required
                      maxLength={200}
                      className="w-full h-12 px-4 bg-white border border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                    />
                  </div>
                  <div>
                    <label htmlFor="req-desc" className="text-sm font-semibold mb-1.5 block">
                      Details <span className="font-normal text-[color:var(--fg-subtle)]">(optional)</span>
                    </label>
                    <textarea
                      id="req-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Any specific angles or questions you'd like covered?"
                      rows={3}
                      maxLength={500}
                      className="w-full px-4 py-3 bg-white border border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition resize-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="req-name" className="text-sm font-semibold mb-1.5 block">
                      Your name <span className="font-normal text-[color:var(--fg-subtle)]">(optional)</span>
                    </label>
                    <input
                      id="req-name"
                      type="text"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder="Anonymous"
                      maxLength={60}
                      className="w-full h-12 px-4 bg-white border border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 h-11 border border-[color:var(--border)] rounded-xl text-sm font-semibold hover:bg-black/5 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !title.trim()}
                      className="flex-[2] h-11 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            {/* Status pills */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide max-w-full">
              {(["all", "open", "planned", "in_progress", "completed"] as const).map((s) => {
                const isActive = statusFilter === s;
                const count = statusCounts[s] || 0;
                const label = s === "all" ? "All" : STATUS_CONFIG[s].label;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 transition ${
                      isActive
                        ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
                        : "bg-black/5 text-[color:var(--fg-muted)] hover:bg-black/10"
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1 sm:ml-auto shrink-0">
              <span className="text-xs text-[color:var(--fg-subtle)] mr-1">Sort:</span>
              {(["votes", "newest"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSort(s)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition ${
                    sort === s ? "bg-black/10 text-[color:var(--fg)]" : "text-[color:var(--fg-muted)] hover:bg-black/5"
                  }`}
                >
                  {s === "votes" ? "Top Voted" : "Newest"}
                </button>
              ))}
            </div>
          </div>

          {/* Request list */}
          {isLoading ? (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-20 bg-white border border-dashed border-[color:var(--border)] rounded-2xl">
              <h3 className="text-lg font-bold mb-2">No requests yet</h3>
              <p className="text-sm text-[color:var(--fg-muted)]">Be the first to suggest a topic!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <RequestCard key={req.id} request={req} onVote={handleVote} siteId={siteId} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function RequestCard({
  request: req,
  onVote,
  siteId,
}: {
  request: ContentRequest;
  onVote: (id: string) => void;
  siteId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[req.status];

  return (
    <motion.div
      layout
      className={`bg-white border rounded-xl overflow-hidden transition-shadow ${
        req.isPinned ? "border-[color:var(--fg)] shadow-md" : "border-[color:var(--border)]"
      }`}
    >
      <div className="flex gap-3 p-4">
        {/* Vote button */}
        <button
          type="button"
          onClick={() => onVote(req.id)}
          className={`flex flex-col items-center justify-center w-14 shrink-0 rounded-xl border-2 transition py-2 ${
            req.hasVoted
              ? "border-[color:var(--fg)] bg-[color:var(--fg)] text-[color:var(--bg)]"
              : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={req.hasVoted ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          <span className="text-sm font-bold tabular-nums mt-0.5">{req.voteCount}</span>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {req.isPinned && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-black/5 text-[color:var(--fg-muted)] px-1.5 py-0.5 rounded shrink-0">
                Pinned
              </span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-bold mt-1.5 leading-snug">{req.title}</h3>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-2 text-xs text-[color:var(--fg-subtle)]">
            {req.authorName && <span>by {req.authorName}</span>}
            <span>{formatDate(req.createdAt)}</span>
            {(req.description || req.creatorNote) && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] font-semibold ml-auto transition"
              >
                {expanded ? "Less" : "More"}
              </button>
            )}
          </div>

          {/* Expanded content */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {req.description && (
                  <p className="text-sm text-[color:var(--fg-muted)] mt-3 leading-relaxed">
                    {req.description}
                  </p>
                )}
                {req.creatorNote && (
                  <div className="mt-3 bg-black/[0.03] border border-[color:var(--border)] rounded-lg px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">
                      Creator Response
                    </p>
                    <p className="text-sm text-[color:var(--fg-muted)] leading-relaxed">
                      {req.creatorNote}
                    </p>
                  </div>
                )}
                {req.completedPostShortcode && (
                  <a
                    href={`/${siteId}/p/${req.completedPostShortcode}`}
                    className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-[color:var(--fg)] bg-green-100 hover:bg-green-200 px-3 py-1.5 rounded-full transition"
                  >
                    View the post
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M7 17L17 7M17 7H9M17 7v8" />
                    </svg>
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
