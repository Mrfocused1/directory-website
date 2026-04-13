import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/domains/checkout
 *
 * Creates a Stripe Checkout session for a domain purchase.
 * After payment, the Stripe webhook registers the domain via Vercel.
 *
 * Body: { domain: string, price: number (cents), siteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, price, siteId } = body;

    if (!domain || !price || !siteId) {
      return NextResponse.json(
        { error: "Missing domain, price, or siteId" },
        { status: 400 },
      );
    }

    // Create a Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Domain: ${domain}`,
              description: `1 year registration for ${domain}. Includes DNS and SSL setup.`,
            },
            unit_amount: price, // in cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "domain_purchase",
        domain,
        siteId,
        price: String(price),
      },
      success_url: `${request.nextUrl.origin}/dashboard/domains?purchased=${encodeURIComponent(domain)}`,
      cancel_url: `${request.nextUrl.origin}/dashboard/domains?cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
