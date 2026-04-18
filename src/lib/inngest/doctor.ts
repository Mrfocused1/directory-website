/**
 * Inngest cron: Site Doctor — runs every 6 hours.
 *
 * Calls the VPS /doctor endpoint and emails admins if issues are found.
 */

import { inngest } from "./client";
import { resend } from "@/lib/email/resend";
import { doctorReportEmail } from "@/lib/email/templates";
import type { DoctorReport } from "@/lib/doctor/types";

function getVpsDoctorUrl(): string | null {
  const raw = process.env.SCRAPER_VPS_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.port = "3003";
    u.pathname = "/doctor";
    return u.toString();
  } catch {
    return null;
  }
}

function getDoctorApiKey(): string | null {
  return process.env.DOCTOR_API_KEY || process.env.SCRAPER_API_KEY || null;
}

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export const doctorCheckFunction = inngest.createFunction(
  {
    id: "doctor-check",
    retries: 1,
    timeouts: { finish: "600s" },
    triggers: [{ cron: "0 */6 * * *" }], // every 6 hours
  },
  async () => {
    const doctorUrl = getVpsDoctorUrl();
    if (!doctorUrl) {
      console.warn("[doctor-check] SCRAPER_VPS_URL not set — skipping");
      return { skipped: "SCRAPER_VPS_URL not configured" };
    }

    const apiKey = getDoctorApiKey();
    if (!apiKey) {
      console.warn("[doctor-check] no API key configured — skipping");
      return { skipped: "DOCTOR_API_KEY / SCRAPER_API_KEY not configured" };
    }

    // Call the VPS doctor (give it up to 9 minutes; Inngest timeout is 10)
    let report: DoctorReport;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 540_000); // 9 min
      let res: Response;
      try {
        res = await fetch(doctorUrl, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "content-type": "application/json",
          },
          body: "{}",
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`VPS doctor HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      report = (await res.json()) as DoctorReport;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[doctor-check] VPS call failed:", msg);
      return { error: msg };
    }

    console.log(
      `[doctor-check] done — sites=${report.sitesInspected} issues=${report.issues.length} fixes=${report.fixes.length} flagged=${report.flagged.length}`,
    );

    // Email admins only when there is something to report
    const hasActivity =
      report.issues.length > 0 || report.fixes.length > 0 || report.flagged.length > 0;

    if (hasActivity && resend) {
      const adminEmails = getAdminEmails();
      if (adminEmails.length > 0) {
        const template = doctorReportEmail(report);
        try {
          await resend.emails.send({
            from: "BuildMy.Directory <hello@buildmy.directory>",
            to: adminEmails,
            subject: template.subject,
            html: template.html,
          });
        } catch (emailErr) {
          console.error("[doctor-check] failed to send notification email:", emailErr);
        }
      }
    }

    return {
      sitesInspected: report.sitesInspected,
      issues: report.issues.length,
      fixes: report.fixes.length,
      flagged: report.flagged.length,
    };
  },
);
