import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/** Promo codes that bypass Stripe and grant a plan directly. */
const PROMO_CODES: Record<string, { plan: string }> = {
  INFLUENCER123: { plan: "pro" },
};

/**
 * Plan pricing configuration.
 * In production, these would be pre-created Stripe Price IDs.
 * For now, we create ad-hoc prices via the API.
 */
const PLAN_PRICES: Record<string, { name: string; price: number; currency: string; features: string }> = {
  creator: {
    name: "Creator Plan",
    price: 1999, // £19.99/month in pence
    currency: "gbp",
    features: "Unlimited posts, all platforms, full analytics, newsletter, bookmarks",
  },
  pro: {
    name: "Pro Plan",
    price: 3900, // $39/month in cents
    currency: "usd",
    features: "Everything in Creator + custom domain, SEO, AI insights, remove branding",
  },
  agency: {
    name: "Agency Plan",
    price: 9900, // $99/month in cents
    currency: "usd",
    features: "Everything in Pro + 10 sites, white-label, API access, bulk domains",
  },
};

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for a plan subscription,
 * or applies a promo code to bypass payment entirely.
 * Body: { plan: "creator" | "pro" | "agency", promoCode?: string }
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  try {
    const body = await request.json();
    const { plan, promoCode } = body;

    // ── Promo code: bypass Stripe entirely ──
    if (promoCode) {
      const promo = PROMO_CODES[promoCode.toUpperCase().trim()];
      if (!promo) {
        return NextResponse.json({ error: "Invalid promo code." }, { status: 400 });
      }

      const user = await getApiUser();
      if (!user) {
        return NextResponse.json(
          { error: "Please sign up or sign in first, then apply your promo code." },
          { status: 401 },
        );
      }

      if (!db) {
        return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
      }

      await db.update(users)
        .set({ plan: promo.plan, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return NextResponse.json({
        url: `${request.nextUrl.origin}/onboarding?plan=${promo.plan}&paid=true`,
      });
    }

    // ── Stripe checkout: requires Stripe to be configured ──
    if (!stripe) {
      return NextResponse.json(
        { error: "Checkout is currently unavailable. Please try again later." },
        { status: 500 },
      );
    }

    const user = await getApiUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in before upgrading." },
        { status: 401 },
      );
    }

    const planConfig = PLAN_PRICES[plan];
    if (!planConfig) {
      return NextResponse.json(
        { error: "Invalid plan. Choose: creator, pro, or agency." },
        { status: 400 },
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: planConfig.currency,
            product_data: {
              name: planConfig.name,
              description: planConfig.features,
            },
            unit_amount: planConfig.price,
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "subscription",
        plan,
        userId: user.id,
      },
      success_url: `${request.nextUrl.origin}/onboarding?plan=${plan}&paid=true`,
      cancel_url: `${request.nextUrl.origin}/#pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe subscription checkout error:", message);
    return NextResponse.json(
      { error: `Checkout failed: ${message}` },
      { status: 500 },
    );
  }
}
