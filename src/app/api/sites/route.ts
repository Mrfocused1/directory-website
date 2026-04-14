import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";

// GET /api/sites — List sites for the authenticated user
export async function GET() {
  if (!db) {
    return NextResponse.json({ sites: [] });
  }

  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Single query with LEFT JOIN to get post counts, scoped to authenticated user
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
      .where(eq(sites.userId, user.id))
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

// DELETE /api/sites?id=xxx — Delete a site owned by the authenticated user.
// Cascading FKs in the schema delete posts, jobs, subscribers, etc.
export async function DELETE(request: NextRequest) {
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const siteId = request.nextUrl.searchParams.get("id");
  if (!siteId) {
    return NextResponse.json({ error: "Missing site id" }, { status: 400 });
  }

  try {
    // Only allow deletion if the user owns the site
    const result = await db.delete(sites)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
      .returning({ id: sites.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Site not found or not owned by you" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: result[0].id });
  } catch (error) {
    console.error("[sites] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete site" }, { status: 500 });
  }
}
