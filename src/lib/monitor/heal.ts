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
 * Mark all pipeline_jobs that have been stuck in "running" for more than
 * 30 minutes as "failed" with a timeout message.
 */
export async function cleanupStalePipelines(): Promise<HealResult> {
  if (!db) {
    return { success: false, action: "cleanup-stale-pipelines", detail: "db not available" };
  }

  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const result = await db
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
          lt(pipelineJobs.createdAt, thirtyMinsAgo),
        ),
      )
      .returning({ id: pipelineJobs.id });

    return {
      success: true,
      action: "cleanup-stale-pipelines",
      detail: `Marked ${result.length} stale job(s) as failed`,
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
