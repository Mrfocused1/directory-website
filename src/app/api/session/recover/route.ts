/**
 * POST /api/session/recover
 *
 * Session-dead notifier. Wire this to a cron/Inngest job.
 *
 *   1. Hits the VPS /check-session to learn if the Instagram session is still alive.
 *   2. If dead, emails the operator with a one-line command they can run on
 *      their Mac (scripts/ig-session-refresh.sh) to log back in from a
 *      residential IP and push fresh cookies to the VPS.
 *
 * We used to try the VPS-side /recover endpoint first, but in practice
 * Instagram always challenges a login attempt from the Hetzner DC IP. So
 * that's now skipped — the Mac-based refresh is the only path that
 * reliably restores a session. Pass ?tryVpsFirst=1 to attempt the legacy
 * flow anyway (useful if you've restored IPRoyal and want to give it a
 * shot before pinging yourself).
 */

import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/email/resend";

const VPS_URL = process.env.SCRAPER_VPS_URL;
const VPS_KEY = process.env.SCRAPER_VPS_API_KEY;
const RECOVERY_KEY = process.env.SESSION_RECOVERY_KEY;
const ALERT_EMAIL = process.env.SESSION_RECOVERY_ALERT_EMAIL;

export const maxDuration = 60;

type VpsSessionCheck = { valid: boolean; reason?: string };

async function vpsFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!VPS_URL || !VPS_KEY) throw new Error("VPS not configured");
  return fetch(`${VPS_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), "x-api-key": VPS_KEY },
  });
}

function buildRefreshEmail(reason: string | undefined) {
  const subject = "[IG scraper] Session expired — run refresh script";
  const text = [
    "Your Instagram scraper's session on the Hetzner VPS is no longer valid.",
    `Reason reported by /check-session: ${reason || "(none)"}`,
    "",
    "Scraping is paused for authenticated endpoints (anything > 12 posts per account).",
    "To restore, run this on your Mac — takes ~30 seconds:",
    "",
    '  cd "/Users/paulbridges/Desktop/new directory/directory-website" && bash scripts/ig-session-refresh.sh',
    "",
    "The script opens a headed Chromium, auto-logs into Instagram using the",
    "stored credentials, and pushes fresh cookies to the VPS. If it hits a",
    "2FA or email-verification challenge it'll say so, and you can fall back",
    "to `node scripts/ig-session-capture.mjs` to log in interactively.",
    "",
    "Once the script prints \"Session refreshed\", the pipeline resumes.",
  ].join("\n");
  return { subject, text };
}

async function notifyOperator(subject: string, text: string) {
  if (!resend || !ALERT_EMAIL) return false;
  const result = await resend.emails
    .send({
      from: "BuildMy.Directory <alerts@buildmy.directory>",
      to: ALERT_EMAIL,
      subject,
      text,
    })
    .catch((err) => {
      console.warn("[session-recover] email failed:", err);
      return null;
    });
  return !!result;
}

export async function POST(request: NextRequest) {
  if (!RECOVERY_KEY || request.headers.get("x-recovery-key") !== RECOVERY_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const force = url.searchParams.get("force") === "1";
  const tryVpsFirst = url.searchParams.get("tryVpsFirst") === "1";

  try {
    // Step 1: session health check
    let reason: string | undefined;
    if (!force) {
      const checkRes = await vpsFetch("/check-session");
      if (checkRes.ok) {
        const data = (await checkRes.json()) as VpsSessionCheck;
        if (data.valid) {
          return NextResponse.json({ recovered: false, reason: "session_already_valid" });
        }
        reason = data.reason;
      }
    }

    // Step 2 (optional): legacy VPS-side re-login. Historically fails on IG
    // challenges from DC IPs; kept behind a flag for the day IPRoyal or
    // another residential proxy comes back online.
    if (tryVpsFirst) {
      const recoverRes = await vpsFetch("/recover", { method: "POST" });
      if (recoverRes.ok) {
        const data = await recoverRes.json().catch(() => ({}));
        if (data?.success) {
          return NextResponse.json({ recovered: true, via: "vps", cookieCount: data.cookies });
        }
      }
    }

    // Step 3: email the operator — the Mac-side flow is the only reliable path.
    const { subject, text } = buildRefreshEmail(reason);
    const emailed = await notifyOperator(subject, text);
    return NextResponse.json({
      recovered: false,
      reason: reason || "session_invalid",
      action_required: "run_mac_refresh_script",
      emailed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
