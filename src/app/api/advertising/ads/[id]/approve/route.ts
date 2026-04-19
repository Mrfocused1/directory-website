import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { ads, adSlots, sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notifyAdApproved } from "@/lib/notifications/ad-purchase";
import { captureError } from "@/lib/error";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/ads/[id]/approve
 *
 * Authenticated (creator only). Flips a pending_review ad to active.
 * startsAt is already set by the webhook (now + 48h review window);
 * approving simply changes the status flag to active.
 */

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(_request, apiLimiter);
  if (limited) return limited;
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;

  // Fetch the ad + its site to verify ownership
  const [ad] = await db
    .select({
      id: ads.id,
      siteId: ads.siteId,
      slotId: ads.slotId,
      status: ads.status,
      advertiserEmail: ads.advertiserEmail,
      advertiserName: ads.advertiserName,
      startsAt: ads.startsAt,
      endsAt: ads.endsAt,
    })
    .from(ads)
    .where(eq(ads.id, id))
    .limit(1);

  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

  // Verify the caller owns the site this ad belongs to
  const [site] = await db
    .select({ id: sites.id, slug: sites.slug, displayName: sites.displayName, userId: sites.userId })
    .from(sites)
    .where(and(eq(sites.id, ad.siteId), eq(sites.userId, user.id)))
    .limit(1);

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ad.status !== "pending_review") {
    return NextResponse.json(
      { error: `Cannot approve an ad with status "${ad.status}"` },
      { status: 400 },
    );
  }

  await db
    .update(ads)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(ads.id, id));

  // Email the advertiser (non-blocking)
  try {
    if (ad.advertiserEmail && ad.startsAt && ad.endsAt) {
      await notifyAdApproved({
        advertiserName: ad.advertiserName || ad.advertiserEmail,
        advertiserEmail: ad.advertiserEmail,
        siteName: site.displayName || site.slug,
        siteSlug: site.slug,
        startsAt: ad.startsAt,
        endsAt: ad.endsAt,
      });
    }
  } catch (err) {
    captureError(err, { context: "ad-approve-email", adId: id });
  }

  return NextResponse.json({ ok: true, status: "active" });
}
