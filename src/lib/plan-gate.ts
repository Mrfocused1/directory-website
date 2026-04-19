import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasFeature, type PlanId, type FeatureKey } from "@/lib/plans";

const VALID_PLANS = new Set<PlanId>(["free", "creator", "pro", "agency"]);

/**
 * Server-side plan/subscription gate for API routes. Returns a 403
 * NextResponse to send back to the client when the user isn't entitled,
 * or null to proceed.
 *
 * Use at the top of any paid-feature API handler:
 *   const gate = await gateFeature(user.id, "analytics_basic");
 *   if (gate) return gate;
 *
 * Separately checks that the subscription is active — not just the
 * plan column — so a row that says plan="creator" but has lapsed to
 * subscription_status="inactive" gets rejected.
 */
export async function gateFeature(
  userId: string,
  feature: FeatureKey,
): Promise<NextResponse | null> {
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { plan: true, subscriptionStatus: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const planId: PlanId = VALID_PLANS.has(row.plan as PlanId) ? (row.plan as PlanId) : "creator";

  if (row.subscriptionStatus !== "active" && planId !== "free") {
    return NextResponse.json(
      { error: "Subscription required.", reason: "subscription_inactive", requiredPlan: "creator" },
      { status: 402 },
    );
  }

  if (!hasFeature(planId, feature)) {
    return NextResponse.json(
      { error: "Your plan doesn't include this feature.", reason: "plan_feature_missing", requiredFeature: feature },
      { status: 403 },
    );
  }

  return null;
}
