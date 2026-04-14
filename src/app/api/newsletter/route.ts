import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, digestHistory } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";

/**
 * GET /api/newsletter?siteId=xxx
 *
 * Returns newsletter dashboard data: subscribers, digests, growth.
 */
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ hasData: false });
  }

  try {
    const resolvedSiteId = await resolveSiteId(siteId);
    if (!resolvedSiteId) {
      return NextResponse.json({ hasData: false });
    }

    // Fetch all subscribers for this site
    const allSubscribers = await db.query.subscribers.findMany({
      where: eq(subscribers.siteId, resolvedSiteId),
    });

    // Fetch digest history
    const digests = await db.query.digestHistory.findMany({
      where: eq(digestHistory.siteId, resolvedSiteId),
      orderBy: [desc(digestHistory.sentAt)],
      limit: 10,
    });

    // Format subscribers for the dashboard
    const formattedSubs = allSubscribers.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      categories: (s.categories as string[]) || [],
      frequency: s.frequency,
      isActive: s.isActive,
      isVerified: s.isVerified,
      createdAt: s.createdAt.toISOString(),
    }));

    // Format digests
    const formattedDigests = digests.map((d) => ({
      id: d.id,
      subject: d.subject,
      postCount: d.postCount,
      recipientCount: d.recipientCount,
      openCount: d.openCount,
      clickCount: d.clickCount,
      sentAt: d.sentAt.toISOString(),
    }));

    // Category breakdown
    const categoryMap: Record<string, number> = {};
    for (const sub of allSubscribers) {
      if (sub.isActive && sub.isVerified) {
        const cats = (sub.categories as string[]) || [];
        if (cats.length === 0) {
          categoryMap["All topics"] = (categoryMap["All topics"] || 0) + 1;
        } else {
          for (const cat of cats) {
            categoryMap[cat] = (categoryMap[cat] || 0) + 1;
          }
        }
      }
    }
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Simple growth data (subscribers per week for last 8 weeks)
    const growth = [];
    for (let i = 7; i >= 0; i--) {
      const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      const subsBeforeDate = allSubscribers.filter(
        (s) => new Date(s.createdAt) <= weekEnd,
      ).length;
      growth.push({
        week: weekEnd.toISOString().slice(0, 10),
        total: subsBeforeDate,
      });
    }

    return NextResponse.json({
      hasData: allSubscribers.length > 0,
      subscribers: formattedSubs,
      digests: formattedDigests,
      categoryBreakdown,
      growth,
    });
  } catch (error) {
    console.error("[newsletter] Error:", error);
    return NextResponse.json({ hasData: false });
  }
}
