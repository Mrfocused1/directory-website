import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { revalidateTenantBySiteId } from "@/lib/cache";

/**
 * GET /api/dashboard/posts?siteId=xxx
 * Returns posts for a site owned by the authenticated user.
 */
export async function GET(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Same ordering as the public directory so the dashboard list
  // mirrors what visitors actually see.
  const rows = await db.query.posts.findMany({
    where: eq(posts.siteId, siteId),
    orderBy: (p, { desc, asc }) => [
      desc(p.isFeatured),
      asc(p.sortOrder),
      desc(p.takenAt),
    ],
    limit: 500,
  });

  return NextResponse.json({
    posts: rows.map((p) => ({
      id: p.id,
      shortcode: p.shortcode,
      type: p.type,
      title: p.title,
      caption: p.caption,
      category: p.category,
      thumbUrl: p.thumbUrl,
      mediaUrl: p.mediaUrl,
      platformUrl: p.platformUrl,
      takenAt: p.takenAt?.toISOString() ?? null,
      isVisible: p.isVisible,
      isFeatured: p.isFeatured,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/dashboard/posts?id=xxx
 * Updates title/caption/category/isVisible for a post owned by the caller.
 */
export async function PATCH(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Ownership check via site join
  const existing = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    columns: { id: true, siteId: true },
  });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, existing.siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if ("title" in body) {
    const v = body.title;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "title must be a string or null" }, { status: 400 });
    }
    if (typeof v === "string" && v.length > 500) {
      return NextResponse.json({ error: "title too long" }, { status: 400 });
    }
    updates.title = v === null ? null : v.trim() || null;
  }

  if ("caption" in body) {
    const v = body.caption;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "caption must be a string or null" }, { status: 400 });
    }
    if (typeof v === "string" && v.length > 10000) {
      return NextResponse.json({ error: "caption too long" }, { status: 400 });
    }
    updates.caption = v === null ? null : v.trim() || null;
  }

  if ("category" in body) {
    const v = body.category;
    if (typeof v !== "string" || !v.trim()) {
      return NextResponse.json({ error: "category must be a non-empty string" }, { status: 400 });
    }
    if (v.length > 64) return NextResponse.json({ error: "category too long" }, { status: 400 });
    updates.category = v.trim();
  }

  if ("isVisible" in body) {
    if (typeof body.isVisible !== "boolean") {
      return NextResponse.json({ error: "isVisible must be a boolean" }, { status: 400 });
    }
    updates.isVisible = body.isVisible;
  }

  if ("isFeatured" in body) {
    if (typeof body.isFeatured !== "boolean") {
      return NextResponse.json({ error: "isFeatured must be a boolean" }, { status: 400 });
    }
    updates.isFeatured = body.isFeatured;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const [updated] = await db.update(posts).set(updates).where(eq(posts.id, id)).returning();
  if (updated) await revalidateTenantBySiteId(updated.siteId);
  return NextResponse.json({ post: updated });
}

/**
 * DELETE /api/dashboard/posts?id=xxx
 * Deletes a post owned by the caller.
 */
export async function DELETE(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    columns: { id: true, siteId: true },
  });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, existing.siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(posts).where(eq(posts.id, id));
  await revalidateTenantBySiteId(existing.siteId);
  return NextResponse.json({ deleted: true });
}
