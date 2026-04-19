import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { resend } from "@/lib/email/resend";
import { signupConfirmEmail } from "@/lib/email/templates";
import { authLimiter, checkRateLimit } from "@/lib/rate-limit-middleware";

/**
 * POST /api/auth/resend-confirmation { email }
 *
 * Regenerates a fresh signup confirmation code + link for an existing
 * unconfirmed user and emails it via Resend. Used when the user's
 * original code expired or their inbox bot consumed it.
 *
 * Silent no-op if the email isn't registered or already confirmed —
 * don't leak account existence.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, authLimiter);
  if (limited) return limited;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !resend) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const admin = createServiceRoleClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up the user. Don't reveal existence either way.
  const { data: list } = await admin.auth.admin.listUsers();
  const user = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (!user || user.email_confirmed_at) {
    return NextResponse.json({ ok: true });
  }

  // magiclink works for both unconfirmed and confirmed users; for
  // unconfirmed ones the email field is auto-confirmed on consume.
  // Returns the same email_otp shape as the signup link.
  const origin = request.nextUrl.origin;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[auth/resend-confirmation] generateLink failed:", linkErr?.message);
    return NextResponse.json({ error: "Could not generate link" }, { status: 500 });
  }

  const code = (linkData.properties as { email_otp?: string }).email_otp;
  if (!code) {
    console.error("[auth/resend-confirmation] generateLink returned no email_otp");
    return NextResponse.json({ error: "Could not generate code" }, { status: 500 });
  }
  const template = signupConfirmEmail({ code });
  const { error: sendErr } = await resend.emails.send({
    from: "BuildMy.Directory <hello@buildmy.directory>",
    to: email,
    subject: template.subject,
    html: template.html,
  });
  if (sendErr) {
    console.warn("[auth/resend-confirmation] Resend rejected:", sendErr);
    return NextResponse.json({ error: "Could not send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
