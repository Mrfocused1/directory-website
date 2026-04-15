import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, subscribers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authApiRequest } from "@/lib/api-auth";

/**
 * GET /api/v1/subscribers?siteId=xxx
 *
 * Returns subscribers for a site you own. Subscriber emails are
 * always included (auth-gated by API key + ownership check).
 */
export async function GET(request: NextRequest) {
  const auth = await authApiRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId parameter" }, { status: 400 });

  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  // Verify the caller owns the site
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, auth.userId)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const rows = await db.query.subscribers.findMany({
    where: eq(subscribers.siteId, siteId),
    orderBy: [desc(subscribers.createdAt)],
  });

  return NextResponse.json({
    siteId,
    subscribers: rows.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      categories: s.categories,
      frequency: s.frequency,
      isActive: s.isActive,
      isVerified: s.isVerified,
      lastDigestAt: s.lastDigestAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
