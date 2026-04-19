import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineJobs, sites, users } from "@/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { inngest } from "@/lib/inngest/client";
import { ensureInngestRegistered } from "@/lib/inngest/sync";
import { getPlan, hasFeature, type PlanId } from "@/lib/plans";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);

/**
 * Count how many "Sync now" clicks the user has made this calendar
 * month, across all their sites. A "sync" is any pipeline_jobs row
 * we inserted for one of the user's sites in the current month
 * (this endpoint is the only code path that inserts those rows after
 * the initial build).
 *
 * Month boundary is the UTC first-of-month; resets cleanly for every
 * timezone without leap-day edge cases.
 */
async function countSyncsThisMonth(userId: string): Promise<number> {
  if (!db) return 0;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const userSites = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.userId, userId));
  const siteIds = userSites.map((s) => s.id);
  if (siteIds.length === 0) return 0;

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
  // Every scrape row in the current month counts — including the
  // initial build's row if the site was built this month. The older
  // implementation subtracted 1 to try to ignore the initial-build
  // row, but that only made sense for sites built in the SAME month
  // as the current quota window. For sites built in prior months,
  // there's nothing to subtract and users got an extra "free" sync
  // per month per long-lived site. Treating every row equally is
  // simpler and consistent.
  return jobs.length;
}

/**
 * POST /api/pipeline/retry?siteId=xxx
 *
 * Re-runs the pipeline for a site the caller owns. Useful when
 * scraping or transcription failed transiently (rate-limit, network).
 * Resets any failed jobs to pending and dispatches a fresh Inngest event.
 */
export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    return NextResponse.json({ error: "Invalid siteId format" }, { status: 400 });
  }

  // Ownership check — also pull lastSyncAt so we can enforce a cooldown
  // before spending an Apify scrape call. The cooldown saves ~$0.015 per
  // double-click and doesn't consume the user's monthly quota.
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true, lastSyncAt: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Plan gate + monthly quota. "sync" feature = plan has the button at all;
  // monthlySyncs = how many times it can be clicked per calendar month.
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { plan: true },
  });
  const planId: PlanId = (VALID_PLANS.has(userRow?.plan as string) ? userRow!.plan : "creator") as PlanId;
  const plan = getPlan(planId);
  if (!hasFeature(planId, "sync") || plan.monthlySyncs <= 0) {
    return NextResponse.json(
      {
        error: "Sync is not available on your plan.",
        reason: "plan_feature_missing",
        requiredPlan: "creator",
      },
      { status: 403 },
    );
  }

  // 1-hour cooldown. If the previous sync finished less than 60 minutes
  // ago, return "already up to date" without calling Apify or consuming
  // a quota slot. Instagram rarely adds more than 1 post in that window
  // and every extra scrape is a flat $0.015 against our Apify budget.
  const COOLDOWN_MS = 60 * 60 * 1000;
  const lastSyncMs = site.lastSyncAt ? site.lastSyncAt.getTime() : 0;
  const elapsed = Date.now() - lastSyncMs;
  if (lastSyncMs > 0 && elapsed < COOLDOWN_MS) {
    const minutesUntilNext = Math.ceil((COOLDOWN_MS - elapsed) / 60_000);
    return NextResponse.json({
      ok: true,
      cooldown: true,
      message: "Already up to date — Instagram rarely changes this fast.",
      minutesUntilNext,
      nextAvailableAt: new Date(lastSyncMs + COOLDOWN_MS).toISOString(),
    });
  }

  const used = await countSyncsThisMonth(user.id);
  if (used >= plan.monthlySyncs) {
    return NextResponse.json(
      {
        error: `You've used all ${plan.monthlySyncs} of your monthly syncs. Resets on the 1st of next month.`,
        reason: "quota_exceeded",
        used,
        limit: plan.monthlySyncs,
      },
      { status: 429 },
    );
  }

  // Reset failed jobs so the UI shows "pending" again
  await db.update(pipelineJobs)
    .set({ status: "pending", error: null, progress: 0, message: "Retrying..." })
    .where(and(eq(pipelineJobs.siteId, siteId), eq(pipelineJobs.status, "failed")));

  // Always leave behind a synchronous "queued" row so /dashboard/build
  // has something to render the moment the user lands there. Without
  // this, a sync-now on a site with no prior failed jobs leaves zero
  // rows until Inngest propagates — the UI reads as a dead link.
  const existing = await db.query.pipelineJobs.findFirst({
    where: and(
      eq(pipelineJobs.siteId, siteId),
      eq(pipelineJobs.status, "pending"),
    ),
    columns: { id: true },
  });
  if (!existing) {
    await db.insert(pipelineJobs).values({
      siteId,
      step: "scrape",
      status: "pending",
      progress: 0,
      message: "Queued for sync",
    });
  }

  // Dispatch the pipeline again — the runner is idempotent per-step
  await ensureInngestRegistered(request.nextUrl.origin);
  await inngest.send({ name: "pipeline/run", data: { siteId } });

  return NextResponse.json({ ok: true, message: "Pipeline restarted." });
}
