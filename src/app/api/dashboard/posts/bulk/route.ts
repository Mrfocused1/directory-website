import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { revalidateTenantBySiteId } from "@/lib/cache";

/**
 * POST /api/dashboard/posts/bulk
 * Body: { ids: string[], action: "hide"|"show"|"delete"|"feature"|"unfeature"|"recategorize", category?: string }
 *
 * Applies an action across many posts at once. All targeted posts must
 * belong to sites owned by the caller — we enforce that in a single
 * ownership filter to avoid partial execution.
 */
export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { ids, action, category } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "Too many ids (max 500)" }, { status: 400 });
  }
  if (!ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be strings" }, { status: 400 });
  }

  // Ownership check: find only posts owned by this user among the given ids.
  // Capture siteIds so we can invalidate tenant caches after mutation.
  const owned = await db
    .select({ id: posts.id, siteId: posts.siteId })
    .from(posts)
    .innerJoin(sites, eq(sites.id, posts.siteId))
    .where(and(inArray(posts.id, ids), eq(sites.userId, user.id)));

  const ownedIds = owned.map((o) => o.id);
  const affectedSiteIds = Array.from(new Set(owned.map((o) => o.siteId)));
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "No accessible posts" }, { status: 404 });
  }

  switch (action) {
    case "hide":
      await db.update(posts).set({ isVisible: false }).where(inArray(posts.id, ownedIds));
      break;
    case "show":
      await db.update(posts).set({ isVisible: true }).where(inArray(posts.id, ownedIds));
      break;
    case "feature":
      await db.update(posts).set({ isFeatured: true }).where(inArray(posts.id, ownedIds));
      break;
    case "unfeature":
      await db.update(posts).set({ isFeatured: false }).where(inArray(posts.id, ownedIds));
      break;
    case "delete":
      await db.delete(posts).where(inArray(posts.id, ownedIds));
      break;
    case "recategorize": {
      if (typeof category !== "string" || !category.trim()) {
        return NextResponse.json({ error: "category required for recategorize" }, { status: 400 });
      }
      if (category.length > 64) {
        return NextResponse.json({ error: "category too long" }, { status: 400 });
      }
      await db.update(posts).set({ category: category.trim() }).where(inArray(posts.id, ownedIds));
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // All bulk actions change what the public page shows — flush the
  // CDN cache on every affected tenant.
  await Promise.all(affectedSiteIds.map((id) => revalidateTenantBySiteId(id)));

  return NextResponse.json({ affected: ownedIds.length });
}
