/**
 * POST /api/session/recover
 *
 * Thin orchestrator:
 *   1. Ask the VPS if its Instagram session is still valid.
 *   2. If not, tell the VPS to re-login itself. The VPS now has
 *      hardcoded challenge clickers and an optional Claude vision
 *      fallback, so 90%+ of recoveries finish there.
 *   3. On unrecoverable failure (2FA / captcha / invalid creds), email
 *      the operator so a human can resolve it.
 *
 * We intentionally don't run the browser on Vercel — all the heavy
 * lifting lives on the VPS to reuse its residential proxy and stealth
 * setup, and to keep this endpoint free. Triggered by header auth;
 * wire it to Inngest or a cron when you're happy with the happy path.
 */

import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/email/resend";

const VPS_URL = process.env.SCRAPER_VPS_URL;
const VPS_KEY = process.env.SCRAPER_VPS_API_KEY;
const RECOVERY_KEY = process.env.SESSION_RECOVERY_KEY;
const ALERT_EMAIL = process.env.SESSION_RECOVERY_ALERT_EMAIL;

export const maxDuration = 300; // VPS login + challenge resolution can take a minute

type VpsSessionCheck = { valid: boolean; reason?: string };
type VpsRecoverResult =
  | { success: true; cookies: number }
  | { success: false; reason: string; detail?: string };

async function vpsFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!VPS_URL || !VPS_KEY) throw new Error("VPS not configured");
  return fetch(`${VPS_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), "x-api-key": VPS_KEY },
  });
}

async function notifyOperator(subject: string, body: string) {
  if (!resend || !ALERT_EMAIL) return;
  await resend.emails
    .send({
      from: "BuildMy.Directory <alerts@buildmy.directory>",
      to: ALERT_EMAIL,
      subject,
      text: body,
    })
    .catch(() => {}); // Best-effort
}

export async function POST(request: NextRequest) {
  if (!RECOVERY_KEY || request.headers.get("x-recovery-key") !== RECOVERY_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    if (!force) {
      const checkRes = await vpsFetch("/check-session");
      if (checkRes.ok) {
        const data = (await checkRes.json()) as VpsSessionCheck;
        if (data.valid) {
          return NextResponse.json({ recovered: false, reason: "session_already_valid" });
        }
      }
    }

    const recoverRes = await vpsFetch("/recover", { method: "POST" });
    const result = (await recoverRes.json()) as VpsRecoverResult;

    if (result.success) {
      return NextResponse.json({ recovered: true, cookieCount: result.cookies });
    }

    // Reasons that need a human
    const humanReasons = new Set(["2fa_required", "captcha_required", "invalid_credentials"]);
    if (humanReasons.has(result.reason)) {
      await notifyOperator(
        `[IG scraper] Manual intervention required: ${result.reason}`,
        `Automated session recovery bailed because: ${result.reason}.\n\n` +
          `Detail: ${result.detail || "(none)"}\n\n` +
          `Next steps:\n` +
          `  • Log in to Instagram from your normal browser\n` +
          `  • Clear any "Was this you?" / 2FA challenge IG shows\n` +
          `  • Re-run POST /api/session/recover (it should succeed)`,
      );
    }
    return NextResponse.json(
      { recovered: false, reason: result.reason, detail: result.detail },
      { status: 502 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
