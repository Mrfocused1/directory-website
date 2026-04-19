import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authApiRequest } from "@/lib/api-auth";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * GET /api/v1/posts?siteId=xxx&limit=50
 *
 * Returns posts for a site you own. Pagination via limit + cursor-free
 * (date-ordered) for simplicity.
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  const auth = await authApiRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const siteId = request.nextUrl.searchParams.get("siteId");
  let limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  if (!siteId) return NextResponse.json({ error: "Missing siteId parameter" }, { status: 400 });

  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  // Verify the caller owns the site
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, auth.userId)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const rows = await db.query.posts.findMany({
    where: eq(posts.siteId, siteId),
    orderBy: [desc(posts.takenAt)],
    limit,
  });

  return NextResponse.json({
    siteId,
    posts: rows.map((p) => ({
      id: p.id,
      shortcode: p.shortcode,
      type: p.type,
      title: p.title,
      caption: p.caption,
      category: p.category,
      takenAt: p.takenAt?.toISOString() ?? null,
      mediaUrl: p.mediaUrl,
      thumbUrl: p.thumbUrl,
      numSlides: p.numSlides,
      transcript: p.transcript,
      platformUrl: p.platformUrl,
      isVisible: p.isVisible,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
