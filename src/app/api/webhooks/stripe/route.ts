import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  purchaseDomain,
  addDomainToProject,
} from "@/lib/vercel-domains";

// Plan ID mapping from Stripe price amounts (cents) to plan IDs
const PRICE_TO_PLAN: Record<number, string> = {
  1900: "creator",
  3900: "pro",
  9900: "agency",
};

// POST /api/webhooks/stripe — Handle Stripe webhook events
export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
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

          try {
            await purchaseDomain(domain);
            await addDomainToProject(domain);
          } catch (domainErr) {
            console.error(`Failed to register domain ${domain}:`, domainErr);
            // TODO: Send alert email to admin, or queue for retry
          }
        }

        // Handle plan subscription checkout
        if (metadata.type === "subscription" && metadata.plan) {
          const plan = metadata.plan;
          const userId = metadata.userId;
          const customerId = typeof session.customer === "string" ? session.customer : null;

          if (db && userId && userId !== "anonymous") {
            await db.update(users)
              .set({ plan, stripeCustomerId: customerId, updatedAt: new Date() })
              .where(eq(users.id, userId));
          }

          console.log(`[SUBSCRIPTION] User ${userId || "unknown"} upgraded to ${plan} (customer: ${customerId})`);
        }

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const metadata = session.metadata ?? {};
        if (metadata.type === "domain_purchase") {
          console.log(`[DOMAIN] Checkout expired for ${metadata.domain}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const amount = subscription.items?.data?.[0]?.price?.unit_amount;
        const plan = amount ? PRICE_TO_PLAN[amount] : null;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

        if (plan && customerId && db) {
          await db.update(users)
            .set({ plan, updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, customerId));
        }
        console.log(`[SUBSCRIPTION] Customer ${customerId} plan changed to ${plan}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

        if (customerId && db) {
          await db.update(users)
            .set({ plan: "free", updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, customerId));
        }
        console.log(`[SUBSCRIPTION] Customer ${customerId} cancelled — downgraded to free`);
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
