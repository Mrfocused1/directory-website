import { NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineJobs, sites, users } from "@/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { getPlan, hasFeature, type PlanId } from "@/lib/plans";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);

/**
 * GET /api/pipeline/sync-status
 *
 * Reports the caller's sync quota for the current calendar month:
 *   { enabled: boolean, used: number, limit: number, remaining: number }
 *
 * Used by the dashboard to show "X of Y syncs remaining" and to hide
 * the "Sync now" button on free plans. Always returns 200; "enabled:false"
 * tells the UI to show an upgrade prompt instead of the counter.
 */
export async function GET() {
  if (!db) return NextResponse.json({ enabled: false, used: 0, limit: 0, remaining: 0 });

  const user = await getApiUser();
  if (!user) return NextResponse.json({ enabled: false, used: 0, limit: 0, remaining: 0 });

  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { plan: true },
  });
  const planId: PlanId = (VALID_PLANS.has(row?.plan as string) ? row!.plan : "free") as PlanId;
  const plan = getPlan(planId);

  if (!hasFeature(planId, "sync") || plan.monthlySyncs <= 0) {
    return NextResponse.json({
      enabled: false,
      used: 0,
      limit: 0,
      remaining: 0,
      requiredPlan: "creator",
    });
  }

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const userSites = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.userId, user.id));
  const siteIds = userSites.map((s) => s.id);
  if (siteIds.length === 0) {
    return NextResponse.json({
      enabled: true,
      used: 0,
      limit: plan.monthlySyncs,
      remaining: plan.monthlySyncs,
    });
  }

  const jobs = await db
    .select({ id: pipelineJobs.id })
    .from(pipelineJobs)
    .where(
      and(
        inArray(pipelineJobs.siteId, siteIds),
        gte(pipelineJobs.createdAt, start),
        eq(pipelineJobs.step, "scrape"),
      ),
    );
  // Every scrape row in the current month counts (same rule as the
  // retry endpoint). See that route's comment for why we dropped the
  // old -1 subtraction.
  const used = jobs.length;
  return NextResponse.json({
    enabled: true,
    used,
    limit: plan.monthlySyncs,
    remaining: Math.max(0, plan.monthlySyncs - used),
  });
}
