import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { hasFeature, type PlanId, type FeatureKey } from "@/lib/plans";

const VALID_PLANS = new Set<PlanId>(["free", "creator", "pro", "agency"]);

/**
 * Server-side feature gate for dashboard layouts. Redirects to the
 * account page with the relevant feature highlighted if the user's
 * plan doesn't include the feature.
 *
 * Use at the top of a per-feature dashboard layout:
 *   await requireFeature("newsletter");
 *
 * The outer /dashboard/layout.tsx already handles auth + subscription_
 * status, so if we're here we're logged in and actively subscribed.
 * This layer only asks "does the plan include this specific feature?".
 */
export async function requireFeature(feature: FeatureKey): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !db) {
    redirect("/login");
  }

  const row = await db.query.users.findFirst({
    where: eq(users.id, data.user.id),
    columns: { plan: true },
  });

  const planId: PlanId = VALID_PLANS.has(row?.plan as PlanId) ? (row!.plan as PlanId) : "creator";

  if (!hasFeature(planId, feature)) {
    redirect(`/dashboard/account#plan`);
  }
}
