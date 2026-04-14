"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";

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

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-20">
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
            <div className="text-center py-20 bg-white border-2 border-dashed border-[color:var(--border)] rounded-2xl">
              <h3 className="text-xl font-bold mb-2">No directories yet</h3>
              <p className="text-[color:var(--fg-muted)] mb-6">
                Create your first directory to get started.
              </p>
              <Link
                href="/onboarding"
                className="inline-flex h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
              >
                Build My Directory
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-6 hover:shadow-lg hover:shadow-black/5 transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-lg font-bold truncate">{site.displayName || site.slug}</h2>
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
                      <p className="text-sm text-[color:var(--fg-muted)]">
                        @{site.handle} on {site.platform}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-[color:var(--fg-subtle)]">
                        <span>{site.postCount} posts</span>
                        {site.lastSyncAt && (
                          <span>
                            Last synced {new Date(site.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/d/${site.slug}`}
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
