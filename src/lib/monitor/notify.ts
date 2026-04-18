import type { Severity, ServiceCheck, HealResult } from "./types";

/** Debounce: track last-sent time per severity to avoid alert storms */
const lastSentAt = new Map<Severity, number>();
const DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

export async function sendMonitorAlert(opts: {
  severity: Severity;
  services: ServiceCheck[];
  healActions: HealResult[];
}): Promise<void> {
  // Debounce: skip if same severity was sent within the last 10 min
  const last = lastSentAt.get(opts.severity) ?? 0;
  if (Date.now() - last < DEBOUNCE_MS) return;

  const adminEmailsRaw = process.env.ADMIN_EMAILS || "";
  const adminEmails = adminEmailsRaw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.warn("[monitor] ADMIN_EMAILS not set — skipping alert");
    return;
  }

  try {
    const { resend } = await import("@/lib/email/resend");
    const { monitorAlertEmail } = await import("@/lib/email/templates");

    if (!resend) {
      console.warn("[monitor] Resend not configured — skipping alert");
      return;
    }

    const template = monitorAlertEmail({
      severity: opts.severity,
      services: opts.services,
      healActions: opts.healActions,
      timestamp: new Date().toISOString(),
    });

    await resend.emails.send({
      from: "BuildMy.Directory Monitor <hello@buildmy.directory>",
      to: adminEmails,
      subject: template.subject,
      html: template.html,
    });

    // Record send time only on success
    lastSentAt.set(opts.severity, Date.now());
  } catch (err) {
    console.error("[monitor] Failed to send alert email:", err instanceof Error ? err.message : err);
  }
}
