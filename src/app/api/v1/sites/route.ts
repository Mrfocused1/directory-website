import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { authApiRequest } from "@/lib/api-auth";

/**
 * GET /api/v1/sites
 *
 * Public API. Returns all sites owned by the caller's API key.
 * Authentication: `Authorization: Bearer bmd_xxx`
 */
export async function GET(request: NextRequest) {
  const auth = await authApiRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const rows = await db.select({
    id: sites.id,
    slug: sites.slug,
    displayName: sites.displayName,
    handle: sites.handle,
    platform: sites.platform,
    isPublished: sites.isPublished,
    bio: sites.bio,
    categories: sites.categories,
    lastSyncAt: sites.lastSyncAt,
    createdAt: sites.createdAt,
    postCount: sql<number>`cast(count(${posts.id}) as int)`,
  })
    .from(sites)
    .leftJoin(posts, eq(posts.siteId, sites.id))
    .where(eq(sites.userId, auth.userId))
    .groupBy(sites.id)
    .orderBy(sites.createdAt);

  return NextResponse.json({
    sites: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      displayName: r.displayName,
      handle: r.handle,
      platform: r.platform,
      isPublished: r.isPublished,
      bio: r.bio,
      categories: r.categories,
      postCount: r.postCount ?? 0,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
