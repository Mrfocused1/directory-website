import { inngest } from "./client";
import { runPipeline } from "@/lib/pipeline/runner";
import { purchaseDomain, addDomainToProject } from "@/lib/vercel-domains";

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

/**
 * Background function: Retry a failed domain registration.
 *
 * Triggered by the Stripe webhook when purchaseDomain or addDomainToProject
 * throws. Inngest will retry with exponential backoff (up to 5 attempts).
 */
export const retryDomainRegistrationFunction = inngest.createFunction(
  {
    id: "retry-domain-registration",
    retries: 5, // up to 5 attempts with built-in exponential backoff
    triggers: [{ event: "domain/register-retry" }],
  },
  async ({ event }) => {
    const { domain } = event.data as { domain: string };

    // These will throw on failure, triggering Inngest's retry
    await purchaseDomain(domain);
    await addDomainToProject(domain);

    return { domain, status: "registered" };
  },
);
