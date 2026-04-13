/**
 * Mock analytics data for the dashboard demo.
 * In production, this is replaced by DB queries.
 */

import { subDays, format } from "date-fns";

// Seeded PRNG so server and client produce identical values (fixes hydration errors)
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

let rand = seededRandom(42);

export type DailyStat = {
  date: string;
  views: number;
  uniqueVisitors: number;
  clicks: number;
  searches: number;
  shares: number;
  avgDuration: number;
  avgScrollDepth: number;
};

export type TopPost = {
  shortcode: string;
  title: string;
  clicks: number;
  views: number;
  ctr: number; // click-through rate
  avgWatchTime: number;
  shares: number;
};

export type SearchTerm = {
  query: string;
  count: number;
  clickRate: number;
  avgResults: number;
};

export type ReferrerSource = {
  source: string;
  visitors: number;
  percentage: number;
};

export type DeviceStat = {
  device: string;
  count: number;
  percentage: number;
};

export type CountryStat = {
  country: string;
  code: string;
  visitors: number;
  percentage: number;
};

export type CategoryStat = {
  category: string;
  clicks: number;
  percentage: number;
};

export type HeatmapCell = {
  hour: number;
  day: number; // 0=Mon ... 6=Sun
  value: number;
};

// ─── Generate mock data ──────────────────────────────────────────────

// Fixed date to avoid server/client mismatch
const today = new Date("2026-04-13T12:00:00Z");

export function getMockDailyStats(days = 30): DailyStat[] {
  rand = seededRandom(100 + days);
  return Array.from({ length: days }, (_, i) => {
    const date = subDays(today, days - 1 - i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const baseViews = isWeekend ? 80 : 140;
    const noise = () => rand() * 0.4 + 0.8;
    const views = Math.round(baseViews * noise() + i * 2);
    const uniqueVisitors = Math.round(views * 0.72);
    const clicks = Math.round(views * (0.35 + rand() * 0.15));

    return {
      date: format(date, "yyyy-MM-dd"),
      views,
      uniqueVisitors,
      clicks,
      searches: Math.round(views * 0.18 * noise()),
      shares: Math.round(clicks * 0.08 * noise()),
      avgDuration: Math.round(45 + rand() * 90),
      avgScrollDepth: Math.round(35 + rand() * 45),
    };
  });
}

export function getMockTopPosts(): TopPost[] {
  rand = seededRandom(200);
  const posts = [
    "Why Africa's Debt Crisis Is Deeper Than You Think",
    "The Real Story Behind Nigeria's Oil Revenue",
    "How Ghana's Cocoa Industry Shapes Global Markets",
    "South Africa's Energy Crisis Explained",
    "The Untold History of African Kingdoms",
    "China's Growing Influence in East Africa",
    "Kenya's Tech Revolution: Silicon Savannah",
    "The Economics of the CFA Franc",
    "Congo's Cobalt: The Human Cost of Electric Cars",
    "Ethiopia's Renaissance Dam Controversy",
  ];

  return posts.map((title, i) => {
    const views = Math.round(300 - i * 25 + rand() * 40);
    const clicks = Math.round(views * (0.4 - i * 0.02 + rand() * 0.1));
    return {
      shortcode: `post-${i + 1}`,
      title,
      clicks,
      views,
      ctr: Math.round((clicks / views) * 100),
      avgWatchTime: Math.round(30 + rand() * 120),
      shares: Math.round(clicks * 0.1 * (1 + rand())),
    };
  });
}

export function getMockSearchTerms(): SearchTerm[] {
  return [
    { query: "nigeria oil", count: 48, clickRate: 72, avgResults: 5 },
    { query: "africa debt", count: 42, clickRate: 68, avgResults: 8 },
    { query: "ghana cocoa", count: 35, clickRate: 80, avgResults: 3 },
    { query: "colonialism", count: 31, clickRate: 65, avgResults: 12 },
    { query: "CFA franc", count: 28, clickRate: 75, avgResults: 4 },
    { query: "south africa energy", count: 24, clickRate: 62, avgResults: 6 },
    { query: "china africa", count: 22, clickRate: 70, avgResults: 7 },
    { query: "cobalt mining", count: 19, clickRate: 85, avgResults: 2 },
    { query: "kenya tech", count: 17, clickRate: 78, avgResults: 4 },
    { query: "slavery reparations", count: 15, clickRate: 60, avgResults: 9 },
  ];
}

export function getMockReferrers(): ReferrerSource[] {
  const data = [
    { source: "Google", visitors: 520 },
    { source: "Instagram", visitors: 340 },
    { source: "Direct", visitors: 280 },
    { source: "Twitter/X", visitors: 145 },
    { source: "TikTok", visitors: 95 },
    { source: "WhatsApp", visitors: 72 },
    { source: "YouTube", visitors: 48 },
    { source: "LinkedIn", visitors: 30 },
  ];
  const total = data.reduce((s, d) => s + d.visitors, 0);
  return data.map((d) => ({
    ...d,
    percentage: Math.round((d.visitors / total) * 100),
  }));
}

export function getMockDeviceStats(): DeviceStat[] {
  return [
    { device: "Mobile", count: 890, percentage: 58 },
    { device: "Desktop", count: 520, percentage: 34 },
    { device: "Tablet", count: 120, percentage: 8 },
  ];
}

export function getMockCountryStats(): CountryStat[] {
  return [
    { country: "United States", code: "US", visitors: 380, percentage: 25 },
    { country: "United Kingdom", code: "GB", visitors: 310, percentage: 20 },
    { country: "Nigeria", code: "NG", visitors: 240, percentage: 16 },
    { country: "Ghana", code: "GH", visitors: 140, percentage: 9 },
    { country: "Canada", code: "CA", visitors: 120, percentage: 8 },
    { country: "South Africa", code: "ZA", visitors: 95, percentage: 6 },
    { country: "Kenya", code: "KE", visitors: 72, percentage: 5 },
    { country: "Germany", code: "DE", visitors: 55, percentage: 4 },
    { country: "France", code: "FR", visitors: 48, percentage: 3 },
    { country: "Other", code: "--", visitors: 70, percentage: 4 },
  ];
}

export function getMockCategoryStats(): CategoryStat[] {
  const data = [
    { category: "Africa", clicks: 480 },
    { category: "Economics", clicks: 350 },
    { category: "Politics", clicks: 280 },
    { category: "Black History", clicks: 210 },
    { category: "Current Affairs", clicks: 180 },
  ];
  const total = data.reduce((s, d) => s + d.clicks, 0);
  return data.map((d) => ({
    ...d,
    percentage: Math.round((d.clicks / total) * 100),
  }));
}

export function getMockHeatmap(): HeatmapCell[] {
  rand = seededRandom(300);
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      // Higher activity during evenings (18-23) and lower on weekends
      const isEvening = hour >= 18 && hour <= 23;
      const isMorning = hour >= 8 && hour <= 11;
      const isWeekend = day >= 5;
      const base = isEvening ? 12 : isMorning ? 7 : hour >= 12 && hour <= 17 ? 5 : 1;
      const weekendMult = isWeekend ? 0.6 : 1;
      const value = Math.round(base * weekendMult * (0.7 + rand() * 0.6));
      cells.push({ hour, day, value });
    }
  }
  return cells;
}

// ─── Summary stats ───────────────────────────────────────────────────

export function getMockSummary(period: "7d" | "30d" = "30d") {
  const days = period === "7d" ? 7 : 30;
  const stats = getMockDailyStats(days);
  rand = seededRandom(400 + days);
  const prevStats = getMockDailyStats(days); // simulate previous period

  const sum = (arr: DailyStat[], key: keyof DailyStat) =>
    arr.reduce((s, d) => s + (d[key] as number), 0);
  const avg = (arr: DailyStat[], key: keyof DailyStat) =>
    arr.length > 0 ? sum(arr, key) / arr.length : 0;

  const totalViews = sum(stats, "views");
  const prevViews = sum(prevStats, "views");
  const totalClicks = sum(stats, "clicks");
  const prevClicks = sum(prevStats, "clicks");
  const totalSearches = sum(stats, "searches");
  const prevSearches = sum(prevStats, "searches");
  const totalShares = sum(stats, "shares");
  const prevShares = sum(prevStats, "shares");

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;

  return {
    totalViews,
    viewsChange: pctChange(totalViews, prevViews),
    uniqueVisitors: sum(stats, "uniqueVisitors"),
    totalClicks,
    clicksChange: pctChange(totalClicks, prevClicks),
    ctr: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0,
    totalSearches,
    searchesChange: pctChange(totalSearches, prevSearches),
    totalShares,
    sharesChange: pctChange(totalShares, prevShares),
    avgDuration: Math.round(avg(stats, "avgDuration")),
    avgScrollDepth: Math.round(avg(stats, "avgScrollDepth")),
  };
}
