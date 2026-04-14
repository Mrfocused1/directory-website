"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FeatureGate from "@/components/plans/FeatureGate";
import {
  getMockSubscribers,
  getMockDigests,
  getMockGrowth,
  getMockCategoryBreakdown,
} from "@/lib/newsletter/mock-data";
import { formatDate } from "@/lib/utils";

const GrowthChart = dynamic(() => import("@/components/subscribe/GrowthChart"), { ssr: false });

export default function NewsletterDashboard() {
  const [realData, setRealData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // TODO: get siteId from auth context
        const res = await fetch("/api/newsletter?siteId=demo");
        const data = await res.json();
        if (data.hasData) {
          setRealData(data);
        }
      } catch {
        // Fall back to mock data
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const mockSubs = getMockSubscribers();
  const subscribers = realData?.subscribers
    ? (realData.subscribers as typeof mockSubs)
    : mockSubs;
  const digests = realData?.digests
    ? (realData.digests as ReturnType<typeof getMockDigests>)
    : getMockDigests();
  const growth = realData?.growth
    ? (realData.growth as ReturnType<typeof getMockGrowth>)
    : getMockGrowth();
  const categoryBreakdown = realData?.categoryBreakdown
    ? (realData.categoryBreakdown as ReturnType<typeof getMockCategoryBreakdown>)
    : getMockCategoryBreakdown(subscribers);

  const active = subscribers.filter((s) => s.isActive && s.isVerified);
  const weeklyCount = active.filter((s) => s.frequency === "weekly").length;
  const dailyCount = active.filter((s) => s.frequency === "daily").length;
  const monthlyCount = active.filter((s) => s.frequency === "monthly").length;

  const [showAllSubs, setShowAllSubs] = useState(false);
  const displayedSubs = showAllSubs ? subscribers : subscribers.slice(0, 8);

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-20">
          <FeatureGate feature="newsletter">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Newsletter</h1>
              <p className="text-xs sm:text-sm text-[color:var(--fg-muted)] mt-1">
                Manage subscribers and digest emails
              </p>
            </div>
            <button
              type="button"
              onClick={() => alert("Digest sending will be available once the newsletter pipeline is connected.")}
              className="h-9 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition self-start"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              Send Digest Now
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-3.5 sm:p-5">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">Active Subscribers</p>
              <p className="text-xl sm:text-2xl font-extrabold">{active.length}</p>
            </div>
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-3.5 sm:p-5">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">New This Week</p>
              <p className="text-xl sm:text-2xl font-extrabold">3</p>
            </div>
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-3.5 sm:p-5">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">Avg Open Rate</p>
              <p className="text-xl sm:text-2xl font-extrabold">78<span className="text-sm text-[color:var(--fg-muted)]">%</span></p>
            </div>
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-3.5 sm:p-5">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">Avg Click Rate</p>
              <p className="text-xl sm:text-2xl font-extrabold">45<span className="text-sm text-[color:var(--fg-muted)]">%</span></p>
            </div>
          </div>

          {/* Growth chart */}
          <div className="mb-6">
            <GrowthChart data={growth} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
            {/* Digest history */}
            <div className="lg:col-span-2 bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h3 className="text-sm font-bold">Recent Digests</h3>
                <p className="text-xs text-[color:var(--fg-subtle)] mt-0.5">Past email newsletters sent</p>
              </div>
              <div className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
                {digests.map((d) => {
                  const openRate = d.recipientCount > 0 ? Math.round((d.openCount / d.recipientCount) * 100) : 0;
                  const clickRate = d.openCount > 0 ? Math.round((d.clickCount / d.openCount) * 100) : 0;
                  return (
                    <div key={d.id} className="px-5 py-3.5">
                      <p className="text-sm font-semibold leading-snug">{d.subject}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-[color:var(--fg-subtle)]">{formatDate(d.sentAt)}</span>
                        <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">{d.postCount} posts</span>
                        <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">{d.recipientCount} recipients</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${openRate >= 70 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {openRate}% opened
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${clickRate >= 40 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {clickRate}% clicked
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4 sm:space-y-6">
              {/* Category breakdown */}
              <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-bold mb-1">Topics of Interest</h3>
                <p className="text-xs text-[color:var(--fg-subtle)] mb-3">What subscribers care about</p>
                <div className="space-y-2.5">
                  {categoryBreakdown.map((c) => (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold">{c.category}</span>
                        <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">{c.count} subs</span>
                      </div>
                      <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[color:var(--fg)] rounded-full" style={{ width: `${(c.count / active.length) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Frequency breakdown */}
              <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
                <h3 className="text-sm font-bold mb-3">Frequency Preferences</h3>
                <div className="space-y-2">
                  {[
                    { label: "Weekly", count: weeklyCount },
                    { label: "Daily", count: dailyCount },
                    { label: "Monthly", count: monthlyCount },
                  ].map((f) => (
                    <div key={f.label} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className="text-sm font-bold tabular-nums">{f.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Subscriber list */}
          <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Subscribers</h3>
                <p className="text-xs text-[color:var(--fg-subtle)] mt-0.5">{subscribers.length} total</p>
              </div>
            </div>
            <div className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
              {displayedSubs.map((sub) => (
                <div key={sub.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-xs font-bold shrink-0">
                    {(sub.name || sub.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{sub.name || sub.email}</span>
                      {!sub.isActive && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded shrink-0">Inactive</span>
                      )}
                      {!sub.isVerified && (
                        <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded shrink-0">Unverified</span>
                      )}
                    </div>
                    <p className="text-xs text-[color:var(--fg-subtle)] truncate">{sub.email}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    {sub.categories.length > 0 ? (
                      sub.categories.map((c) => (
                        <span key={c} className="text-[10px] font-semibold bg-black/5 px-1.5 py-0.5 rounded">{c}</span>
                      ))
                    ) : (
                      <span className="text-[10px] font-semibold bg-black/5 px-1.5 py-0.5 rounded">All topics</span>
                    )}
                  </div>
                  <span className="text-xs text-[color:var(--fg-subtle)] capitalize shrink-0 hidden sm:block">{sub.frequency}</span>
                </div>
              ))}
            </div>
            {subscribers.length > 8 && (
              <div className="px-5 py-3 border-t border-[color:var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowAllSubs(!showAllSubs)}
                  className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
                >
                  {showAllSubs ? "Show less" : `Show all ${subscribers.length} subscribers`}
                </button>
              </div>
            )}
          </div>
          </FeatureGate>
        </main>
      </div>
    </div>
  );
}
