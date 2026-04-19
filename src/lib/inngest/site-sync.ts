/**
 * Inngest functions that drive the creator-facing incremental sync.
 *
 * - syncSiteFunction: handles `site/sync` events, one per site. Fired
 *   by the "Sync now" button and by the scheduled cron.
 * - scheduledSyncFunction: daily cron that enumerates every published
 *   site and fires `site/sync` events for each. Creator directories
 *   stay fresh without anyone having to click anything.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSync } from "@/lib/pipeline/sync";

export const syncSiteFunction = inngest.createFunction(
  {
    id: "sync-site",
    retries: 1,
    // Keep concurrency modest — each sync does ~1-3 uploads + Claude
    // calls. 4 concurrent is well within R2/Supabase/Anthropic limits.
    concurrency: { limit: 4 },
    triggers: [{ event: "site/sync" }],
  },
  async ({ event }) => {
    const { siteId } = event.data as { siteId: string };
    const result = await runSync(siteId);
    return { siteId, ...result };
  },
);

export const scheduledSyncFunction = inngest.createFunction(
  {
    id: "scheduled-sync",
    retries: 0, // a single site fail shouldn't retry-cascade the whole cron
    triggers: [{ cron: "0 9 * * *" }], // 09:00 UTC daily (same slot as digest)
  },
  async ({ step }) => {
    if (!db) return { skipped: "db not configured" };

    // Fan out one sync event per published site. Inngest's concurrency
    // cap on syncSiteFunction (limit: 4) controls how many run at once.
    const published = await db.query.sites.findMany({
      where: eq(sites.isPublished, true),
      columns: { id: true, slug: true },
    });

    if (published.length === 0) return { enqueued: 0 };

    await step.sendEvent(
      "fan-out-sync-events",
      published.map((s) => ({
        name: "site/sync",
        data: { siteId: s.id, source: "scheduled-daily" },
      })),
    );

    return { enqueued: published.length };
  },
);
