import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { adSlots, sites, stripeConnectAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";
import { checkRateLimit, adPurchaseLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/purchase
 *
 * Public (no auth). Creates a Stripe Checkout session for an ad purchase.
 *
 * Body:
 *   siteId    — uuid
 *   slotType  — e.g. "banner_top"
 *   weeks     — integer
 *   advertiser — { name, email, website? }
 *   creative  — { headline, body?, clickUrl, assetUrl? }
 *
 * Returns: { url: string } — the Stripe-hosted Checkout URL
 */

export const dynamic = "force-dynamic";

const TEXT_ONLY_SLOTS = new Set(["sticky_ribbon", "promoted_category"]);

export async function POST(request: NextRequest) {
  // Rate limit: 3 per IP per hour
  const rateLimitResponse = await checkRateLimit(request, adPurchaseLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { siteId, slotType, weeks, advertiser, creative } = body as {
    siteId?: string;
    slotType?: string;
    weeks?: number;
    advertiser?: { name?: string; email?: string; website?: string };
    creative?: { headline?: string; body?: string; clickUrl?: string; assetUrl?: string };
  };

  // Input validation
  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  if (!slotType || typeof slotType !== "string") {
    return NextResponse.json({ error: "slotType required" }, { status: 400 });
  }
  if (!weeks || typeof weeks !== "number" || weeks < 1) {
    return NextResponse.json({ error: "weeks must be a positive integer" }, { status: 400 });
  }
  if (!advertiser?.name || !advertiser?.email) {
    return NextResponse.json(
      { error: "advertiser.name and advertiser.email required" },
      { status: 400 },
    );
  }
  if (!creative?.headline) {
    return NextResponse.json({ error: "creative.headline required" }, { status: 400 });
  }
  if (!creative?.clickUrl) {
    return NextResponse.json({ error: "creative.clickUrl required" }, { status: 400 });
  }

  // Basic email sanity check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(advertiser.email)) {
    return NextResponse.json({ error: "advertiser.email is invalid" }, { status: 400 });
  }

  // Check slot type is a known slot and not coming_soon
  const slotDef = SLOT_TYPES.find((s) => s.id === slotType);
  if (!slotDef) {
    return NextResponse.json({ error: "Unknown slot type" }, { status: 400 });
  }
  if (slotDef.status === "coming_soon") {
    return NextResponse.json({ error: "This slot type is not yet available" }, { status: 400 });
  }

  // Fetch site + creator
  const [site] = await db
    .select({ id: sites.id, slug: sites.slug, displayName: sites.displayName, userId: sites.userId, isPublished: sites.isPublished })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.isPublished, true)))
    .limit(1);

  if (!site) {
    return NextResponse.json({ error: "Site not found or not published" }, { status: 404 });
  }

  // Fetch ad slot row
  const [slotRow] = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.siteId, siteId), eq(adSlots.slotType, slotType)))
    .limit(1);

  if (!slotRow || !slotRow.enabled || slotRow.pricePerWeekCents === null) {
    return NextResponse.json(
      { error: "This ad slot is not available for purchase" },
      { status: 404 },
    );
  }

  // Validate weeks bounds
  if (weeks < slotRow.minWeeks || weeks > slotRow.maxWeeks) {
    return NextResponse.json(
      {
        error: `weeks must be between ${slotRow.minWeeks} and ${slotRow.maxWeeks} for this slot`,
      },
      { status: 400 },
    );
  }

  // Validate asset URL required for non-text-only slots
  if (!TEXT_ONLY_SLOTS.has(slotType) && !creative.assetUrl) {
    return NextResponse.json(
      { error: "creative.assetUrl is required for this slot type" },
      { status: 400 },
    );
  }

  // Fetch Stripe Connect account for the creator
  const [connectAccount] = await db
    .select()
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.userId, site.userId))
    .limit(1);

  if (!connectAccount || !connectAccount.chargesEnabled) {
    return NextResponse.json(
      { error: "This directory is not currently accepting ad purchases" },
      { status: 400 },
    );
  }

  // Amount calculation
  const amountCents = (slotRow.pricePerWeekCents ?? 0) * weeks;
  const platformFeeCents = Math.floor(amountCents * 0.1);

  const siteName = site.displayName || site.slug;
  const origin = request.nextUrl.origin;
  const successUrl = `${origin}/${site.slug}/advertise/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/${site.slug}/advertise/cancelled?slotType=${slotType}`;

  // Stripe metadata (all strings)
  const metadata: Record<string, string> = {
    adPurchase: "1",
    siteId,
    slotId: slotRow.id,
    slotType,
    weeks: String(weeks),
    pricePerWeekCents: String(slotRow.pricePerWeekCents),
    amountCents: String(amountCents),
    platformFeeCents: String(platformFeeCents),
    advertiserName: advertiser.name.slice(0, 255),
    advertiserEmail: advertiser.email.slice(0, 255),
    advertiserWebsite: (advertiser.website || "").slice(0, 255),
    headline: creative.headline.slice(0, 255),
    body: (creative.body || "").slice(0, 255),
    clickUrl: creative.clickUrl.slice(0, 255),
    assetUrl: (creative.assetUrl || "").slice(0, 255),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "gbp",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          unit_amount: amountCents,
          product_data: {
            name: `${slotDef.name} on ${siteName} — ${weeks} week${weeks === 1 ? "" : "s"}`,
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: connectAccount.stripeAccountId,
      },
    },
    customer_email: advertiser.email,
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return NextResponse.json({ url: session.url });
}
