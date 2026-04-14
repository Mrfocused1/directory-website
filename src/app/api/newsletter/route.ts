import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, digestHistory, sites } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ownedSiteId } from "@/db/utils";
import { getApiUser } from "@/lib/supabase/api";

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

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    // Verify ownership of the site
    const resolvedSiteId = await ownedSiteId(siteId, user.id);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Include newsletter settings so the dashboard can show/edit them
    const siteSettings = await db.query.sites.findFirst({
      where: eq(sites.id, resolvedSiteId),
      columns: { newsletterFromName: true, newsletterReplyTo: true, displayName: true, slug: true },
    });

    return NextResponse.json({
      hasData: allSubscribers.length > 0,
      subscribers: formattedSubs,
      digests: formattedDigests,
      categoryBreakdown,
      growth,
      settings: {
        fromName: siteSettings?.newsletterFromName || siteSettings?.displayName || siteSettings?.slug || "",
        replyTo: siteSettings?.newsletterReplyTo || "",
        fromNameCustom: !!siteSettings?.newsletterFromName,
        replyToCustom: !!siteSettings?.newsletterReplyTo,
      },
    });
  } catch (error) {
    console.error("[newsletter] Error:", error);
    return NextResponse.json({ hasData: false });
  }
}
