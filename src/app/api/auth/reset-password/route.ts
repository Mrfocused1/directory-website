import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { resend } from "@/lib/email/resend";
import { passwordResetEmail } from "@/lib/email/templates";

/**
 * POST /api/auth/reset-password
 *
 * Custom password-reset email. Uses admin.generateLink({ type: 'recovery' })
 * to produce Supabase's own recovery URL, then ships the email from
 * hello@buildmy.directory via Resend instead of Supabase's default sender.
 *
 * Body: { email }
 * Always returns 200 so the UI can display the same "if an account exists…"
 * confirmation regardless of whether the address is registered (don't leak
 * account existence).
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const admin = createServiceRoleClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const origin = request.nextUrl.origin;
  // Redirect straight to /auth/reset — the page now exchanges the PKCE
  // `?code=` client-side (the server `/auth/callback` handler can't do
  // it because admin-generated recovery codes aren't tied to a
  // code_verifier cookie).
  const redirectTo = `${origin}/auth/reset`;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  // If the email doesn't exist, generateLink errors with "User not found".
  // Swallow that and return the same success shape to avoid leaking which
  // emails are registered.
  if (linkErr || !linkData?.properties?.action_link) {
    if (linkErr && !/user not found|not.*found/i.test(linkErr.message)) {
      console.error("[auth/reset] generateLink failed:", linkErr.message);
    }
    return NextResponse.json({ ok: true });
  }

  if (resend) {
    const template = passwordResetEmail({ resetUrl: linkData.properties.action_link });
    const { error: sendErr } = await resend.emails.send({
      from: "BuildMy.Directory <hello@buildmy.directory>",
      to: email,
      subject: template.subject,
      html: template.html,
    });
    if (sendErr) {
      console.error("[auth/reset] Resend failed:", sendErr);
      // Don't leak the failure either — user sees generic success and
      // can retry in a moment.
    }
  }

  return NextResponse.json({ ok: true });
}
