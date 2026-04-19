import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adSlots, sites, stripeConnectAccounts, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";
import { checkRateLimit, adPurchaseLimiter } from "@/lib/rate-limit-middleware";
import { notifyAdRequested } from "@/lib/notifications/ad-purchase";
import { captureError } from "@/lib/error";

/**
 * POST /api/advertising/requests
 *
 * Public (no auth). Records an advertiser's pre-payment request.
 * The creator reviews the creative first, and only on approval does
 * the advertiser receive a Stripe Checkout link by email. Status
 * lifecycle:
 *
 *   pending_approval -> pending_payment -> active
 *                    -> rejected (no refund)
 */
export const dynamic = "force-dynamic";

const TEXT_ONLY_SLOTS = new Set(["sticky_ribbon", "promoted_category"]);

export async function POST(request: NextRequest) {
  const rateLimited = await checkRateLimit(request, adPurchaseLimiter);
  if (rateLimited) return rateLimited;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

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
    return NextResponse.json({ error: "advertiser.name and advertiser.email required" }, { status: 400 });
  }
  if (!creative?.headline) {
    return NextResponse.json({ error: "creative.headline required" }, { status: 400 });
  }
  if (!creative?.clickUrl) {
    return NextResponse.json({ error: "creative.clickUrl required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(advertiser.email)) {
    return NextResponse.json({ error: "advertiser.email is invalid" }, { status: 400 });
  }

  const slotDef = SLOT_TYPES.find((s) => s.id === slotType);
  if (!slotDef) return NextResponse.json({ error: "Unknown slot type" }, { status: 400 });
  if (slotDef.status === "coming_soon") {
    return NextResponse.json({ error: "This slot type is not yet available" }, { status: 400 });
  }

  const [site] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      displayName: sites.displayName,
      userId: sites.userId,
    })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.isPublished, true)))
    .limit(1);
  if (!site) return NextResponse.json({ error: "Site not found or not published" }, { status: 404 });

  const [slotRow] = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.siteId, siteId), eq(adSlots.slotType, slotType)))
    .limit(1);
  if (!slotRow || !slotRow.enabled || slotRow.pricePerWeekCents === null) {
    return NextResponse.json({ error: "This ad slot is not available" }, { status: 404 });
  }
  if (weeks < slotRow.minWeeks || weeks > slotRow.maxWeeks) {
    return NextResponse.json(
      { error: `weeks must be between ${slotRow.minWeeks} and ${slotRow.maxWeeks} for this slot` },
      { status: 400 },
    );
  }
  if (!TEXT_ONLY_SLOTS.has(slotType) && !creative.assetUrl) {
    return NextResponse.json(
      { error: "creative.assetUrl is required for this slot type" },
      { status: 400 },
    );
  }

  const [connectAccount] = await db
    .select({ chargesEnabled: stripeConnectAccounts.chargesEnabled })
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.userId, site.userId))
    .limit(1);
  if (!connectAccount || !connectAccount.chargesEnabled) {
    return NextResponse.json(
      { error: "This directory is not currently accepting ad requests" },
      { status: 400 },
    );
  }

  const amountCents = (slotRow.pricePerWeekCents ?? 0) * weeks;
  const platformFeeCents = Math.floor(amountCents * 0.1);
  const creatorAmountCents = amountCents - platformFeeCents;

  const [adRow] = await db
    .insert(ads)
    .values({
      slotId: slotRow.id,
      siteId,
      advertiserEmail: advertiser.email.slice(0, 320),
      advertiserName: advertiser.name.slice(0, 255),
      advertiserWebsite: advertiser.website?.slice(0, 255) ?? null,
      amountCents,
      platformFeeCents,
      creatorAmountCents,
      status: "pending_approval",
      assetUrl: creative.assetUrl ?? null,
      clickUrl: creative.clickUrl.slice(0, 2048),
      headline: creative.headline.slice(0, 255),
      body: creative.body ? creative.body.slice(0, 500) : null,
    })
    .returning({ id: ads.id });

  try {
    const [creator] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, site.userId))
      .limit(1);
    if (creator?.email) {
      await notifyAdRequested({
        siteName: site.displayName || site.slug,
        creatorEmail: creator.email,
        advertiserName: advertiser.name,
        advertiserEmail: advertiser.email,
        advertiserWebsite: advertiser.website ?? null,
        slotName: slotDef.name,
        amountCents,
        creatorAmountCents,
        weeks,
      });
    }
  } catch (e) {
    captureError(e, { context: "ad-request-notify", adId: adRow.id });
  }

  return NextResponse.json({ ok: true, adId: adRow.id });
}
