import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { users, stripeConnectAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/stripe/onboard
 *
 * Creates a Stripe Connect Express account for the authenticated creator
 * if they don't already have one, then returns a fresh onboarding link URL.
 * Body: {} (empty — all data comes from session)
 * Response: { url: string }
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const origin = request.nextUrl.origin;
  const refreshUrl = `${origin}/dashboard/advertising/setup?refresh=1`;
  const returnUrl = `${origin}/dashboard/advertising/setup?complete=1`;

  try {
    // Check if creator already has a Connect account on record
    const [existing] = await db
      .select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.userId, user.id))
      .limit(1);

    let stripeAccountId: string;

    if (existing) {
      stripeAccountId = existing.stripeAccountId;
    } else {
      // Look up the creator's email from the users table
      const [dbUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: dbUser?.email ?? user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      stripeAccountId = account.id;

      await db.insert(stripeConnectAccounts).values({
        userId: user.id,
        stripeAccountId: account.id,
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
        country: "GB",
      });
    }

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[advertising/stripe/onboard]", message);
    return NextResponse.json({ error: `Failed to create onboarding link: ${message}` }, { status: 500 });
  }
}
