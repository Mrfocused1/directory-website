/**
 * POST /api/sites/[siteId]/sync
 *
 * Creator-initiated incremental sync. Enqueues a `site/sync` Inngest
 * event so runSync executes in the background without blocking the
 * request. Rate-limited to 1 per hour per site (plus the Inngest
 * function's concurrency cap) so creators can't hammer the pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { siteSyncLimiter } from "@/lib/rate-limit-middleware";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { siteId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    return NextResponse.json({ error: "Invalid siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Verify the caller owns the site.
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true, isPublished: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  if (!site.isPublished) {
    return NextResponse.json(
      { error: "Your directory is still being built — sync is only available after the initial build finishes." },
      { status: 400 },
    );
  }

  // Per-site rate limit: 1 manual sync per hour.
  const { success, reset } = await siteSyncLimiter.limit(siteId);
  if (!success) {
    const secondsLeft = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    const minutesLeft = Math.ceil(secondsLeft / 60);
    return NextResponse.json(
      {
        error: `Already synced recently. Try again in ~${minutesLeft} min.`,
        reason: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(secondsLeft) } },
    );
  }

  await inngest.send({
    name: "site/sync",
    data: { siteId, source: "manual" },
  });

  return NextResponse.json({ queued: true });
}
