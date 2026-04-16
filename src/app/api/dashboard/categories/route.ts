import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { revalidateTenantBySiteId } from "@/lib/cache";

async function ensureSiteOwnership(siteId: string, userId: string) {
  if (!db) return null;
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, userId)),
    columns: { id: true },
  });
  return site?.id || null;
}

/**
 * GET /api/dashboard/categories?siteId=xxx
 * Returns distinct categories across the site's posts with counts.
 */
export async function GET(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const ok = await ensureSiteOwnership(siteId, user.id);
  if (!ok) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const rows = await db
    .select({
      category: posts.category,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(posts)
    .where(eq(posts.siteId, siteId))
    .groupBy(posts.category)
    .orderBy(sql`count(*) desc`);

  return NextResponse.json({
    categories: rows.map((r) => ({ name: r.category, count: r.count ?? 0 })),
  });
}

/**
 * PATCH /api/dashboard/categories
 * Body: { siteId, action: "rename"|"merge", from: string, to: string }
 *
 * Rename: updates every post where category = `from` to `to`.
 * Merge:  same effect — moves all posts from one category into another
 *         that already exists. We keep them as separate actions so the
 *         UI can warn the user when `to` already exists ("this is a merge").
 */
export async function PATCH(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { siteId, action, from, to } = body;

  if (!siteId || !action || typeof from !== "string" || typeof to !== "string") {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  const fromTrim = from.trim();
  const toTrim = to.trim();
  if (!fromTrim || !toTrim) {
    return NextResponse.json({ error: "Both from and to must be non-empty" }, { status: 400 });
  }
  if (toTrim.length > 64) {
    return NextResponse.json({ error: "Target category too long" }, { status: 400 });
  }
  if (!["rename", "merge"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const ok = await ensureSiteOwnership(siteId, user.id);
  if (!ok) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const result = await db
    .update(posts)
    .set({ category: toTrim })
    .where(and(eq(posts.siteId, siteId), eq(posts.category, fromTrim)))
    .returning({ id: posts.id });

  if (result.length > 0) await revalidateTenantBySiteId(siteId);

  return NextResponse.json({ updated: result.length, from: fromTrim, to: toTrim });
}

/**
 * POST /api/dashboard/categories
 * Body: { siteId, action: "add"|"delete"|"reorder", ... }
 *
 * add:     { name: string } — adds name to site.categories array
 * delete:  { name: string } — moves posts to "Uncategorized", removes from array
 * reorder: { order: string[] } — replaces site.categories with new order
 */
export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { siteId, action } = body;

  if (!siteId || !action) {
    return NextResponse.json({ error: "Missing siteId or action" }, { status: 400 });
  }

  const ownedSiteId = await ensureSiteOwnership(siteId, user.id);
  if (!ownedSiteId) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  if (action === "add") {
    const name = (body.name ?? "").trim();
    if (!name || name.length > 64) {
      return NextResponse.json({ error: "Invalid category name" }, { status: 400 });
    }

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { categories: true },
    });
    const existing = (site?.categories as string[]) ?? [];
    if (existing.some((c: string) => c.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }

    await db.update(sites)
      .set({ categories: [...existing, name] })
      .where(eq(sites.id, siteId));

    await revalidateTenantBySiteId(siteId);
    return NextResponse.json({ added: name });
  }

  if (action === "delete") {
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Missing category name" }, { status: 400 });
    }

    const moved = await db
      .update(posts)
      .set({ category: "Uncategorized" })
      .where(and(eq(posts.siteId, siteId), eq(posts.category, name)))
      .returning({ id: posts.id });

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { categories: true },
    });
    const updated = ((site?.categories as string[]) ?? []).filter(
      (c: string) => c.toLowerCase() !== name.toLowerCase(),
    );
    await db.update(sites)
      .set({ categories: updated })
      .where(eq(sites.id, siteId));

    await revalidateTenantBySiteId(siteId);
    return NextResponse.json({ deleted: name, postsMoved: moved.length });
  }

  if (action === "reorder") {
    const order = body.order;
    if (!Array.isArray(order) || order.some((c: unknown) => typeof c !== "string")) {
      return NextResponse.json({ error: "order must be a string array" }, { status: 400 });
    }

    await db.update(sites)
      .set({ categories: order })
      .where(eq(sites.id, siteId));

    await revalidateTenantBySiteId(siteId);
    return NextResponse.json({ reordered: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
