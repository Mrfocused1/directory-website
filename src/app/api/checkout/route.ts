import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getApiUser } from "@/lib/supabase/api";

/**
 * Plan pricing configuration.
 * In production, these would be pre-created Stripe Price IDs.
 * For now, we create ad-hoc prices via the API.
 */
const PLAN_PRICES: Record<string, { name: string; price: number; features: string }> = {
  creator: {
    name: "Creator Plan",
    price: 1900, // $19/month in cents
    features: "Unlimited posts, all platforms, full analytics, newsletter, request board, bookmarks",
  },
  pro: {
    name: "Pro Plan",
    price: 3900, // $39/month in cents
    features: "Everything in Creator + custom domain, SEO, AI insights, remove branding",
  },
  agency: {
    name: "Agency Plan",
    price: 9900, // $99/month in cents
    features: "Everything in Pro + 10 sites, white-label, API access, bulk domains",
  },
};

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for a plan subscription.
 * Body: { plan: "creator" | "pro" | "agency" }
 */
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Checkout is currently unavailable. Please try again later." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { plan } = body;

    const user = await getApiUser();
    const userId = user?.id || null;

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
            currency: "usd",
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
        userId: userId || "anonymous",
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
