/**
 * POST /api/doctor/trigger
 *
 * Calls the VPS Site Doctor, waits for the report, sends a notification
 * email to admins, and returns the report JSON.
 *
 * Auth: must be a logged-in admin (ADMIN_EMAILS env var).
 * Timeout: Vercel Pro allows up to 300s — the doctor run can be long.
 */

import { requireAdmin } from "@/lib/admin";
import { resend } from "@/lib/email/resend";
import { doctorReportEmail } from "@/lib/email/templates";
import type { DoctorReport } from "@/lib/doctor/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getVpsDoctorUrl(): string | null {
  // Reuse SCRAPER_VPS_URL — same host, different port.
  // e.g. SCRAPER_VPS_URL = "http://1.2.3.4:3001" → http://1.2.3.4:3003
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

export async function POST() {
  // Auth gate — only platform admins can trigger the doctor
  await requireAdmin();

  const doctorUrl = getVpsDoctorUrl();
  if (!doctorUrl) {
    return Response.json(
      { error: "SCRAPER_VPS_URL not configured — cannot reach VPS doctor" },
      { status: 503 },
    );
  }

  const apiKey = getDoctorApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "DOCTOR_API_KEY / SCRAPER_API_KEY not configured" },
      { status: 503 },
    );
  }

  // Call the VPS doctor
  let report: DoctorReport;
  try {
    const ctrl = new AbortController();
    // 5-minute safety net inside Vercel's 300s window
    const t = setTimeout(() => ctrl.abort(), 280_000);
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
      return Response.json(
        { error: `VPS doctor returned HTTP ${res.status}`, detail: body.slice(0, 500) },
        { status: 502 },
      );
    }

    report = (await res.json()) as DoctorReport;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Failed to reach VPS doctor: ${msg}` }, { status: 502 });
  }

  // Send notification email to admins (best-effort — don't fail the response)
  if (resend) {
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
        console.error("[doctor/trigger] failed to send notification email:", emailErr);
      }
    }
  }

  return Response.json(report);
}
