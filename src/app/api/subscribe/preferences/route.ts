import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, posts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";

/**
 * GET /api/subscribe/preferences?token=xxx&siteId=xxx
 *
 * Returns the subscriber's current preferences plus the list of
 * categories that exist on this site so the UI can render multi-select.
 * Token-authenticated (from digest emails) — no session required.
 */
export async function GET(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  const token = request.nextUrl.searchParams.get("token");
  if (!siteId || !token) {
    return NextResponse.json({ error: "Missing siteId or token" }, { status: 400 });
  }

  const resolvedSiteId = await resolveSiteId(siteId);
  if (!resolvedSiteId) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const subscriber = await db.query.subscribers.findFirst({
    where: and(
      eq(subscribers.siteId, resolvedSiteId),
      eq(subscribers.unsubscribeToken, token),
    ),
  });
  if (!subscriber) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  // Distinct list of categories across the site's posts
  const catRows = await db
    .selectDistinct({ category: posts.category })
    .from(posts)
    .where(and(eq(posts.siteId, resolvedSiteId), eq(posts.isVisible, true)))
    .orderBy(sql`${posts.category} asc`);

  return NextResponse.json({
    subscriber: {
      email: subscriber.email,
      name: subscriber.name,
      frequency: subscriber.frequency,
      categories: subscriber.categories || [],
      isActive: subscriber.isActive,
      isVerified: subscriber.isVerified,
    },
    availableCategories: catRows.map((c) => c.category).filter(Boolean),
  });
}
