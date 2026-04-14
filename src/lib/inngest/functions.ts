import { inngest } from "./client";
import { runPipeline } from "@/lib/pipeline/runner";

/**
 * Background function: Run the content pipeline for a new site.
 */
export const runPipelineFunction = inngest.createFunction(
  {
    id: "run-pipeline",
    retries: 1,
    triggers: [{ event: "pipeline/run" }],
  },
  async ({ event }) => {
    const { siteId } = event.data as { siteId: string };
    await runPipeline(siteId);
    return { siteId, status: "completed" };
  },
);

/**
 * Background function: Re-sync a platform connection.
 */
export const syncPlatformFunction = inngest.createFunction(
  {
    id: "sync-platform",
    retries: 1,
    triggers: [{ event: "platform/sync" }],
  },
  async ({ event }) => {
    const { siteId, platform, handle } = event.data as {
      siteId: string;
      platform: "instagram" | "tiktok";
      handle: string;
    };

    const { scrapeProfile } = await import("@/lib/pipeline/scraper");
    const posts = await scrapeProfile({ platform, handle, maxPosts: 50 });
    return { siteId, status: "synced", scraped: posts.length };
  },
);
