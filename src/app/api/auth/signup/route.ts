import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { resend } from "@/lib/email/resend";
import { signupConfirmEmail, platformWelcomeEmail } from "@/lib/email/templates";
import { db } from "@/db";
import { users } from "@/db/schema";
import { captureServer } from "@/lib/analytics/posthog-server";
import { authLimiter, checkRateLimit } from "@/lib/rate-limit-middleware";

/**
 * POST /api/auth/signup
 *
 * Custom signup endpoint that replaces client-side supabase.auth.signUp
 * so we can control the email sender. The native flow ships mail from
 * Supabase's default no-reply address; this endpoint instead:
 *
 *   1. creates the user via the admin API (email_confirm: false) — works
 *      on test domains like example.com that Supabase's signUp rejects
 *   2. generates a signup confirmation link via admin.generateLink
 *   3. emails that link from hello@buildmy.directory via Resend
 *
 * Body: { email, password, next? }
 * Returns: { ok: true } on success or { error } on failure.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, authLimiter);
  if (limited) return limited;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const nextRaw = typeof body.next === "string" ? body.next : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (email.length > 320) {
    return NextResponse.json({ error: "Email too long." }, { status: 400 });
  }

  // Only same-origin relative paths, no open-redirect
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  const admin = createServiceRoleClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create the user (unconfirmed). If the email already exists, surface a
  // clear error — don't silently succeed.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (createErr) {
    const msg = createErr.message || "Failed to create account";
    // Distinguish duplicate-email from other errors for a better UI message.
    if (/already been registered|already exists|duplicate/i.test(msg)) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in instead." },
        { status: 409 },
      );
    }
    console.error("[auth/signup] createUser failed:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!created?.user) {
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }

  // Ensure the app-side users row exists right away. Previously this was
  // only created lazily in /auth/callback when the user clicked the email
  // link — but any authenticated request to /api/pipeline, /api/sites,
  // etc. needs that row to satisfy FK constraints. Creating it here makes
  // the signup atomic from the DB's perspective.
  if (db) {
    try {
      await db.insert(users).values({
        id: created.user.id,
        email,
        // Default new signups to Creator. Real plan entitlement is
        // gated by an active Stripe subscription — the plan column
        // is just a "what tier did they intend to use" marker, not
        // proof of payment.
        plan: "creator",
      }).onConflictDoNothing();
    } catch (err) {
      console.error("[auth/signup] Failed to create app-side users row:", err);
      // Don't fail signup over this — /auth/callback will retry the insert.
    }
  }

  // Send a welcome email (non-blocking — never fails signup)
  if (resend) {
    try {
      const template = platformWelcomeEmail();
      await resend.emails.send({
        from: "BuildMy.Directory <hello@buildmy.directory>",
        to: email,
        subject: template.subject,
        html: template.html,
      });
    } catch (welcomeErr) {
      console.error("[auth/signup] Welcome email failed:", welcomeErr);
    }
  }

  // Build the redirect URL the confirmation link will bounce back to.
  const origin = request.nextUrl.origin;
  const redirectTo = `${origin}/auth/callback${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`;

  // Generate Supabase's own confirmation URL so clicking it hands back a
  // valid session (no custom token handling needed on our side).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    // Roll back the user so a retry isn't blocked by duplicate-email
    await admin.auth.admin.deleteUser(created.user.id).catch(() => null);
    console.error("[auth/signup] generateLink failed:", linkErr?.message);
    return NextResponse.json(
      { error: "Could not generate confirmation link. Please try again." },
      { status: 500 },
    );
  }

  // Send our branded confirmation email via Resend
  if (resend) {
    // Supabase returns both a one-time magic URL *and* the 6-digit OTP
    // in email_otp. We lead the email with the code (immune to inbox
    // bots prefetching the link) and keep the URL as a fallback.
    const template = signupConfirmEmail({
      confirmUrl: linkData.properties.action_link,
      code: (linkData.properties as { email_otp?: string }).email_otp,
    });
    const { error: sendErr } = await resend.emails.send({
      from: "BuildMy.Directory <hello@buildmy.directory>",
      to: email,
      subject: template.subject,
      html: template.html,
    });
    if (sendErr) {
      // Email failed — roll back the user so they can retry cleanly and we
      // don't leave a half-created account that blocks signup.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => null);
      console.error("[auth/signup] Resend failed:", sendErr);
      return NextResponse.json(
        { error: "Could not send confirmation email. Please try again." },
        { status: 500 },
      );
    }
  } else {
    // No Resend configured — still allow signup in dev, but warn in logs.
    console.warn("[auth/signup] Resend not configured; confirmation email not sent");
  }

  // Conversion event for A/B analysis. No-op until PostHog is
  // configured; never blocks the signup response.
  captureServer(created.user.id, "signup_completed", {
    email_domain: email.split("@")[1] || null,
  }).catch(() => {});

  return NextResponse.json({ ok: true, email });
}
