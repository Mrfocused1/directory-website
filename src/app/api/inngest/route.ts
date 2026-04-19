import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  runPipelineFunction,
  syncPlatformFunction,
  scheduledDigestFunction,
  pruneAnalyticsFunction,
  reconcileStripeFunction,
  monitorHealthFunction,
} from "@/lib/inngest/functions";
import { doctorCheckFunction } from "@/lib/inngest/doctor";
import { sessionCheckFunction } from "@/lib/inngest/session-check";
import { syncSiteFunction, scheduledSyncFunction } from "@/lib/inngest/site-sync";
import {
  seoWatchdogFunction,
  spamDetectionFunction,
  analyticsInsightsFunction,
  brokenLinkHealerFunction,
  postDedupFunction,
  storageCleanupFunction,
  categoryRebalancerFunction,
  mediaOptimizerFunction,
} from "@/lib/inngest/agents";

// Pipeline can take several minutes. Vercel Pro max is 300 seconds.
// For longer pipelines, consider splitting into Inngest step.run() calls.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runPipelineFunction,
    syncPlatformFunction,
    scheduledDigestFunction,
    pruneAnalyticsFunction,
    reconcileStripeFunction,
    monitorHealthFunction,
    doctorCheckFunction,
    sessionCheckFunction,
    syncSiteFunction,
    scheduledSyncFunction,
    seoWatchdogFunction,
    spamDetectionFunction,
    analyticsInsightsFunction,
    brokenLinkHealerFunction,
    postDedupFunction,
    storageCleanupFunction,
    categoryRebalancerFunction,
    mediaOptimizerFunction,
  ],
});
