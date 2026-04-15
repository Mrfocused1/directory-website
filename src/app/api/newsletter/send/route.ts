import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, sites, posts, digestHistory } from "@/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";
import { resend } from "@/lib/email/resend";
import { digestEmail, sanitizeFromName } from "@/lib/email/templates";
import { getApiUser } from "@/lib/supabase/api";

// Sending to many subscribers can take a while
export const maxDuration = 60;

/**
 * POST /api/newsletter/send
 *
 * Sends a digest email to all active, verified subscribers for a site.
 * Requires authentication and the user must own the site.
 * Body: { siteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    if (!resend) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
    }

    const resolvedSiteId = await resolveSiteId(siteId);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Get site info and verify ownership
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, resolvedSiteId),
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    if (site.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get active, verified subscribers
    const activeSubscribers = await db.query.subscribers.findMany({
      where: and(
        eq(subscribers.siteId, resolvedSiteId),
        eq(subscribers.isActive, true),
        eq(subscribers.isVerified, true),
      ),
    });

    if (activeSubscribers.length === 0) {
      return NextResponse.json({ error: "No active subscribers" }, { status: 400 });
    }

    // Get recent posts (last 7 days or since last digest)
    const lastDigest = await db.query.digestHistory.findFirst({
      where: eq(digestHistory.siteId, resolvedSiteId),
      orderBy: [desc(digestHistory.sentAt)],
    });

    const since = lastDigest
      ? new Date(lastDigest.sentAt)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentPosts = await db.query.posts.findMany({
      where: and(eq(posts.siteId, resolvedSiteId), gte(posts.createdAt, since)),
      orderBy: [desc(posts.createdAt)],
      limit: 20,
    });

    if (recentPosts.length === 0) {
      return NextResponse.json({ error: "No new posts since last digest" }, { status: 400 });
    }

    const origin = request.nextUrl.origin;
    const siteUrl = `${origin}/d/${site.slug}`;
    const siteName = site.displayName || site.slug;

    // Send to each subscriber
    let sentCount = 0;
    const errors: string[] = [];

    for (const sub of activeSubscribers) {
      const unsubscribeUrl = `${origin}/d/${site.slug}/unsubscribe?token=${sub.unsubscribeToken}`;
      const preferencesUrl = `${origin}/d/${site.slug}/preferences?token=${sub.unsubscribeToken}`;
      const template = digestEmail({
        siteName,
        siteUrl,
        posts: recentPosts.map((p) => ({
          title: p.title,
          url: `${siteUrl}/p/${p.shortcode}`,
          category: p.category,
        })),
        unsubscribeUrl,
        preferencesUrl,
      });

      try {
        // Prefer the creator's custom "from name" if configured
        const fromName = sanitizeFromName(site.newsletterFromName || siteName);
        // Replies route to the creator's configured email, or their account email
        const replyTo = site.newsletterReplyTo || user.email || undefined;

        const { error: sendError } = await resend.emails.send({
          from: `${fromName} <hello@buildmy.directory>`,
          to: sub.email,
          replyTo,
          subject: template.subject,
          html: template.html,
        });
        if (sendError) {
          errors.push(sub.email);
          console.error(`[newsletter/send] Resend rejected ${sub.email}:`, sendError);
        } else {
          sentCount++;
        }
      } catch (err) {
        errors.push(sub.email);
        console.error(`[newsletter/send] Failed to send to ${sub.email}:`, err);
      }
    }

    // Record digest in history first (so if this fails, timestamps stay consistent)
    await db.insert(digestHistory).values({
      siteId: resolvedSiteId,
      subject: `New posts on ${siteName}`,
      postCount: recentPosts.length,
      recipientCount: sentCount,
      openCount: 0,
      clickCount: 0,
    });

    // Then update last digest timestamp for subscribers
    await db.update(subscribers)
      .set({ lastDigestAt: new Date() })
      .where(and(
        eq(subscribers.siteId, resolvedSiteId),
        eq(subscribers.isActive, true),
        eq(subscribers.isVerified, true),
      ));

    return NextResponse.json({
      sent: sentCount,
      failed: errors.length,
      postCount: recentPosts.length,
      message: `Digest sent to ${sentCount} subscriber${sentCount === 1 ? "" : "s"}`,
    });
  } catch (error) {
    console.error("[newsletter/send] Error:", error);
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
