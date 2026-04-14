"use client";

import { useEffect, useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { usePlan } from "@/components/plans/PlanProvider";
import type { PlatformConnection, Platform } from "@/lib/types";

const MOCK_CONNECTIONS: PlatformConnection[] = [
  {
    id: "pc-1", platform: "instagram", handle: "demo_creator", displayName: "Demo Creator",
    avatarUrl: null, followerCount: 48200, postCount: 14, isConnected: true,
    lastSyncAt: "2026-04-12T10:00:00Z", syncStatus: "completed",
  },
  {
    id: "pc-2", platform: "tiktok", handle: "demo_creator", displayName: "Demo Creator",
    avatarUrl: null, followerCount: 125000, postCount: 8, isConnected: true,
    lastSyncAt: "2026-04-12T10:05:00Z", syncStatus: "completed",
  },
  {
    id: "pc-3", platform: "youtube", handle: "demo_creator", displayName: "Demo Creator",
    avatarUrl: null, followerCount: 12400, postCount: 6, isConnected: true,
    lastSyncAt: "2026-04-11T18:00:00Z", syncStatus: "completed",
  },
];

const PLATFORM_META: Record<Platform, { name: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  instagram: {
    name: "Instagram",
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  tiktok: {
    name: "TikTok",
    color: "text-black",
    bgColor: "bg-gray-50",
    icon: (
      <svg width="18" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.72a8.2 8.2 0 004.77 1.52V6.79a4.85 4.85 0 01-1-.1z" />
      </svg>
    ),
  },
  youtube: {
    name: "YouTube",
    color: "text-red-600",
    bgColor: "bg-red-50",
    icon: (
      <svg width="22" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
};

const AVAILABLE_PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube"];

export default function PlatformsPage() {
  const [connections, setConnections] = useState<PlatformConnection[]>(MOCK_CONNECTIONS);
  const [showConnect, setShowConnect] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>("instagram");
  const [newHandle, setNewHandle] = useState("");
  const { canAddPlatform, platformLimit, planForPlatform } = usePlan();

  // Fetch real platform connections
  useEffect(() => {
    async function fetchConnections() {
      try {
        // TODO: get siteId from auth context
        const res = await fetch("/api/platforms?siteId=demo");
        const data = await res.json();
        if (data.connections && data.connections.length > 0) {
          setConnections(data.connections);
        }
      } catch {
        // Keep mock data as fallback
      }
    }
    fetchConnections();
  }, []);

  const totalPosts = connections.reduce((s, c) => s + c.postCount, 0);
  const totalFollowers = connections.reduce((s, c) => s + (c.followerCount || 0), 0);
  const connectedPlatforms = connections.filter((c) => c.isConnected);

  // Count current accounts per platform
  const platformCounts: Record<Platform, number> = {
    instagram: connectedPlatforms.filter((c) => c.platform === "instagram").length,
    tiktok: connectedPlatforms.filter((c) => c.platform === "tiktok").length,
    youtube: connectedPlatforms.filter((c) => c.platform === "youtube").length,
  };

  const canAddSelected = canAddPlatform(newPlatform, platformCounts[newPlatform]);
  const selectedLimit = platformLimit(newPlatform);
  const upgradePlan = planForPlatform(newPlatform, platformCounts[newPlatform] + 1);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHandle.trim()) return;

    try {
      const res = await fetch("/api/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: "demo", platform: newPlatform, handle: newHandle }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnections((prev) => [...prev, data.connection]);
        setShowConnect(false);
        setNewHandle("");
      }
    } catch {
      // Network error
    }
  };

  const handleSync = async (connectionId: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === connectionId ? { ...c, syncStatus: "syncing" as const } : c)),
    );
    try {
      const res = await fetch("/api/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, action: "sync" }),
      });
      if (res.ok) {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connectionId
              ? { ...c, syncStatus: "completed" as const, lastSyncAt: new Date().toISOString() }
              : c,
          ),
        );
      } else {
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, syncStatus: "completed" as const } : c)),
        );
      }
    } catch {
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, syncStatus: "completed" as const } : c)),
      );
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === connectionId ? { ...c, isConnected: false } : c)),
    );
    try {
      await fetch("/api/platforms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, action: "disconnect" }),
      });
    } catch {
      // Revert on failure
      setConnections((prev) =>
        prev.map((c) => (c.id === connectionId ? { ...c, isConnected: true } : c)),
      );
    }
  };

  const formatFollowers = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Platforms</h1>
              <p className="text-xs sm:text-sm text-[color:var(--fg-muted)] mt-1">
                {connectedPlatforms.length} connected &middot; {totalPosts} posts &middot; {formatFollowers(totalFollowers)} followers
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConnect(!showConnect)}
              className="h-9 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition self-start"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Connect Platform
            </button>
          </div>

          {/* Connect form */}
          {showConnect && (
            <form onSubmit={handleConnect} className="bg-white border-2 border-[color:var(--fg)] rounded-xl p-5 mb-6 space-y-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Platform</label>
                <div className="flex gap-2">
                  {AVAILABLE_PLATFORMS.map((p) => {
                    const meta = PLATFORM_META[p];
                    const isSelected = newPlatform === p;
                    const count = platformCounts[p];
                    const limit = platformLimit(p);
                    const atLimit = count >= limit;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewPlatform(p)}
                        className={`flex-1 rounded-xl text-sm font-semibold border-2 flex flex-col items-center justify-center gap-0.5 py-2 transition ${
                          isSelected
                            ? "border-[color:var(--fg)] bg-black/5"
                            : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={meta.color}>{meta.icon}</span>
                          <span className="hidden sm:inline">{meta.name}</span>
                        </div>
                        <span className={`text-[9px] font-bold ${atLimit ? "text-red-500" : "text-[color:var(--fg-subtle)]"}`}>
                          {count}/{limit} {limit === 1 ? "account" : "accounts"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Limit warning / upgrade prompt */}
              {!canAddSelected && (
                <div className="bg-gradient-to-r from-purple-50 via-violet-50 to-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold">
                      {selectedLimit === 0
                        ? `${newPlatform.charAt(0).toUpperCase() + newPlatform.slice(1)} not available on your plan`
                        : `You've reached the ${newPlatform.charAt(0).toUpperCase() + newPlatform.slice(1)} limit`}
                    </h4>
                    <p className="text-xs text-[color:var(--fg-muted)] mt-0.5">
                      {selectedLimit === 0
                        ? `Upgrade to connect ${newPlatform.charAt(0).toUpperCase() + newPlatform.slice(1)} accounts.`
                        : `Your plan allows ${selectedLimit} ${newPlatform} account${selectedLimit === 1 ? "" : "s"} per directory. Upgrade to add more.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const planId = upgradePlan.name.toLowerCase();
                      const res = await fetch("/api/checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ plan: planId }),
                      });
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                    }}
                    className="h-9 px-4 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg text-xs font-semibold hover:opacity-90 transition shadow-sm shadow-purple-200 whitespace-nowrap shrink-0"
                  >
                    Upgrade to {upgradePlan.name} &mdash; ${upgradePlan.price}/mo
                  </button>
                </div>
              )}

              {canAddSelected && (
                <>
                  <div>
                    <label htmlFor="platform-handle" className="text-sm font-semibold mb-2 block">Handle</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--fg-subtle)] text-sm">@</span>
                      <input
                        id="platform-handle"
                        type="text"
                        value={newHandle}
                        onChange={(e) => setNewHandle(e.target.value)}
                        placeholder="yourhandle"
                        required
                        className="w-full h-12 pl-9 pr-4 bg-white border border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowConnect(false)} className="flex-1 h-11 border border-[color:var(--border)] rounded-xl text-sm font-semibold hover:bg-black/5 transition">
                      Cancel
                    </button>
                    <button type="submit" className="flex-[2] h-11 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition">
                      Connect & Sync
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-6">
            {connectedPlatforms.map((c) => {
              const meta = PLATFORM_META[c.platform];
              return (
                <div key={c.id} className={`${meta.bgColor} border border-[color:var(--border)] rounded-xl p-4`}>
                  <div className={`${meta.color} mb-2`}>{meta.icon}</div>
                  <p className="text-xl font-extrabold tabular-nums">{c.postCount}</p>
                  <p className="text-[10px] sm:text-xs text-[color:var(--fg-subtle)] font-semibold">
                    {meta.name} posts
                  </p>
                  {c.followerCount && (
                    <p className="text-[10px] text-[color:var(--fg-subtle)] mt-1 tabular-nums">
                      {formatFollowers(c.followerCount)} followers
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Connection list */}
          <div className="space-y-3">
            {connections.map((c) => {
              const meta = PLATFORM_META[c.platform];
              return (
                <div
                  key={c.id}
                  className={`bg-white border rounded-xl p-5 ${
                    c.isConnected ? "border-[color:var(--border)]" : "border-dashed border-[color:var(--border)] opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${meta.bgColor} ${meta.color} flex items-center justify-center shrink-0`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold">{meta.name}</h3>
                        {c.isConnected ? (
                          <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Connected</span>
                        ) : (
                          <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Disconnected</span>
                        )}
                        {c.syncStatus === "syncing" && (
                          <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full animate-pulse">Syncing...</span>
                        )}
                      </div>
                      <p className="text-sm text-[color:var(--fg-muted)]">@{c.handle}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-[color:var(--fg-subtle)]">
                        <span className="tabular-nums">{c.postCount} posts</span>
                        {c.followerCount && <span className="tabular-nums">{formatFollowers(c.followerCount)} followers</span>}
                        {c.lastSyncAt && (
                          <span>Last synced {new Date(c.lastSyncAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    {c.isConnected && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSync(c.id)}
                          disabled={c.syncStatus === "syncing"}
                          className="h-8 px-3 bg-black/5 rounded-lg text-xs font-semibold hover:bg-black/10 disabled:opacity-50 transition"
                        >
                          {c.syncStatus === "syncing" ? "Syncing..." : "Sync"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(c.id)}
                          className="h-8 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
