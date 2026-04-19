import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { ads, sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { notifyAdRejected, notifyAdDeclined } from "@/lib/notifications/ad-purchase";
import { captureError } from "@/lib/error";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/ads/[id]/reject
 *
 * Authenticated (creator only).
 *
 * ── NEW FLOW (pending_approval | pending_payment) ────────────────────
 * No payment was taken (or is pending) — just flip to rejected and
 * email the advertiser. No Stripe refund needed.
 *
 * ── LEGACY FLOW (pending_review) ─────────────────────────────────────
 * Issue a full Stripe refund (reversing transfer + platform fee), flip
 * to rejected, and email the advertiser with refund details.
 *
 * Body (optional): { reason: string }
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await checkRateLimit(request, apiLimiter);
  if (rateLimited) return rateLimited;
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

  const [site] = await db
    .select({
      id: sites.id,
      displayName: sites.displayName,
      slug: sites.slug,
      userId: sites.userId,
    })
    .from(sites)
    .where(and(eq(sites.id, ad.siteId), eq(sites.userId, user.id)))
    .limit(1);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── NEW FLOW: decline before approval (no payment taken yet, safe) ──
  if (ad.status === "pending_approval") {
    await db
      .update(ads)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(ads.id, id));

    try {
      if (ad.advertiserEmail) {
        await notifyAdDeclined({
          advertiserName: ad.advertiserName || ad.advertiserEmail,
          advertiserEmail: ad.advertiserEmail,
          siteName: site.displayName || site.slug,
          reason,
        });
      }
    } catch (err) {
      captureError(err, { context: "ad-decline-email", adId: id });
    }

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // pending_payment: the advertiser could be paying right now. Declining
  // here races the webhook — if they pay, the UPDATE … WHERE status='pending_payment'
  // in the webhook wouldn't match (status is 'rejected') so the activation
  // silently drops, leaving the advertiser charged with no ad and no refund.
  // Block the decline; creator must wait for payment or expiration.
  if (ad.status === "pending_payment") {
    return NextResponse.json(
      {
        error:
          "Cannot decline while a payment link is outstanding — the advertiser may be paying right now. Wait for payment to clear or for the Stripe session to expire, then the ad will surface as active or remain pending_payment.",
      },
      { status: 400 },
    );
  }

  // ── LEGACY FLOW: reject + refund for post-payment review ──
  if (ad.status === "pending_review") {
    if (stripe && ad.stripePaymentIntentId) {
      try {
        await stripe.refunds.create({
          payment_intent: ad.stripePaymentIntentId,
          reason: "fraudulent",
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

    await db
      .update(ads)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(ads.id, id));

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

  return NextResponse.json(
    { error: `Cannot reject an ad with status "${ad.status}"` },
    { status: 400 },
  );
}
