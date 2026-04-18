import { db } from "@/db";
import { pipelineJobs } from "@/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import type { HealResult, ServiceName } from "./types";

/** Services that the VPS /admin/restart endpoint knows how to restart */
type VpsService = Extract<ServiceName, "scraper" | "piper" | "searxng" | "libretranslate">;

/**
 * POST to the VPS scraper /admin/restart endpoint to restart a managed service.
 * The X-Api-Key header reuses the same key the scraper already uses for auth.
 */
export async function restartVpsService(service: VpsService): Promise<HealResult> {
  const vpsUrl = process.env.SCRAPER_VPS_URL;
  const apiKey = process.env.VPS_API_KEY || process.env.SCRAPER_API_KEY || "";

  if (!vpsUrl) {
    return { success: false, action: `restart:${service}`, detail: "SCRAPER_VPS_URL not set" };
  }

  try {
    const res = await fetch(`${vpsUrl}/admin/restart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ service }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (res.ok) {
      return { success: true, action: `restart:${service}`, detail: text };
    }
    return { success: false, action: `restart:${service}`, detail: `HTTP ${res.status}: ${text}` };
  } catch (err) {
    return {
      success: false,
      action: `restart:${service}`,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Mark pipeline_jobs stuck in "running" as "failed". Two thresholds:
 *   - 10 min if progress=0 (Vercel killed us before any work landed)
 *   - 30 min otherwise (slow job that's still plausibly making progress)
 *
 * After cleanup we fire a pipeline/run event for each affected site so
 * the UI doesn't just show "timed out" — it transparently retries.
 * The runner's idempotent sync logic means a retry just picks up where
 * the last run died rather than re-doing completed work.
 */
export async function cleanupStalePipelines(): Promise<HealResult> {
  if (!db) {
    return { success: false, action: "cleanup-stale-pipelines", detail: "db not available" };
  }

  try {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Jobs stuck at progress=0 for 10+ min are almost certainly dead
    // (Vercel function killed before the first progress update). Jobs
    // past 30 min are slow-or-dead regardless of progress.
    const stuckAtZero = await db
      .update(pipelineJobs)
      .set({
        status: "failed",
        message: "Timed out",
        error: "Timed out — cleaned up by monitor (killed at start)",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(pipelineJobs.status, "running"),
          lt(pipelineJobs.startedAt, tenMinsAgo),
          eq(pipelineJobs.progress, 0),
        ),
      )
      .returning({ id: pipelineJobs.id, siteId: pipelineJobs.siteId });

    const stuckMidway = await db
      .update(pipelineJobs)
      .set({
        status: "failed",
        message: "Timed out",
        error: "Timed out — cleaned up by monitor",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(pipelineJobs.status, "running"),
          lt(pipelineJobs.startedAt, thirtyMinsAgo),
        ),
      )
      .returning({ id: pipelineJobs.id, siteId: pipelineJobs.siteId });

    const affected = [...stuckAtZero, ...stuckMidway];
    const uniqueSites = Array.from(new Set(affected.map((r) => r.siteId)));

    // Auto-retry: fire pipeline/run for each affected site so the user
    // doesn't just see a dead pipeline. Runner skips already-completed
    // steps so this picks up where the last run died.
    if (uniqueSites.length > 0) {
      try {
        const { inngest } = await import("@/lib/inngest/client");
        for (const siteId of uniqueSites) {
          await inngest.send({ name: "pipeline/run", data: { siteId } });
        }
      } catch (retryErr) {
        console.warn(
          "[monitor] auto-retry failed:",
          retryErr instanceof Error ? retryErr.message : retryErr,
        );
      }
    }

    return {
      success: true,
      action: "cleanup-stale-pipelines",
      detail: `Cleaned ${affected.length} stale job(s) across ${uniqueSites.length} site(s); retry events sent`,
    };
  } catch (err) {
    return {
      success: false,
      action: "cleanup-stale-pipelines",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Send a pipeline/run event via Inngest to retry a site's pipeline */
export async function retryPipeline(siteId: string): Promise<HealResult> {
  try {
    const { inngest } = await import("@/lib/inngest/client");
    await inngest.send({ name: "pipeline/run", data: { siteId } });
    return { success: true, action: `retry-pipeline:${siteId}`, detail: "pipeline/run event sent" };
  } catch (err) {
    return {
      success: false,
      action: `retry-pipeline:${siteId}`,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
