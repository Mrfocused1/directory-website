import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session so the user can
 * manage, upgrade, downgrade, or cancel their subscription.
 * Returns { url } for the client to redirect to.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { stripeCustomerId: true },
  });

  if (!row?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account. Subscribe to a plan first." },
      { status: 400 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${request.nextUrl.origin}/dashboard/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[billing/portal] error:", message);
    return NextResponse.json({ error: `Portal session failed: ${message}` }, { status: 500 });
  }
}
