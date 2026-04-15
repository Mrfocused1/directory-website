"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";
import EmptyState from "@/components/dashboard/EmptyState";
import GettingStarted from "@/components/dashboard/GettingStarted";

type SiteData = {
  id: string;
  slug: string;
  displayName: string | null;
  handle: string;
  platform: "instagram" | "tiktok";
  postCount: number;
  isPublished: boolean;
  lastSyncAt: string | null;
};

export default function DashboardPage() {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadSites() {
      try {
        const res = await fetch("/api/sites");
        if (res.ok) {
          const data = await res.json();
          setSites(data.sites || []);
        }
      } catch (err) {
        console.warn("[dashboard] Failed to load sites:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSites();
  }, []);

  const handleDelete = async (site: SiteData) => {
    const ok = confirm(
      `Delete "${site.displayName || site.slug}"? This will permanently remove the directory and all its posts. This can't be undone.`,
    );
    if (!ok) return;
    setDeletingId(site.id);
    try {
      const res = await fetch(`/api/sites?id=${encodeURIComponent(site.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSites((prev) => prev.filter((s) => s.id !== site.id));
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to delete" }));
        alert(err.error || "Failed to delete site");
      }
    } catch {
      alert("Failed to delete site. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main id="main" className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-20">
          {!loading && sites.length > 0 && <GettingStarted sites={sites} />}

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Your Directories</h1>
              <p className="text-sm text-[color:var(--fg-muted)] mt-1">
                Manage your content directories
              </p>
            </div>
            <Link
              href="/onboarding"
              className="h-10 px-5 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Directory
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-[color:var(--fg-muted)]">Loading your directories...</p>
            </div>
          ) : sites.length === 0 ? (
            <EmptyState
              icon={
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              }
              title="Welcome to BuildMy.Directory"
              description="You don't have any directories yet. Connect your first social platform and we'll build a searchable, shareable directory from your content — usually in under 5 minutes."
              action={{ href: "/onboarding", label: "Build My First Directory" }}
            >
              <ul className="mt-6 text-xs text-[color:var(--fg-subtle)] space-y-1.5 max-w-xs mx-auto text-left">
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--fg)]">1.</span>
                  Pick a platform and enter your handle
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--fg)]">2.</span>
                  We scrape, transcribe, and categorize your posts
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--fg)]">3.</span>
                  Share your directory with your audience
                </li>
              </ul>
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-black/5 transition-shadow"
                >
                  {/* On mobile: stack info above actions so buttons don't crush the handle.
                      On >=sm: info and actions sit side-by-side as before. */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                        <h2 className="text-lg font-bold truncate max-w-full">{site.displayName || site.slug}</h2>
                        {site.isPublished ? (
                          <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                            Live
                          </span>
                        ) : (
                          <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full shrink-0">
                            Draft
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[color:var(--fg-muted)] truncate">
                        @{site.handle} on {site.platform}
                      </p>
                      <div className="flex items-center gap-4 mt-2 sm:mt-3 text-xs text-[color:var(--fg-subtle)]">
                        <span>{site.postCount} posts</span>
                        {site.lastSyncAt && (
                          <span className="truncate">
                            Last synced {new Date(site.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions — wrap on mobile, row on desktop. Delete is pushed to the
                        end with ml-auto so it sits flush-right on mobile too. */}
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      {!site.isPublished && (
                        // Navigate to the live progress page. The page polls
                        // /api/pipeline?siteId and will auto-retry on load if
                        // the site is in a failed state — no more opaque alert().
                        <Link
                          href={`/dashboard/build/${site.id}`}
                          className="h-9 px-4 bg-yellow-100 text-yellow-800 rounded-lg text-xs font-semibold flex items-center hover:bg-yellow-200 transition"
                          title="View build progress / retry"
                        >
                          See progress
                        </Link>
                      )}
                      <Link
                        href={`/${site.slug}`}
                        className="h-9 px-4 bg-black/5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-black/10 transition"
                      >
                        Visit
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M7 17L17 7M17 7H9M17 7v8" />
                        </svg>
                      </Link>
                      <Link
                        href="/dashboard/platforms"
                        className="h-9 px-4 bg-black/5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-black/10 transition"
                      >
                        Sync Now
                      </Link>
                      <Link
                        href="/dashboard/domains"
                        className="h-9 px-4 bg-black/5 rounded-lg text-xs font-semibold flex items-center hover:bg-black/10 transition"
                      >
                        Settings
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(site)}
                        disabled={deletingId === site.id}
                        className="h-9 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1 transition disabled:opacity-50 ml-auto sm:ml-0"
                        aria-label={`Delete ${site.displayName || site.slug}`}
                        title="Delete this directory"
                      >
                        {deletingId === site.id ? "Deleting..." : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick stats */}
          {!loading && sites.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
              {[
                { label: "Total Posts", value: sites.reduce((sum, s) => sum + s.postCount, 0).toString() },
                { label: "Published", value: sites.filter((s) => s.isPublished).length.toString() },
                { label: "Active Sites", value: sites.length.toString() },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white border border-[color:var(--border)] rounded-xl p-5 text-center"
                >
                  <p className="text-2xl font-extrabold">{stat.value}</p>
                  <p className="text-xs text-[color:var(--fg-subtle)] mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
