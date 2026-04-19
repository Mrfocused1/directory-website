import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { ads, adSlots, sites } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * GET /api/advertising/ads?siteId=X
 *
 * Authenticated (creator only). Returns all ads for a site the caller
 * owns, ordered by createdAt DESC. Includes all statuses except
 * pending_payment (incomplete purchases).
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  // Verify ownership
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1);

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select({
      id: ads.id,
      slotId: ads.slotId,
      slotType: adSlots.slotType,
      advertiserEmail: ads.advertiserEmail,
      advertiserName: ads.advertiserName,
      advertiserWebsite: ads.advertiserWebsite,
      amountCents: ads.amountCents,
      platformFeeCents: ads.platformFeeCents,
      creatorAmountCents: ads.creatorAmountCents,
      status: ads.status,
      assetUrl: ads.assetUrl,
      clickUrl: ads.clickUrl,
      headline: ads.headline,
      body: ads.body,
      startsAt: ads.startsAt,
      endsAt: ads.endsAt,
      createdAt: ads.createdAt,
      updatedAt: ads.updatedAt,
    })
    .from(ads)
    .innerJoin(adSlots, eq(ads.slotId, adSlots.id))
    .where(eq(ads.siteId, siteId))
    .orderBy(desc(ads.createdAt));

  return NextResponse.json({ ads: rows });
}
