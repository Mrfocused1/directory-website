import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { users, stripeEvents, ads, adSlots, sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/error";
import { resend } from "@/lib/email/resend";
import { invoiceEmail } from "@/lib/email/templates";
import { notifyAdPurchased } from "@/lib/notifications/ad-purchase";

// Plan ID mapping from Stripe price amounts (cents) to plan IDs
const PRICE_TO_PLAN: Record<number, string> = {
  1999: "creator", // £19.99 GBP
  3900: "pro",    // $39 USD
  9900: "agency", // $99 USD
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
    captureError(err, { context: "stripe-webhook-signature" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: insert event.id BEFORE side effects. If it already exists,
  // a unique-violation tells us we've handled it before — return 200 and skip.
  if (db) {
    try {
      await db.insert(stripeEvents).values({
        id: event.id,
        type: event.type,
      });
    } catch (err: unknown) {
      // Only skip on unique constraint violation (PostgreSQL error code 23505).
      // Re-throw on any other DB error so it doesn't silently swallow real failures.
      const pgCode = (err as { code?: string })?.code;
      if (pgCode === "23505") {
        console.log(`[stripe] Event ${event.id} already processed, skipping`);
        return NextResponse.json({ received: true, deduped: true });
      }
      captureError(err, { context: "stripe-webhook-idempotency", eventId: event.id });
      throw err;
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata ?? {};

        // ── Ad purchase ─────────────────────────────────────────────────
        if (session.mode === "payment" && metadata.adPurchase === "1") {
          const paymentIntentId =
            typeof session.payment_intent === "string" ? session.payment_intent : null;
          const slotId = metadata.slotId;
          const siteId = metadata.siteId;

          if (db && paymentIntentId && slotId && siteId) {
            try {
              // Compute dates: 48h review window, then weeks * 7 days campaign
              const weeks = parseInt(metadata.weeks || "1", 10);
              const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
              const endsAt = new Date(startsAt.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
              const amountCents = parseInt(metadata.amountCents || "0", 10);
              const platformFeeCents = parseInt(metadata.platformFeeCents || "0", 10);
              const creatorAmountCents = amountCents - platformFeeCents;

              const [adRow] = await db
                .insert(ads)
                .values({
                  slotId,
                  siteId,
                  advertiserEmail: metadata.advertiserEmail || "",
                  advertiserName: metadata.advertiserName || null,
                  advertiserWebsite: metadata.advertiserWebsite || null,
                  stripePaymentIntentId: paymentIntentId,
                  amountCents,
                  platformFeeCents,
                  creatorAmountCents,
                  status: "pending_review",
                  assetUrl: metadata.assetUrl || null,
                  clickUrl: metadata.clickUrl || null,
                  headline: metadata.headline || null,
                  body: metadata.body || null,
                  startsAt,
                  endsAt,
                })
                .onConflictDoNothing({ target: ads.stripePaymentIntentId })
                .returning();

              // If adRow is undefined, it was a duplicate — already processed
              if (adRow) {
                // Fetch creator email for notification
                const [siteRow] = await db
                  .select({ slug: sites.slug, displayName: sites.displayName, userId: sites.userId })
                  .from(sites)
                  .where(eq(sites.id, siteId))
                  .limit(1);

                const [slotRow] = await db
                  .select({ slotType: adSlots.slotType })
                  .from(adSlots)
                  .where(eq(adSlots.id, slotId))
                  .limit(1);

                const [creatorUser] = siteRow
                  ? await db
                      .select({ email: users.email })
                      .from(users)
                      .where(eq(users.id, siteRow.userId))
                      .limit(1)
                  : [null];

                if (siteRow && creatorUser) {
                  await notifyAdPurchased({
                    adId: adRow.id,
                    siteId,
                    siteSlug: siteRow.slug,
                    siteName: siteRow.displayName || siteRow.slug,
                    creatorEmail: creatorUser.email,
                    advertiserName: metadata.advertiserName || metadata.advertiserEmail || "",
                    advertiserEmail: metadata.advertiserEmail || "",
                    slotName: slotRow?.slotType || metadata.slotType || "Ad slot",
                    amountCents,
                    creatorAmountCents,
                  }).catch((err) =>
                    captureError(err, { context: "stripe-webhook-ad-notify", eventId: event.id }),
                  );
                }
              }
            } catch (adErr) {
              captureError(adErr, { context: "stripe-webhook-ad-insert", eventId: event.id });
              throw adErr; // re-throw so Stripe retries the webhook
            }
          }

          break;
        }

        // ── Plan subscription checkout ───────────────────────────────────
        if (metadata.type === "subscription" && metadata.plan) {
          const plan = metadata.plan;
          const userId = metadata.userId;
          const customerId = typeof session.customer === "string" ? session.customer : null;

          if (db && customerId) {
            // First, try to match by Stripe customer ID (trusted source)
            const existingByCustomer = await db.query.users.findFirst({
              where: eq(users.stripeCustomerId, customerId),
            });

            if (existingByCustomer) {
              // Customer already linked — update their plan + reactivate
              await db.update(users)
                .set({ plan, subscriptionStatus: "active", updatedAt: new Date() })
                .where(eq(users.id, existingByCustomer.id));
            } else if (userId && userId !== "anonymous") {
              // First purchase — link the customer ID to the user
              // Verify the userId exists before trusting metadata
              const userExists = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: { id: true },
              });
              if (userExists) {
                await db.update(users)
                  .set({
                    plan,
                    stripeCustomerId: customerId,
                    subscriptionStatus: "active",
                    updatedAt: new Date(),
                  })
                  .where(eq(users.id, userId));
              }
            }
          }

          console.log(`[SUBSCRIPTION] User ${userId || "unknown"} upgraded to ${plan} (customer: ${customerId})`);

          // Send invoice PDF link by email (non-blocking)
          try {
            const invoiceId = typeof session.invoice === "string" ? session.invoice : null;
            if (resend && stripe && invoiceId) {
              const invoice = await stripe.invoices.retrieve(invoiceId);
              const pdfUrl = invoice.invoice_pdf;
              // Look up user email from DB
              const targetUser = db
                ? await db.query.users.findFirst({
                    where: customerId
                      ? eq(users.stripeCustomerId, customerId)
                      : userId && userId !== "anonymous"
                        ? eq(users.id, userId)
                        : undefined!,
                    columns: { email: true },
                  })
                : null;
              if (pdfUrl && targetUser?.email) {
                const template = invoiceEmail({ invoicePdfUrl: pdfUrl });
                await resend.emails.send({
                  from: "BuildMy.Directory <hello@buildmy.directory>",
                  to: targetUser.email,
                  subject: template.subject,
                  html: template.html,
                });
              }
            }
          } catch (invoiceErr) {
            captureError(invoiceErr, { context: "stripe-invoice-email", eventId: event.id });
          }
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const amount = subscription.items?.data?.[0]?.price?.unit_amount;
        const plan = amount ? PRICE_TO_PLAN[amount] : null;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

        if (plan && customerId && db) {
          await db.update(users)
            .set({ plan, subscriptionStatus: "active", updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, customerId));
        }
        console.log(`[SUBSCRIPTION] Customer ${customerId} plan changed to ${plan} (${event.type})`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

        // Cancellation: flip subscription_status → inactive but keep
        // plan as-is. Their existing directory stays live for readers;
        // the gates on new builds/syncs check subscription_status, so
        // the creator loses self-serve actions until they resubscribe.
        if (customerId && db) {
          await db.update(users)
            .set({ subscriptionStatus: "inactive", updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, customerId));
        }
        console.log(`[SUBSCRIPTION] Customer ${customerId} cancelled — subscription_status → inactive`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        // Flip subscription_status to inactive on the first failed
        // charge. Previously we only logged, which meant a user whose
        // card declined kept full access (and silently accumulated
        // unpaid charges) until Stripe finally fired
        // customer.subscription.deleted — days later. Gating them
        // immediately is the safer default; they can resubscribe by
        // updating payment and letting Stripe retry the invoice.
        if (customerId && db) {
          await db
            .update(users)
            .set({ subscriptionStatus: "inactive", updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, customerId));
        }
        console.warn(`[BILLING] Payment failed for customer ${customerId} — subscription_status → inactive`);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { context: "stripe-webhook-handler", eventType: event.type });
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
