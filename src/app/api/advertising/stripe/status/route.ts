import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { stripeConnectAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/advertising/stripe/status
 *
 * Returns the creator's Stripe Connect status. If onboarding isn't finished,
 * includes a fresh account link so the dashboard can surface a re-entry CTA.
 * Response: { hasAccount, payoutsEnabled, chargesEnabled, detailsSubmitted, onboardingUrl? }
 */
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const [existing] = await db
    .select()
    .from(stripeConnectAccounts)
    .where(eq(stripeConnectAccounts.userId, user.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({
      hasAccount: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
    });
  }

  // Sync the latest state from Stripe so we always serve fresh data
  let payoutsEnabled = existing.payoutsEnabled;
  let chargesEnabled = existing.chargesEnabled;
  let detailsSubmitted = existing.detailsSubmitted;

  if (stripe) {
    try {
      const account = await stripe.accounts.retrieve(existing.stripeAccountId);
      payoutsEnabled = account.payouts_enabled ?? false;
      chargesEnabled = account.charges_enabled ?? false;
      detailsSubmitted = account.details_submitted ?? false;

      // Persist refreshed state if anything changed
      if (
        payoutsEnabled !== existing.payoutsEnabled ||
        chargesEnabled !== existing.chargesEnabled ||
        detailsSubmitted !== existing.detailsSubmitted
      ) {
        await db
          .update(stripeConnectAccounts)
          .set({ payoutsEnabled, chargesEnabled, detailsSubmitted, updatedAt: new Date() })
          .where(eq(stripeConnectAccounts.id, existing.id));
      }
    } catch (err) {
      // Non-fatal: fall back to cached values from DB
      console.warn("[advertising/stripe/status] Stripe account retrieve failed:", err instanceof Error ? err.message : err);
    }
  }

  // If onboarding is not finished, include a fresh link so the UI can surface it
  let onboardingUrl: string | undefined;
  if (!detailsSubmitted && stripe) {
    try {
      const origin = request.nextUrl.origin;
      const link = await stripe.accountLinks.create({
        account: existing.stripeAccountId,
        refresh_url: `${origin}/dashboard/advertising/setup?refresh=1`,
        return_url: `${origin}/dashboard/advertising/setup?complete=1`,
        type: "account_onboarding",
      });
      onboardingUrl = link.url;
    } catch (err) {
      console.warn("[advertising/stripe/status] Could not create account link:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    hasAccount: true,
    payoutsEnabled,
    chargesEnabled,
    detailsSubmitted,
    ...(onboardingUrl ? { onboardingUrl } : {}),
  });
}
