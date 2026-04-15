import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineJobs, sites } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { inngest } from "@/lib/inngest/client";
import { ensureInngestRegistered } from "@/lib/inngest/sync";

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

  // Ownership check
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

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
