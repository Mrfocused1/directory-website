import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pageViews, postClicks, searchEvents, categoryClicks, dailyStats } from "@/db/schema";
import { eq, and, gte, count, sql, desc, isNotNull } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";

/**
 * GET /api/analytics/summary?siteId=xxx&days=30
 *
 * Returns analytics summary data from the database.
 * Falls back to empty data when DB is unavailable.
 */
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  const days = parseInt(request.nextUrl.searchParams.get("days") || "30", 10);

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ hasData: false });
  }

  const resolvedSiteId = await resolveSiteId(siteId);
  if (!resolvedSiteId) {
    return NextResponse.json({ hasData: false });
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    // Aggregate page views
    const [viewsResult] = await db.select({ count: count() })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, resolvedSiteId), gte(pageViews.createdAt, since)));

    // Unique visitors (distinct non-null sessions)
    const uniqueResult = await db.select({ sessionId: pageViews.sessionId })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, resolvedSiteId), gte(pageViews.createdAt, since), isNotNull(pageViews.sessionId)))
      .groupBy(pageViews.sessionId);

    // Post clicks
    const [clicksResult] = await db.select({ count: count() })
      .from(postClicks)
      .where(and(eq(postClicks.siteId, resolvedSiteId), gte(postClicks.createdAt, since)));

    // Searches
    const [searchesResult] = await db.select({ count: count() })
      .from(searchEvents)
      .where(and(eq(searchEvents.siteId, resolvedSiteId), gte(searchEvents.createdAt, since)));

    // Shares
    const [sharesResult] = await db.select({ count: count() })
      .from(postClicks)
      .where(and(eq(postClicks.siteId, resolvedSiteId), eq(postClicks.shared, true), gte(postClicks.createdAt, since)));

    // Top search terms
    const topSearches = await db.select({
      query: searchEvents.query,
      count: count(),
    })
      .from(searchEvents)
      .where(and(eq(searchEvents.siteId, resolvedSiteId), gte(searchEvents.createdAt, since)))
      .groupBy(searchEvents.query)
      .orderBy(desc(count()))
      .limit(10);

    // Top categories
    const topCategories = await db.select({
      category: categoryClicks.category,
      count: count(),
    })
      .from(categoryClicks)
      .where(and(eq(categoryClicks.siteId, resolvedSiteId), gte(categoryClicks.createdAt, since)))
      .groupBy(categoryClicks.category)
      .orderBy(desc(count()))
      .limit(10);

    // Device breakdown
    const deviceBreakdown = await db.select({
      device: pageViews.device,
      count: count(),
    })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, resolvedSiteId), gte(pageViews.createdAt, since)))
      .groupBy(pageViews.device);

    // Country breakdown
    const countryBreakdown = await db.select({
      country: pageViews.country,
      count: count(),
    })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, resolvedSiteId), gte(pageViews.createdAt, since)))
      .groupBy(pageViews.country)
      .orderBy(desc(count()))
      .limit(10);

    // Referrer breakdown
    const referrerBreakdown = await db.select({
      referrer: pageViews.referrer,
      count: count(),
    })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, resolvedSiteId), gte(pageViews.createdAt, since)))
      .groupBy(pageViews.referrer)
      .orderBy(desc(count()))
      .limit(10);

    // Daily stats (pre-aggregated)
    const daily = await db.select()
      .from(dailyStats)
      .where(eq(dailyStats.siteId, resolvedSiteId))
      .orderBy(desc(dailyStats.date))
      .limit(days);

    const totalViews = viewsResult.count;
    const totalClicks = clicksResult.count;

    return NextResponse.json({
      hasData: totalViews > 0,
      summary: {
        totalViews,
        uniqueVisitors: uniqueResult.length,
        totalClicks,
        totalSearches: searchesResult.count,
        totalShares: sharesResult.count,
        ctr: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0,
      },
      dailyStats: daily.map((d) => ({
        date: d.date,
        views: d.totalViews,
        uniqueVisitors: d.uniqueVisitors,
        clicks: d.totalClicks,
        searches: d.totalSearches,
        shares: d.totalShares,
      })),
      topSearches: topSearches.map((s) => ({ query: s.query, count: s.count })),
      topCategories: topCategories.map((c) => ({ category: c.category, clicks: c.count })),
      devices: deviceBreakdown.map((d) => ({ device: d.device || "unknown", count: d.count })),
      countries: countryBreakdown.map((c) => ({ country: c.country || "unknown", count: c.count })),
      referrers: referrerBreakdown.map((r) => {
        let source = "Direct";
        if (r.referrer) {
          try { source = new URL(r.referrer).hostname; } catch { source = r.referrer; }
        }
        return { source, visitors: r.count };
      }),
    });
  } catch (error) {
    console.error("[analytics/summary] Error:", error);
    return NextResponse.json({ hasData: false });
  }
}
