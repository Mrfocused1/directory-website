export { runAllChecks } from "./checks";
export { restartVpsService, cleanupStalePipelines, retryPipeline } from "./heal";
export { sendMonitorAlert } from "./notify";
export type { ServiceName, ServiceStatus, Severity, HealResult, ServiceCheck, HealthReport } from "./types";

import { runAllChecks } from "./checks";
import { restartVpsService, cleanupStalePipelines } from "./heal";
import { sendMonitorAlert } from "./notify";
import type { HealResult } from "./types";

/** VPS-managed services that can be restarted via /admin/restart */
const VPS_SERVICES = ["scraper", "piper", "searxng", "libretranslate"] as const;
type VpsService = (typeof VPS_SERVICES)[number];

/**
 * Run a full monitor cycle:
 *  1. Check all services
 *  2. Attempt self-healing for any "down" VPS services
 *  3. Clean up stale pipelines if the pipeline check is unhealthy
 *  4. Send alert email if overall health is not "ok"
 */
export async function runMonitorCycle() {
  const report = await runAllChecks();
  const healResults: HealResult[] = [];

  for (const svc of report.services.filter((s) => s.status === "down")) {
    if ((VPS_SERVICES as readonly string[]).includes(svc.service)) {
      healResults.push(await restartVpsService(svc.service as VpsService));
    }
  }

  // Cleanup stale pipelines
  const stale = report.services.find((s) => s.service === "pipeline");
  if (stale?.status !== "ok") {
    healResults.push(await cleanupStalePipelines());
  }

  // Notify if problems
  if (report.overall !== "ok") {
    await sendMonitorAlert({
      severity: report.overall === "down" ? "critical" : "warning",
      services: report.services,
      healActions: healResults,
    });
  }

  return { report, healResults };
}
