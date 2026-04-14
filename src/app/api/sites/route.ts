import { NextResponse } from "next/server";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";

// GET /api/sites — List all sites for the current user
// TODO: Filter by authenticated userId once auth is implemented
export async function GET() {
  if (!db) {
    return NextResponse.json({ sites: [] });
  }

  try {
    // Single query with LEFT JOIN to get post counts (avoids N+1)
    const rows = await db
      .select({
        id: sites.id,
        slug: sites.slug,
        displayName: sites.displayName,
        handle: sites.handle,
        platform: sites.platform,
        isPublished: sites.isPublished,
        lastSyncAt: sites.lastSyncAt,
        postCount: sql<number>`cast(count(${posts.id}) as int)`,
      })
      .from(sites)
      .leftJoin(posts, eq(posts.siteId, sites.id))
      .groupBy(sites.id)
      .orderBy(sites.createdAt);

    const result = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.displayName,
      handle: row.handle,
      platform: row.platform,
      postCount: row.postCount ?? 0,
      isPublished: row.isPublished,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ sites: result });
  } catch (error) {
    console.error("[sites] GET error:", error);
    return NextResponse.json({ sites: [] });
  }
}
