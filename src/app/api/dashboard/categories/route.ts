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
 * Returns categories with counts, ordered by the saved sites.categories array.
 * Categories that exist in posts but not in the array are appended at the end.
 */
export async function GET(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const ok = await ensureSiteOwnership(siteId, user.id);
  if (!ok) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const [rows, site] = await Promise.all([
    db
      .select({
        category: posts.category,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(posts)
      .where(eq(posts.siteId, siteId))
      .groupBy(posts.category),
    db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { categories: true },
    }),
  ]);

  const countMap = new Map(rows.map((r) => [r.category, r.count ?? 0]));
  const savedOrder = (site?.categories as string[]) ?? [];

  // Build ordered list: saved order first, then any categories from posts not in the array
  const result: { name: string; count: number }[] = [];
  const seen = new Set<string>();

  for (const name of savedOrder) {
    seen.add(name);
    result.push({ name, count: countMap.get(name) ?? 0 });
  }

  for (const [name, count] of countMap) {
    if (!seen.has(name)) {
      result.push({ name, count });
    }
  }

  return NextResponse.json({ categories: result });
}

/**
 * PATCH /api/dashboard/categories
 * Body: { siteId, action: "rename"|"merge", from: string, to: string }
 *
 * Updates posts AND the sites.categories array to keep them in sync.
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

  // Update posts
  const result = await db
    .update(posts)
    .set({ category: toTrim })
    .where(and(eq(posts.siteId, siteId), eq(posts.category, fromTrim)))
    .returning({ id: posts.id });

  // Update sites.categories array: replace `from` with `to`, or remove `from` if merging into existing
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, siteId),
    columns: { categories: true },
  });
  const cats = (site?.categories as string[]) ?? [];
  const toExists = cats.some((c) => c.toLowerCase() === toTrim.toLowerCase() && c.toLowerCase() !== fromTrim.toLowerCase());

  let updatedCats: string[];
  if (toExists) {
    // Merge: remove the source, keep the target
    updatedCats = cats.filter((c) => c.toLowerCase() !== fromTrim.toLowerCase());
  } else {
    // Rename: replace in-place
    updatedCats = cats.map((c) => (c.toLowerCase() === fromTrim.toLowerCase() ? toTrim : c));
  }

  await db.update(sites).set({ categories: updatedCats }).where(eq(sites.id, siteId));

  if (result.length > 0 || cats.length !== updatedCats.length) {
    await revalidateTenantBySiteId(siteId);
  }

  return NextResponse.json({ updated: result.length, from: fromTrim, to: toTrim });
}

/**
 * POST /api/dashboard/categories
 * Body: { siteId, action: "add"|"delete"|"reorder", ... }
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

    // Guard: cannot delete "Uncategorized" — that's the fallback target
    if (name.toLowerCase() === "uncategorized") {
      return NextResponse.json({ error: "Cannot delete the Uncategorized category" }, { status: 400 });
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

    // Ensure "Uncategorized" is in the array if posts were moved there
    if (moved.length > 0 && !updated.some((c) => c.toLowerCase() === "uncategorized")) {
      updated.push("Uncategorized");
    }

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
