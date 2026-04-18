/**
 * Inngest function definitions for the 8 automated agents.
 */

import { inngest } from "./client";

// Agent 1: SEO Watchdog — weekly, Sunday 3am UTC
export const seoWatchdogFunction = inngest.createFunction(
  { id: "seo-watchdog", retries: 1, triggers: [{ cron: "0 3 * * 0" }] },
  async () => {
    const { runSeoWatchdog } = await import("@/lib/agents/seo-watchdog");
    return runSeoWatchdog();
  },
);

// Agent 2: Spam Detection — every 2 hours
export const spamDetectionFunction = inngest.createFunction(
  { id: "spam-detection", retries: 1, triggers: [{ cron: "0 */2 * * *" }] },
  async () => {
    const { runSpamDetection } = await import("@/lib/agents/spam-detection");
    return runSpamDetection();
  },
);

// Agent 3: Analytics Insights — weekly, Monday 8am UTC
export const analyticsInsightsFunction = inngest.createFunction(
  { id: "analytics-insights", retries: 1, triggers: [{ cron: "0 8 * * 1" }] },
  async () => {
    const { runAnalyticsInsights } = await import("@/lib/agents/analytics-insights");
    return runAnalyticsInsights();
  },
);

// Agent 4: Broken Link Healer — weekly, Wednesday 4am UTC
export const brokenLinkHealerFunction = inngest.createFunction(
  { id: "broken-link-healer", retries: 1, triggers: [{ cron: "0 4 * * 3" }] },
  async () => {
    const { runBrokenLinkHealer } = await import("@/lib/agents/broken-link-healer");
    return runBrokenLinkHealer();
  },
);

// Agent 5: Post Deduplication — daily, 5am UTC
export const postDedupFunction = inngest.createFunction(
  { id: "post-dedup", retries: 1, triggers: [{ cron: "0 5 * * *" }] },
  async () => {
    const { runPostDedup } = await import("@/lib/agents/post-dedup");
    return runPostDedup();
  },
);

// Agent 6: Storage Cleanup — weekly, Saturday 2am UTC
export const storageCleanupFunction = inngest.createFunction(
  { id: "storage-cleanup", retries: 1, triggers: [{ cron: "0 2 * * 6" }] },
  async () => {
    const { runStorageCleanup } = await import("@/lib/agents/storage-cleanup");
    return runStorageCleanup();
  },
);

// Agent 7: Category Rebalancer — monthly, 1st of month 6am UTC
export const categoryRebalancerFunction = inngest.createFunction(
  { id: "category-rebalancer", retries: 1, triggers: [{ cron: "0 6 1 * *" }] },
  async () => {
    const { runCategoryRebalancer } = await import("@/lib/agents/category-rebalancer");
    return runCategoryRebalancer();
  },
);

// Agent 8: Media Optimizer — daily, 4am UTC
export const mediaOptimizerFunction = inngest.createFunction(
  { id: "media-optimizer", retries: 1, triggers: [{ cron: "0 4 * * *" }] },
  async () => {
    const { runMediaOptimizer } = await import("@/lib/agents/media-optimizer");
    return runMediaOptimizer();
  },
);
