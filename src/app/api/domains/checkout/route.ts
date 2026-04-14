import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getDomainPrice } from "@/lib/vercel-domains";

/**
 * POST /api/domains/checkout
 *
 * Creates a Stripe Checkout session for a domain purchase.
 * Price is looked up server-side via Vercel API — never trust the client.
 *
 * Body: { domain: string, siteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, siteId } = body;

    if (!domain || !siteId) {
      return NextResponse.json(
        { error: "Missing domain or siteId" },
        { status: 400 },
      );
    }

    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500 },
      );
    }

    // Look up the real price server-side
    const pricing = await getDomainPrice(domain);
    if (!pricing.price || pricing.price <= 0) {
      return NextResponse.json(
        { error: "Could not determine price for this domain" },
        { status: 400 },
      );
    }

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
            unit_amount: pricing.price,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "domain_purchase",
        domain,
        siteId,
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
