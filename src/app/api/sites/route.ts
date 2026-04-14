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

// PATCH /api/sites?id=xxx — Update editable site fields (newsletter settings, etc.)
export async function PATCH(request: NextRequest) {
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
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if ("newsletterFromName" in body) {
      const v = body.newsletterFromName;
      if (v !== null && typeof v !== "string") {
        return NextResponse.json({ error: "newsletterFromName must be a string or null" }, { status: 400 });
      }
      if (typeof v === "string" && v.length > 64) {
        return NextResponse.json({ error: "newsletterFromName too long (max 64 characters)" }, { status: 400 });
      }
      updates.newsletterFromName = v?.trim() || null;
    }

    if ("newsletterReplyTo" in body) {
      const v = body.newsletterReplyTo;
      if (v !== null && typeof v !== "string") {
        return NextResponse.json({ error: "newsletterReplyTo must be a string or null" }, { status: 400 });
      }
      if (typeof v === "string" && v.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) {
          return NextResponse.json({ error: "newsletterReplyTo must be a valid email" }, { status: 400 });
        }
        if (v.length > 320) {
          return NextResponse.json({ error: "newsletterReplyTo too long" }, { status: 400 });
        }
        updates.newsletterReplyTo = v.trim();
      } else {
        updates.newsletterReplyTo = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    updates.updatedAt = new Date();

    const [updated] = await db.update(sites)
      .set(updates)
      .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
      .returning({
        id: sites.id,
        newsletterFromName: sites.newsletterFromName,
        newsletterReplyTo: sites.newsletterReplyTo,
      });

    if (!updated) {
      return NextResponse.json({ error: "Site not found or not owned by you" }, { status: 404 });
    }

    return NextResponse.json({ site: updated });
  } catch (error) {
    console.error("[sites] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update site" }, { status: 500 });
  }
}
