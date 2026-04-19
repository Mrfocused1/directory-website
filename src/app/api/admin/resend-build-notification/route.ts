import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { notifyBuildRequested } from "@/lib/notifications/build-request";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;

  await requireAdmin();

  const body = await request.json().catch(() => ({}));
  const slug: string | undefined = body.slug;
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  if (!db) return NextResponse.json({ error: "db unavailable" }, { status: 503 });

  const [row] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      platform: sites.platform,
      handle: sites.handle,
      displayName: sites.displayName,
      userEmail: users.email,
    })
    .from(sites)
    .leftJoin(users, eq(users.id, sites.userId))
    .where(eq(sites.slug, slug))
    .limit(1);

  if (!row) return NextResponse.json({ error: `no site with slug "${slug}"` }, { status: 404 });

  const result = await notifyBuildRequested({
    siteId: row.id,
    slug: row.slug,
    platform: row.platform,
    handle: row.handle,
    displayName: row.displayName ?? row.slug,
    userEmail: row.userEmail,
    plan: "creator",
    postLimit: 500,
  });

  return NextResponse.json({ ok: true, ...result });
}
