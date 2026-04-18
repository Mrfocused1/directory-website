/**
 * Analytics Insights — weekly digest of per-site analytics with AI summary.
 */

import { db } from "@/db";
import { sites, pageViews, postClicks, searchEvents, categoryClicks } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type SiteInsight = {
  siteSlug: string;
  visitors: number;
  topPost: string | null;
  topSearch: string | null;
  topCategory: string | null;
  aiInsight: string;
};

async function generateInsights(
  sites: { siteSlug: string; visitors: number; topPost: string | null; topSearch: string | null; topCategory: string | null }[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!ANTHROPIC_API_KEY || sites.length === 0) return result;

  const prompt = `Generate a 2-3 sentence analytics insight for each directory site below. Be specific and actionable.
Return a JSON array: [{"siteSlug":"...","insight":"..."}]
Only return the JSON array.

${sites.map((s) => JSON.stringify(s)).join("\n")}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: Math.min(300 * sites.length, 4096),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return result;
    const data = await res.json();
    const text = (data.content?.[0]?.text || "").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return result;
    const parsed = JSON.parse(match[0]) as { siteSlug: string; insight: string }[];
    for (const item of parsed) {
      if (item.siteSlug && item.insight) result.set(item.siteSlug, item.insight.trim());
    }
  } catch {
    // ignore
  }
  return result;
}

export async function runAnalyticsInsights() {
  console.log("[analytics-insights] starting");
  if (!db) return { skipped: "db not configured" };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const publishedSites = await db.query.sites.findMany({
    where: eq(sites.isPublished, true),
    columns: { id: true, slug: true },
  });

  const siteData: { siteSlug: string; visitors: number; topPost: string | null; topSearch: string | null; topCategory: string | null }[] = [];

  for (const site of publishedSites) {
    // Count unique visitors via distinct sessionId
    const visitorRows = await db
      .select({ count: sql<number>`count(distinct ${pageViews.sessionId})` })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, site.id), gte(pageViews.createdAt, since)));
    const visitors = Number(visitorRows[0]?.count ?? 0);
    if (visitors < 10) continue;

    // Top clicked post
    const topPostRows = await db
      .select({ shortcode: postClicks.postShortcode, count: sql<number>`count(*)` })
      .from(postClicks)
      .where(and(eq(postClicks.siteId, site.id), gte(postClicks.createdAt, since)))
      .groupBy(postClicks.postShortcode)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    const topPost = topPostRows[0]?.shortcode ?? null;

    // Top search query
    const topSearchRows = await db
      .select({ query: searchEvents.query, count: sql<number>`count(*)` })
      .from(searchEvents)
      .where(and(eq(searchEvents.siteId, site.id), gte(searchEvents.createdAt, since)))
      .groupBy(searchEvents.query)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    const topSearch = topSearchRows[0]?.query ?? null;

    // Top category
    const topCategoryRows = await db
      .select({ category: categoryClicks.category, count: sql<number>`count(*)` })
      .from(categoryClicks)
      .where(and(eq(categoryClicks.siteId, site.id), gte(categoryClicks.createdAt, since)))
      .groupBy(categoryClicks.category)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    const topCategory = topCategoryRows[0]?.category ?? null;

    siteData.push({ siteSlug: site.slug, visitors, topPost, topSearch, topCategory });
  }

  const insightMap = await generateInsights(siteData);

  const insights: SiteInsight[] = siteData.map((s) => ({
    ...s,
    aiInsight: insightMap.get(s.siteSlug) ?? "Insufficient data for AI insight.",
  }));

  console.log(`[analytics-insights] done — sitesAnalyzed=${insights.length}`);
  return { sitesAnalyzed: insights.length, insights };
}
