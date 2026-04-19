import { inngest } from "./client";
import { captureError } from "@/lib/error";
import { db } from "@/db";
import { pipelineJobs, ads, customDomains } from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDomainConfig, isConfigured as vercelDomainsConfigured } from "@/lib/vercel-domains";

/**
 * Every 5 minutes: walk the few state machines whose transitions
 * otherwise only fire in response to a user action. Closes "progressive
 * gap" bugs of the shape "X can enter state S but nothing ever leaves
 * it" — pipeline jobs stuck mid-run after the Inngest function crashed,
 * ads never flipping past pending_review because the 48h review window
 * has only read-time effect, ads staying "active" beyond ends_at.
 *
 * Each transition is idempotent — safe to run repeatedly.
 */
export const sweepStuckStatesFunction = inngest.createFunction(
  {
    id: "sweep-stuck-states",
    name: "Sweep stuck state machines",
    retries: 0,
    triggers: [{ cron: "*/5 * * * *" }], // every 5 minutes
  },
  async () => {
    if (!db) return { skipped: "db not configured" };

    const result: Record<string, number> = {};

    // 1. pipeline_jobs: running → failed after 10 min of no progress.
    // The pipeline usually completes each step in under 5 min. Jobs
    // sitting at "running" for 10+ min have almost certainly lost
    // their Vercel container. Flip them to "failed" so the creator
    // can retry.
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const stalePipelines = await db
        .update(pipelineJobs)
        .set({
          status: "failed",
          error: "Pipeline timed out — no progress for 10+ minutes. Retry from the dashboard.",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(pipelineJobs.status, "running"),
            lt(pipelineJobs.startedAt, tenMinAgo),
          ),
        )
        .returning({ id: pipelineJobs.id });
      result.pipelineJobsTimedOut = stalePipelines.length;
    } catch (err) {
      captureError(err, { context: "sweep-stuck-states pipeline" });
      result.pipelineJobsTimedOut = -1;
    }

    // 2. ads: pending_review → active once review window has passed
    // and starts_at is reached. Previously nothing flipped this, so the
    // serve endpoint (filters on status='active') never returned ads
    // whose starts_at had already passed.
    try {
      const activated = await db
        .update(ads)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(ads.status, "pending_review"),
            lt(ads.startsAt, sql`now()`),
          ),
        )
        .returning({ id: ads.id });
      result.adsActivated = activated.length;
    } catch (err) {
      captureError(err, { context: "sweep-stuck-states ads-activate" });
      result.adsActivated = -1;
    }

    // 3. ads: active → expired once ends_at has passed. The serve
    // endpoint already ignores expired ads via date filter but the
    // status column was left lying, breaking earnings reports + the
    // billing-truthfulness audit.
    try {
      const expired = await db
        .update(ads)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(ads.status, "active"),
            lt(ads.endsAt, sql`now()`),
          ),
        )
        .returning({ id: ads.id });
      result.adsExpired = expired.length;
    } catch (err) {
      captureError(err, { context: "sweep-stuck-states ads-expire" });
      result.adsExpired = -1;
    }

    // 4. custom_domains: poll Vercel for verification state on any row
    // still "pending". Previously the only way a domain moved from
    // pending → active was for the creator to manually open the
    // dashboard and refresh. Now we sweep them automatically.
    if (vercelDomainsConfigured()) {
      try {
        const pending = await db
          .select({ id: customDomains.id, domain: customDomains.domain })
          .from(customDomains)
          .where(eq(customDomains.status, "pending"))
          .limit(50); // cap per run to bound API cost

        let verified = 0;
        for (const d of pending) {
          try {
            const config = await getDomainConfig(d.domain);
            if (config?.configured === true) {
              await db
                .update(customDomains)
                .set({
                  status: "active",
                  dnsVerified: true,
                  sslProvisioned: true,
                  updatedAt: new Date(),
                })
                .where(eq(customDomains.id, d.id));
              verified++;
            }
          } catch (perDomainErr) {
            captureError(perDomainErr, { context: "sweep-stuck-states domain", domain: d.domain });
          }
        }
        result.domainsVerified = verified;
        result.domainsChecked = pending.length;
      } catch (err) {
        captureError(err, { context: "sweep-stuck-states domains" });
        result.domainsVerified = -1;
      }
    }

    console.log("[sweep-stuck-states]", result);
    return result;
  },
);
