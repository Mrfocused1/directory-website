import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  runPipelineFunction,
  syncPlatformFunction,
  scheduledDigestFunction,
  pruneAnalyticsFunction,
  reconcileStripeFunction,
} from "@/lib/inngest/functions";
import { syncSiteFunction, scheduledSyncFunction } from "@/lib/inngest/site-sync";
import { dailyAuditFunction } from "@/lib/inngest/audit";
import { sweepStuckStatesFunction } from "@/lib/inngest/stuck-states";

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
    syncSiteFunction,
    scheduledSyncFunction,
    dailyAuditFunction,
    sweepStuckStatesFunction,
  ],
});
