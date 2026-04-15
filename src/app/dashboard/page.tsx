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
  bio?: string | null;
  avatarUrl?: string | null;
  accentColor?: string;
};

export default function DashboardPage() {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<SiteData | null>(null);

  const handleSync = async (site: SiteData) => {
    if (syncingId) return;
    setSyncingId(site.id);
    try {
      const res = await fetch(`/api/pipeline/retry?siteId=${site.id}`, { method: "POST" });
      if (res.ok) {
        // Navigate to live progress so the user actually sees the rerun.
        window.location.href = `/dashboard/build/${site.id}`;
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Sync failed.");
        setSyncingId(null);
      }
    } catch {
      alert("Network error.");
      setSyncingId(null);
    }
  };

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
                      <button
                        type="button"
                        onClick={() => handleSync(site)}
                        disabled={syncingId === site.id}
                        className="h-9 px-4 bg-black/5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-black/10 disabled:opacity-50 transition"
                        title="Re-pull latest posts from the source platform"
                      >
                        {syncingId === site.id ? "Starting…" : "Sync now"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProfile(site)}
                        className="h-9 px-4 bg-black/5 rounded-lg text-xs font-semibold flex items-center hover:bg-black/10 transition"
                      >
                        Profile
                      </button>
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

      {editingProfile && (
        <SiteProfileModal
          site={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSaved={(updated) => {
            setSites((all) => all.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
            setEditingProfile(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Per-site profile editor ──────────────────────────────────────────
function SiteProfileModal({
  site,
  onClose,
  onSaved,
}: {
  site: SiteData;
  onClose: () => void;
  onSaved: (s: SiteData) => void;
}) {
  const [displayName, setDisplayName] = useState(site.displayName || site.slug);
  const [bio, setBio] = useState(site.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(site.avatarUrl || "");
  const [accentColor, setAccentColor] = useState(site.accentColor || "#000000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites?id=${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          accentColor: accentColor.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      onSaved({
        ...site,
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        accentColor: accentColor.trim().toLowerCase(),
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">Edit site profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="text-xs font-semibold mb-1.5 block">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={256}
              required
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1.5 block">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="One or two sentences shown under your name on the public directory."
              className="w-full px-3 py-2 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition resize-none"
            />
            <p className="text-[10px] text-[color:var(--fg-subtle)] mt-1 text-right">
              {bio.length}/500
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1.5 block">Avatar URL</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
            <p className="text-[10px] text-[color:var(--fg-subtle)] mt-1">
              Square image, ≥ 200×200. Leave blank to use platform avatar.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1.5 block">Accent color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-14 rounded-lg border-2 border-[color:var(--border)] cursor-pointer p-1"
                aria-label="Pick accent color"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                pattern="^#[0-9a-fA-F]{6}$"
                maxLength={7}
                className="flex-1 h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition font-mono"
              />
            </div>
          </div>
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 text-xs font-semibold border border-[color:var(--border)] rounded-lg hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !displayName.trim()}
              className="h-10 px-4 text-xs font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
