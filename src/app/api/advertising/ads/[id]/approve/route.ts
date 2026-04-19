import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { ads, adSlots, sites, stripeConnectAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";
import {
  notifyAdApproved,
  notifyAdApprovedPayment,
} from "@/lib/notifications/ad-purchase";
import { captureError } from "@/lib/error";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/ads/[id]/approve
 *
 * Authenticated (creator only).
 *
 * ── NEW FLOW (pending_approval) ─────────────────────────────────────
 * Creates a Stripe Checkout session, emails the advertiser the link,
 * and flips the ad to pending_payment. The webhook promotes it to
 * active once payment clears.
 *
 * ── LEGACY FLOW (pending_review) ────────────────────────────────────
 * Old behavior for ads paid before review: flips pending_review →
 * active and notifies the advertiser.
 */
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://buildmy.directory";

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

  const [ad] = await db
    .select({
      id: ads.id,
      siteId: ads.siteId,
      slotId: ads.slotId,
      status: ads.status,
      advertiserEmail: ads.advertiserEmail,
      advertiserName: ads.advertiserName,
      amountCents: ads.amountCents,
      platformFeeCents: ads.platformFeeCents,
      startsAt: ads.startsAt,
      endsAt: ads.endsAt,
    })
    .from(ads)
    .where(eq(ads.id, id))
    .limit(1);

  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

  const [site] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      displayName: sites.displayName,
      userId: sites.userId,
    })
    .from(sites)
    .where(and(eq(sites.id, ad.siteId), eq(sites.userId, user.id)))
    .limit(1);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── NEW FLOW: pending_approval → pending_payment ──
  if (ad.status === "pending_approval") {
    if (!stripe) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const [slotRow] = await db
      .select({
        id: adSlots.id,
        slotType: adSlots.slotType,
        pricePerWeekCents: adSlots.pricePerWeekCents,
      })
      .from(adSlots)
      .where(eq(adSlots.id, ad.slotId))
      .limit(1);
    if (!slotRow) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

    const [connectAccount] = await db
      .select({
        stripeAccountId: stripeConnectAccounts.stripeAccountId,
        chargesEnabled: stripeConnectAccounts.chargesEnabled,
      })
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.userId, site.userId))
      .limit(1);
    if (!connectAccount?.chargesEnabled) {
      return NextResponse.json(
        { error: "Your Stripe Connect account is not active. Complete onboarding before approving ads." },
        { status: 400 },
      );
    }

    const pricePerWeek = slotRow.pricePerWeekCents ?? 0;
    if (pricePerWeek <= 0 || ad.amountCents % pricePerWeek !== 0) {
      return NextResponse.json(
        { error: "Slot pricing has changed since the request was sent. Ask the advertiser to resubmit." },
        { status: 400 },
      );
    }
    const weeks = ad.amountCents / pricePerWeek;

    const slotDef = SLOT_TYPES.find((s) => s.id === slotRow.slotType);
    const slotName = slotDef?.name || slotRow.slotType;
    const siteName = site.displayName || site.slug;

    const successUrl = `${SITE_URL}/${site.slug}/advertise/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${SITE_URL}/${site.slug}/advertise/cancelled?slotType=${slotRow.slotType}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "gbp",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: ad.amountCents,
            product_data: {
              name: `${slotName} on ${siteName} — ${weeks} week${weeks === 1 ? "" : "s"}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: ad.platformFeeCents,
        transfer_data: { destination: connectAccount.stripeAccountId },
      },
      customer_email: ad.advertiserEmail,
      metadata: {
        adPurchase: "1",
        adId: ad.id,
        siteId: site.id,
        slotId: slotRow.id,
        slotType: slotRow.slotType,
        weeks: String(weeks),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await db
      .update(ads)
      .set({ status: "pending_payment", updatedAt: new Date() })
      .where(eq(ads.id, id));

    try {
      if (session.url) {
        await notifyAdApprovedPayment({
          advertiserName: ad.advertiserName || ad.advertiserEmail,
          advertiserEmail: ad.advertiserEmail,
          siteName,
          slotName,
          amountCents: ad.amountCents,
          weeks,
          checkoutUrl: session.url,
        });
      }
    } catch (err) {
      captureError(err, { context: "ad-approve-request-email", adId: id });
    }

    return NextResponse.json({
      ok: true,
      status: "pending_payment",
      checkoutUrl: session.url,
    });
  }

  // ── LEGACY FLOW: pending_review → active ──
  if (ad.status === "pending_review") {
    await db
      .update(ads)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(ads.id, id));

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

  return NextResponse.json(
    { error: `Cannot approve an ad with status "${ad.status}"` },
    { status: 400 },
  );
}
