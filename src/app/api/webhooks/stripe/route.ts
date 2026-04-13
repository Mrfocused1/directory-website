import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  purchaseDomain,
  addDomainToProject,
} from "@/lib/vercel-domains";

// POST /api/webhooks/stripe — Handle Stripe webhook events
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata ?? {};

        // Handle domain purchase
        if (metadata.type === "domain_purchase" && metadata.domain) {
          const domain = metadata.domain;
          console.log(`Processing domain purchase: ${domain}`);

          try {
            // 1. Register/purchase the domain through Vercel
            await purchaseDomain(domain);
            console.log(`Domain registered: ${domain}`);

            // 2. Add domain to the Vercel project for DNS + SSL
            await addDomainToProject(domain);
            console.log(`Domain added to project: ${domain}`);
          } catch (domainErr) {
            console.error(`Failed to register domain ${domain}:`, domainErr);
            // Domain registration failed after payment — needs manual resolution
            // TODO: Send alert email to admin, or queue for retry
          }
        }

        // Handle plan subscription checkout
        if (metadata.type === "subscription") {
          // const userId = metadata.userId;
          // await db.update(users).set({ plan: metadata.plan, stripeCustomerId: session.customer }).where(eq(users.id, userId));
        }

        break;
      }

      case "checkout.session.expired": {
        // Checkout expired — user didn't complete payment. No action needed.
        const session = event.data.object;
        const metadata = session.metadata ?? {};
        if (metadata.type === "domain_purchase") {
          console.log(`Domain checkout expired: ${metadata.domain}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        // Plan changed
        // const subscription = event.data.object;
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
