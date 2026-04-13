"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FeatureGate from "@/components/plans/FeatureGate";
import UpgradeBanner from "@/components/plans/UpgradeBanner";
import StatCard from "@/components/analytics/StatCard";
import TopPostsTable from "@/components/analytics/TopPostsTable";
import SearchTermsTable from "@/components/analytics/SearchTermsTable";
import Heatmap from "@/components/analytics/Heatmap";
import ReferrerChart from "@/components/analytics/ReferrerChart";
import CountryTable from "@/components/analytics/CountryTable";
import {
  getMockDailyStats,
  getMockTopPosts,
  getMockSearchTerms,
  getMockReferrers,
  getMockDeviceStats,
  getMockCountryStats,
  getMockCategoryStats,
  getMockHeatmap,
  getMockSummary,
} from "@/lib/analytics/mock-data";

// Dynamic imports for recharts components (heavy, SSR-unfriendly)
const ViewsChart = dynamic(() => import("@/components/analytics/ViewsChart"), { ssr: false });
const DeviceChart = dynamic(() => import("@/components/analytics/DeviceChart"), { ssr: false });
const CategoryChart = dynamic(() => import("@/components/analytics/CategoryChart"), { ssr: false });

type Period = "7d" | "30d";
type ChartMetric = "views" | "clicks" | "searches" | "shares" | "uniqueVisitors";

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("views");

  const days = period === "7d" ? 7 : 30;
  const dailyStats = getMockDailyStats(days);
  const summary = getMockSummary(period);
  const topPosts = getMockTopPosts();
  const searchTerms = getMockSearchTerms();
  const referrers = getMockReferrers();
  const devices = getMockDeviceStats();
  const countries = getMockCountryStats();
  const categories = getMockCategoryStats();
  const heatmap = getMockHeatmap();

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-20">
          {/* Header + period selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Analytics</h1>
            <div className="flex items-center bg-black/5 rounded-lg p-0.5 self-start">
              {(["7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    period === p ? "bg-white shadow-sm text-[color:var(--fg)]" : "text-[color:var(--fg-muted)]"
                  }`}
                >
                  {p === "7d" ? "7 Days" : "30 Days"}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-6 sm:mb-8">
            <p className="text-xs sm:text-sm text-[color:var(--fg-muted)] mt-1">
              Your Directory &mdash; Last {days} days
            </p>
          </div>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6 sm:mb-8">
            <StatCard label="Total Views" value={summary.totalViews.toLocaleString()} change={summary.viewsChange} />
            <StatCard label="Unique Visitors" value={summary.uniqueVisitors.toLocaleString()} />
            <StatCard label="Post Clicks" value={summary.totalClicks.toLocaleString()} change={summary.clicksChange} />
            <StatCard label="Click Rate" value={summary.ctr} suffix="%" />
            <StatCard label="Searches" value={summary.totalSearches.toLocaleString()} change={summary.searchesChange} />
            <StatCard label="Shares" value={summary.totalShares.toLocaleString()} change={summary.sharesChange} />
          </div>

          {/* Full analytics gate */}
          <FeatureGate feature="analytics_full">

          {/* Engagement stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
            <StatCard label="Avg. Session" value={`${Math.floor(summary.avgDuration / 60)}:${String(summary.avgDuration % 60).padStart(2, "0")}`} suffix=" min" />
            <StatCard label="Avg. Scroll Depth" value={summary.avgScrollDepth} suffix="%" />
            <StatCard label="Search → Click" value="71" suffix="%" />
            <StatCard label="Video Watch Rate" value="64" suffix="%" />
          </div>

          {/* Main chart with metric selector */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
              {(["views", "clicks", "searches", "shares", "uniqueVisitors"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChartMetric(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                    chartMetric === m
                      ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
                      : "bg-black/5 text-[color:var(--fg-muted)] hover:bg-black/10"
                  }`}
                >
                  {m === "uniqueVisitors" ? "Visitors" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <ViewsChart data={dailyStats} metric={chartMetric} />
          </div>

          {/* Two column layout */}
          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {/* Left: Top Posts (spans 2 cols) */}
            <div className="lg:col-span-2">
              <TopPostsTable posts={topPosts} />
            </div>

            {/* Right: Sidebar widgets */}
            <div className="space-y-6">
              <DeviceChart data={devices} />
              <CategoryChart data={categories} />
            </div>
          </div>

          {/* Heatmap */}
          <div className="mb-8">
            <Heatmap data={heatmap} />
          </div>

          {/* Bottom row */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
            <SearchTermsTable terms={searchTerms} />
            <ReferrerChart data={referrers} />
            <div className="sm:col-span-2 lg:col-span-1">
              <CountryTable data={countries} />
            </div>
          </div>

          </FeatureGate>

          {/* Insights panel */}
          <FeatureGate feature="analytics_ai_insights">
          <div className="bg-white border border-[color:var(--border)] rounded-xl p-6">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              AI Insights
            </h3>
            <ul className="space-y-2.5 text-sm text-[color:var(--fg-muted)]">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17l9.2-9.2M17 17V7H7" />
                  </svg>
                </span>
                <span><strong>&quot;nigeria oil&quot;</strong> is your most searched term with 48 searches this month. Consider creating more content on this topic.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17l9.2-9.2M17 17V7H7" />
                  </svg>
                </span>
                <span>Your <strong>evening traffic (6PM-11PM)</strong> is 3x higher than daytime. Optimal posting time: 7PM GMT.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                </span>
                <span><strong>58% of visitors are on mobile</strong> but mobile CTR is 12% lower than desktop. Consider optimizing thumbnail sizes for mobile.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17l9.2-9.2M17 17V7H7" />
                  </svg>
                </span>
                <span><strong>Google organic traffic grew 34%</strong> this month. Your SEO strategy is working — transcript pages are ranking for long-tail queries.</span>
              </li>
            </ul>
          </div>
          </FeatureGate>
        </main>
      </div>
    </div>
  );
}
