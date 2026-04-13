"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FeatureGate from "@/components/plans/FeatureGate";
import { STATUS_CONFIG, type ContentRequest } from "@/lib/requests/mock-data";
import { formatDate } from "@/lib/utils";

const ALL_STATUSES = ["open", "planned", "in_progress", "completed", "declined"] as const;

export default function CreatorRequestsPage() {
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const siteId = "demo"; // In production, from auth context

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests?siteId=${siteId}&sort=votes`);
      const data = await res.json();
      setRequests(data.requests);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const updateRequest = async (requestId: string, updates: Record<string, unknown>) => {
    const res = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "update_status", ...updates }),
    });
    if (res.ok) {
      const data = await res.json();
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...data.request } : r)),
      );
    }
  };

  const handleStatusChange = (requestId: string, status: string) => {
    updateRequest(requestId, { status });
  };

  const handleTogglePin = (requestId: string, isPinned: boolean) => {
    updateRequest(requestId, { isPinned: !isPinned });
  };

  const handleSaveNote = (requestId: string) => {
    updateRequest(requestId, { creatorNote: editNote });
    setEditingId(null);
    setEditNote("");
  };

  const openCount = requests.filter((r) => r.status === "open").length;
  const plannedCount = requests.filter((r) => r.status === "planned" || r.status === "in_progress").length;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-20">
          <FeatureGate feature="requests">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Content Requests</h1>
              <p className="text-xs sm:text-sm text-[color:var(--fg-muted)] mt-1">
                {openCount} open &middot; {plannedCount} in pipeline &middot; {requests.length} total
              </p>
            </div>
            <a
              href={`/d/${siteId}/requests`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-4 bg-black/5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-black/10 transition self-start"
            >
              View public board
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M7 17L17 7M17 7H9M17 7v8" />
              </svg>
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
            {ALL_STATUSES.filter((s) => s !== "declined").map((s) => {
              const cfg = STATUS_CONFIG[s];
              const count = requests.filter((r) => r.status === s).length;
              return (
                <div key={s} className="bg-white border border-[color:var(--border)] rounded-xl p-3.5">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color} mb-1`}>
                    {cfg.label}
                  </p>
                  <p className="text-xl font-extrabold tabular-nums">{count}</p>
                </div>
              );
            })}
          </div>

          {/* Request list */}
          {isLoading ? (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const cfg = STATUS_CONFIG[req.status];
                const isEditing = editingId === req.id;

                return (
                  <div
                    key={req.id}
                    className={`bg-white border rounded-xl p-4 ${
                      req.isPinned ? "border-[color:var(--fg)]" : "border-[color:var(--border)]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Vote count */}
                      <div className="flex flex-col items-center w-10 shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[color:var(--fg-muted)]">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                        <span className="text-sm font-bold tabular-nums">{req.voteCount}</span>
                        <span className="text-[10px] text-[color:var(--fg-subtle)]">votes</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          {req.isPinned && (
                            <span className="text-[10px] font-bold text-[color:var(--fg-muted)]">Pinned</span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold leading-snug">{req.title}</h3>
                        {req.description && (
                          <p className="text-xs text-[color:var(--fg-muted)] mt-1 line-clamp-2">{req.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-[color:var(--fg-subtle)]">
                          {req.authorName && <span>by {req.authorName}</span>}
                          <span>{formatDate(req.createdAt)}</span>
                        </div>

                        {/* Creator note */}
                        {req.creatorNote && !isEditing && (
                          <div className="mt-2 bg-black/[0.03] border border-[color:var(--border)] rounded-lg px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-0.5">Your response</p>
                            <p className="text-xs text-[color:var(--fg-muted)]">{req.creatorNote}</p>
                          </div>
                        )}

                        {/* Edit note form */}
                        {isEditing && (
                          <div className="mt-2 space-y-2">
                            <textarea
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="Write a public response..."
                              rows={2}
                              className="w-full px-3 py-2 bg-white border border-[color:var(--border)] rounded-lg text-xs placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setEditingId(null); setEditNote(""); }}
                                className="h-8 px-3 text-xs font-semibold border border-[color:var(--border)] rounded-lg hover:bg-black/5 transition"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveNote(req.id)}
                                className="h-8 px-3 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 transition"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {/* Status dropdown */}
                          <select
                            value={req.status}
                            onChange={(e) => handleStatusChange(req.id, e.target.value)}
                            className="h-8 px-2 pr-6 text-xs font-semibold bg-black/5 border-0 rounded-lg appearance-none cursor-pointer focus:outline-none"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
                          >
                            {ALL_STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => handleTogglePin(req.id, req.isPinned)}
                            className="h-8 px-3 text-xs font-semibold bg-black/5 rounded-lg hover:bg-black/10 transition"
                          >
                            {req.isPinned ? "Unpin" : "Pin"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(req.id);
                              setEditNote(req.creatorNote || "");
                            }}
                            className="h-8 px-3 text-xs font-semibold bg-black/5 rounded-lg hover:bg-black/10 transition"
                          >
                            {req.creatorNote ? "Edit Response" : "Respond"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </FeatureGate>
        </main>
      </div>
    </div>
  );
}
