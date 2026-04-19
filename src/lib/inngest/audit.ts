import { inngest } from "./client";
import { captureError } from "@/lib/error";
import { runAllDbAudits, type AuditResult } from "@/lib/audits/db-audits";
import { sendTelegramMessage } from "@/lib/notifications/telegram";

function formatDigest(results: AuditResult[]): { summary: string; body: string; alarming: boolean } {
  const totalFails = results.reduce((a, r) => a + r.fails, 0);
  const totalWarns = results.reduce((a, r) => a + r.warns, 0);
  const alarming = totalFails > 0;
  const header = alarming
    ? `🚨 *Audit FAIL* — ${totalFails} fail, ${totalWarns} warn across ${results.length} checks`
    : totalWarns > 0
      ? `⚠️ *Audit warnings* — ${totalWarns} across ${results.length} checks`
      : `✅ *Audit clean* — ${results.length} checks passed`;

  const lines: string[] = [header, ""];
  for (const r of results) {
    if (r.fails === 0 && r.warns === 0) continue;
    const icon = r.fails > 0 ? "🔴" : "🟡";
    lines.push(`${icon} *${r.name}*`);
    for (const f of r.findings) {
      if (f.level === "info") continue;
      const bullet = f.level === "fail" ? "  ✗" : "  ·";
      lines.push(`${bullet} ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
    }
    lines.push("");
  }

  const mrr = results.find((r) => r.name === "mrr_meter")?.findings.find((f) => f.label === "MRR")?.detail;
  const fill = results.find((r) => r.name === "ad_fill_rate")?.findings.find((f) => f.label === "ad fill rate")?.detail;
  if (mrr || fill) {
    lines.push(`_MRR: ${mrr ?? "n/a"} · Ad fill: ${fill ?? "n/a"}_`);
  }

  return { summary: header, body: lines.join("\n"), alarming };
}

export const dailyAuditFunction = inngest.createFunction(
  {
    id: "daily-audit",
    name: "Daily DB audit + Telegram alert",
    retries: 0,
    triggers: [{ cron: "0 5 * * *" }], // 05:00 UTC daily
  },
  async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("[audit] DATABASE_URL not set, skipping");
      return { skipped: true };
    }

    let results: AuditResult[] = [];
    try {
      results = await runAllDbAudits(process.env.DATABASE_URL);
    } catch (err) {
      captureError(err, { context: "daily-audit-run" });
      await sendTelegramMessage(`🚨 Daily audit crashed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    const digest = formatDigest(results);
    console.log(digest.body);

    // Telegram on fail OR warn. If everything's clean, stay silent.
    if (digest.alarming || results.some((r) => r.warns > 0)) {
      await sendTelegramMessage(digest.body.slice(0, 3800)); // Telegram cap
    }

    return {
      checks: results.length,
      fails: results.reduce((a, r) => a + r.fails, 0),
      warns: results.reduce((a, r) => a + r.warns, 0),
    };
  },
);
