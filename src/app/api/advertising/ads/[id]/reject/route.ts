import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { ads, sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { notifyAdRejected } from "@/lib/notifications/ad-purchase";
import { captureError } from "@/lib/error";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/ads/[id]/reject
 *
 * Authenticated (creator only). Flips a pending_review ad to rejected,
 * issues a full Stripe refund (including reversing the platform fee and
 * transfer), and emails the advertiser.
 *
 * Body (optional): { reason: string }
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;

  let reason: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    reason = typeof body.reason === "string" ? body.reason.slice(0, 512) : undefined;
  } catch {
    // no body — fine
  }

  // Fetch the ad
  const [ad] = await db
    .select({
      id: ads.id,
      siteId: ads.siteId,
      status: ads.status,
      stripePaymentIntentId: ads.stripePaymentIntentId,
      amountCents: ads.amountCents,
      advertiserEmail: ads.advertiserEmail,
      advertiserName: ads.advertiserName,
    })
    .from(ads)
    .where(eq(ads.id, id))
    .limit(1);

  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

  // Verify ownership
  const [site] = await db
    .select({ id: sites.id, displayName: sites.displayName, slug: sites.slug, userId: sites.userId })
    .from(sites)
    .where(and(eq(sites.id, ad.siteId), eq(sites.userId, user.id)))
    .limit(1);

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ad.status !== "pending_review") {
    return NextResponse.json(
      { error: `Cannot reject an ad with status "${ad.status}"` },
      { status: 400 },
    );
  }

  // Issue Stripe refund — reverse transfer + application fee so the
  // money flows back to the advertiser rather than staying with us.
  if (stripe && ad.stripePaymentIntentId) {
    try {
      await stripe.refunds.create({
        payment_intent: ad.stripePaymentIntentId,
        reason: "fraudulent", // closest Stripe enum; means "customer not happy"
        refund_application_fee: true,
        reverse_transfer: true,
      });
    } catch (stripeErr) {
      captureError(stripeErr, { context: "ad-reject-stripe-refund", adId: id });
      return NextResponse.json(
        { error: "Stripe refund failed. Please retry or process manually in the Stripe dashboard." },
        { status: 502 },
      );
    }
  }

  // Flip status
  await db
    .update(ads)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(ads.id, id));

  // Email the advertiser (non-blocking)
  try {
    if (ad.advertiserEmail) {
      await notifyAdRejected({
        advertiserName: ad.advertiserName || ad.advertiserEmail,
        advertiserEmail: ad.advertiserEmail,
        siteName: site.displayName || site.slug,
        refundAmountCents: ad.amountCents,
        reason,
      });
    }
  } catch (err) {
    captureError(err, { context: "ad-reject-email", adId: id });
  }

  return NextResponse.json({ ok: true, status: "rejected" });
}
