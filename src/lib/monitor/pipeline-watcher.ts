export type PipelineDiagnosis = {
  siteId: string;
  step: string;
  pattern: string;
  autoFixed: boolean;
  action: string | null;
  detail: string;
};

/**
 * Pattern-match a pipeline error message and attempt an automatic fix
 * where possible.
 */
export async function diagnosePipelineFailure(
  siteId: string,
  error: Error,
  step: string,
): Promise<PipelineDiagnosis> {
  const msg = error.message.toLowerCase();

  // ── Pattern: scrape timeout ──────────────────────────────────────────
  if ((msg.includes("timed out") || msg.includes("timeout")) && step === "scrape") {
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({ name: "pipeline/run", data: { siteId } });
      return {
        siteId,
        step,
        pattern: "scrape-timeout",
        autoFixed: true,
        action: "retry-pipeline",
        detail: "Scrape timed out — pipeline/run event sent for retry",
      };
    } catch (retryErr) {
      return {
        siteId,
        step,
        pattern: "scrape-timeout",
        autoFixed: false,
        action: null,
        detail: `Retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
      };
    }
  }

  // ── Pattern: rate limit / 429 ────────────────────────────────────────
  if (msg.includes("rate limit") || msg.includes("429")) {
    try {
      const { inngest } = await import("@/lib/inngest/client");
      // Schedule a retry in ~5 minutes using Inngest's built-in delay
      await inngest.send({
        name: "pipeline/run",
        data: { siteId },
        ts: Date.now() + 5 * 60 * 1000,
      });
      return {
        siteId,
        step,
        pattern: "rate-limit",
        autoFixed: true,
        action: "scheduled-retry-5min",
        detail: "Rate limited — pipeline retry scheduled for 5 minutes from now",
      };
    } catch (schedErr) {
      return {
        siteId,
        step,
        pattern: "rate-limit",
        autoFixed: false,
        action: null,
        detail: `Scheduled retry failed: ${schedErr instanceof Error ? schedErr.message : String(schedErr)}`,
      };
    }
  }

  // ── Pattern: SearXNG / port 8888 ─────────────────────────────────────
  if (msg.includes("searxng") || msg.includes("8888")) {
    try {
      const { restartVpsService } = await import("./heal");
      await restartVpsService("searxng");

      // Retry the pipeline in 2 minutes
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({
        name: "pipeline/run",
        data: { siteId },
        ts: Date.now() + 2 * 60 * 1000,
      });
      return {
        siteId,
        step,
        pattern: "searxng-error",
        autoFixed: true,
        action: "restart-searxng+retry-2min",
        detail: "SearXNG restarted; pipeline retry scheduled for 2 minutes from now",
      };
    } catch (fixErr) {
      return {
        siteId,
        step,
        pattern: "searxng-error",
        autoFixed: false,
        action: null,
        detail: `SearXNG restart/retry failed: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`,
      };
    }
  }

  // ── Pattern: upload / blob ────────────────────────────────────────────
  if (msg.includes("upload") || msg.includes("blob")) {
    try {
      const { inngest } = await import("@/lib/inngest/client");
      await inngest.send({ name: "pipeline/run", data: { siteId } });
      return {
        siteId,
        step,
        pattern: "upload-blob-error",
        autoFixed: true,
        action: "retry-pipeline",
        detail: "Blob/upload error — pipeline/run event sent for retry",
      };
    } catch (retryErr) {
      return {
        siteId,
        step,
        pattern: "upload-blob-error",
        autoFixed: false,
        action: null,
        detail: `Retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
      };
    }
  }

  // ── Default: log and return diagnosis, no auto action ────────────────
  console.warn(
    `[pipeline-watcher] Unrecognized error pattern for site ${siteId} at step "${step}": ${error.message}`,
  );
  return {
    siteId,
    step,
    pattern: "unknown",
    autoFixed: false,
    action: null,
    detail: `No auto-fix for: ${error.message}`,
  };
}
