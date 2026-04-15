import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";

/**
 * POST /api/dashboard/posts/reorder
 * Body: { siteId, ids: string[] }
 *
 * Persists the user's manual ordering for a site. Each id's index in
 * the array becomes its sort_order. All ids must belong to sites
 * owned by the caller.
 */
export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const database = db; // narrow the nullable type for closures
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { siteId, ids } = body;
  if (typeof siteId !== "string" || !siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > 1000) {
    return NextResponse.json({ error: "Too many ids" }, { status: 400 });
  }
  if (!ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be strings" }, { status: 400 });
  }

  // Site ownership
  const site = await database.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Confirm every id belongs to this site (defends against IDORs that
  // mix in other users' post ids in one request).
  const owned = await database
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.siteId, siteId), inArray(posts.id, ids)));
  if (owned.length !== ids.length) {
    return NextResponse.json(
      { error: "One or more posts don't belong to this site" },
      { status: 403 },
    );
  }

  // Apply ordering. Index = sortOrder (lower wins).
  await Promise.all(
    ids.map((id, idx) =>
      database.update(posts).set({ sortOrder: idx }).where(eq(posts.id, id)),
    ),
  );

  return NextResponse.json({ updated: ids.length });
}
