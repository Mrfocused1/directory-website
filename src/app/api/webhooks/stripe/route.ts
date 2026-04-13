import { NextRequest, NextResponse } from "next/server";

// POST /api/webhooks/stripe — Handle Stripe webhook events
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // TODO: In production, verify the webhook signature with Stripe
  // const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);

  try {
    const event = JSON.parse(body);

    switch (event.type) {
      case "checkout.session.completed": {
        // User completed checkout — activate their plan
        // const session = event.data.object;
        // await db.update(users).set({ plan: 'starter', stripeCustomerId: session.customer }).where(eq(users.id, session.metadata.userId));
        break;
      }

      case "customer.subscription.updated": {
        // Plan changed — update user's plan
        // const subscription = event.data.object;
        // const planMap = { price_starter: 'starter', price_pro: 'pro', price_agency: 'agency' };
        // await db.update(users).set({ plan: planMap[subscription.items.data[0].price.id] }).where(eq(users.stripeCustomerId, subscription.customer));
        break;
      }

      case "customer.subscription.deleted": {
        // Subscription cancelled — downgrade to free
        // const subscription = event.data.object;
        // await db.update(users).set({ plan: 'free' }).where(eq(users.stripeCustomerId, subscription.customer));
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
