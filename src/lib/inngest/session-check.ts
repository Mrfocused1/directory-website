/**
 * Inngest cron — periodic Instagram session health check.
 *
 * Hits POST /api/session/recover every 2 hours. The endpoint itself
 * does the actual work (check session, email operator if dead, etc);
 * we just give it a schedule to run on.
 *
 * 2-hour cadence is a tradeoff: sessions typically survive days-to-
 * weeks, so faster polling wastes compute. But we don't want a creator
 * hitting a failed scrape 12 hours before we've noticed either. 2h
 * caps the worst-case detection window at 2 hours and the worst-case
 * email rate at 12/day (still cheap, well inside Resend's free tier).
 *
 * If it gets noisy, bump the cron to hourly/daily or add a
 * last_notified_at sentinel on the VPS and throttle in the route.
 */

import { inngest } from "./client";

export const sessionCheckFunction = inngest.createFunction(
  {
    id: "session-check",
    retries: 0, // the route is idempotent; a retry on failure would just re-email
    triggers: [{ cron: "0 */2 * * *" }], // top of every 2 hours UTC
  },
  async ({ step }) => {
    const key = process.env.SESSION_RECOVERY_KEY;
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://buildmy.directory";
    if (!key) {
      return { skipped: "SESSION_RECOVERY_KEY not set" };
    }

    const result = await step.run("call-recover-endpoint", async () => {
      const res = await fetch(`${origin}/api/session/recover`, {
        method: "POST",
        headers: { "x-recovery-key": key },
        signal: AbortSignal.timeout(55_000),
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 200) };
      }
      return { status: res.status, body: parsed };
    });

    return result;
  },
);
