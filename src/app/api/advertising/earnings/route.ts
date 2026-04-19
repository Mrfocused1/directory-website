import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { sites, ads, adImpressions, adClicks } from "@/db/schema";
import { and, eq, gte, sum, count, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  // Get all site IDs this creator owns
  const userSites = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.userId, user.id));

  if (userSites.length === 0) {
    return NextResponse.json({
      totalEarningsCents: 0,
      activeAdsCount: 0,
      impressions30d: 0,
      clicks30d: 0,
    });
  }

  const siteIds = userSites.map((s) => s.id);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Total earnings from all active/completed ads across creator's sites
  const [earningsRow] = await db
    .select({ total: sum(ads.creatorAmountCents) })
    .from(ads)
    .where(
      and(
        inArray(ads.siteId, siteIds),
        // only count ads that have been paid — exclude pending_payment
        inArray(ads.status, ["active", "expired", "pending_review", "paused"]),
      ),
    );

  // Count currently active ads
  const [activeRow] = await db
    .select({ total: count() })
    .from(ads)
    .where(and(inArray(ads.siteId, siteIds), eq(ads.status, "active")));

  // Impressions in last 30 days — join via ads to scope to this creator's sites
  const activeSiteAds = await db
    .select({ id: ads.id })
    .from(ads)
    .where(inArray(ads.siteId, siteIds));

  let impressions30d = 0;
  let clicks30d = 0;

  if (activeSiteAds.length > 0) {
    const adIds = activeSiteAds.map((a) => a.id);

    const [impRow] = await db
      .select({ total: count() })
      .from(adImpressions)
      .where(
        and(
          inArray(adImpressions.adId, adIds),
          gte(adImpressions.createdAt, since30d),
        ),
      );

    const [clickRow] = await db
      .select({ total: count() })
      .from(adClicks)
      .where(
        and(
          inArray(adClicks.adId, adIds),
          gte(adClicks.createdAt, since30d),
        ),
      );

    impressions30d = impRow?.total ?? 0;
    clicks30d = clickRow?.total ?? 0;
  }

  return NextResponse.json({
    totalEarningsCents: Number(earningsRow?.total ?? 0),
    activeAdsCount: activeRow?.total ?? 0,
    impressions30d,
    clicks30d,
  });
}
