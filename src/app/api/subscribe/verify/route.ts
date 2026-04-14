import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, sites } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resend } from "@/lib/email/resend";
import { welcomeEmail } from "@/lib/email/templates";

/**
 * GET /api/subscribe/verify?token=xxx&siteId=xxx
 *
 * Verifies a subscriber's email via the token sent in the verification email.
 * Redirects to the directory page on success.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const siteId = request.nextUrl.searchParams.get("siteId");

  if (!token || !siteId) {
    return NextResponse.json({ error: "Missing token or siteId" }, { status: 400 });
  }

  // Validate siteId is a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId);
  if (!isUUID) {
    return NextResponse.json({ error: "Invalid siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Find subscriber by token
  const subscriber = await db.query.subscribers.findFirst({
    where: and(eq(subscribers.unsubscribeToken, token), eq(subscribers.siteId, siteId)),
  });

  if (!subscriber) {
    return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 404 });
  }

  // Look up site once (used for both already-verified and newly-verified paths)
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, siteId),
    columns: { slug: true, displayName: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site no longer exists" }, { status: 404 });
  }
  const slug = site.slug;
  const siteName = site.displayName || slug;

  if (subscriber.isVerified) {
    // Already verified — redirect to directory
    return NextResponse.redirect(new URL(`/d/${slug}`, request.url));
  }

  // Mark as verified
  await db.update(subscribers)
    .set({ isVerified: true })
    .where(eq(subscribers.id, subscriber.id));

  // Send welcome email
  if (resend) {
    const origin = request.nextUrl.origin;
    const template = welcomeEmail({
      siteName,
      siteUrl: `${origin}/d/${slug}`,
    });
    try {
      const { error: sendError } = await resend.emails.send({
        from: "BuildMy.Directory <hello@buildmy.directory>",
        to: subscriber.email,
        subject: template.subject,
        html: template.html,
      });
      if (sendError) console.error("[subscribe/verify] Resend rejected welcome:", sendError);
    } catch (emailErr) {
      console.error("[subscribe/verify] Failed to send welcome email:", emailErr);
    }
  }

  // Redirect to directory
  return NextResponse.redirect(new URL(`/d/${slug}?verified=true`, request.url));
}
