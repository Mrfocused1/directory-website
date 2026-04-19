import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { ads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * GET /api/advertising/purchase/session?id=<cs_...>
 *
 * Public. Fetches the state of a completed Checkout session and the
 * resulting ad row. Used by the /{slug}/advertise/success page.
 *
 * Returns: { status, adId?, advertiserEmail?, startsAt?, endsAt? }
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  const sessionId = request.nextUrl.searchParams.get("id");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (session.metadata?.adPurchase !== "1") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: session.payment_status || "pending" });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  if (!paymentIntentId) {
    return NextResponse.json({ status: "paid" });
  }

  // Look up the ad row created by the webhook
  const [ad] = await db
    .select({
      id: ads.id,
      advertiserEmail: ads.advertiserEmail,
      startsAt: ads.startsAt,
      endsAt: ads.endsAt,
      status: ads.status,
    })
    .from(ads)
    .where(eq(ads.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  if (!ad) {
    // Webhook hasn't fired yet — tell the client the payment succeeded
    // but the ad row isn't created yet.
    return NextResponse.json({ status: "paid" });
  }

  return NextResponse.json({
    status: "paid",
    adId: ad.id,
    advertiserEmail: ad.advertiserEmail,
    startsAt: ad.startsAt?.toISOString() ?? null,
    endsAt: ad.endsAt?.toISOString() ?? null,
  });
}
