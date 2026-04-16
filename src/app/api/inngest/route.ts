import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import {
  runPipelineFunction,
  syncPlatformFunction,
  scheduledDigestFunction,
  pruneAnalyticsFunction,
} from "@/lib/inngest/functions";

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
  ],
});
