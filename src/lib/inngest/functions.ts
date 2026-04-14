import { inngest } from "./client";
import { runPipeline } from "@/lib/pipeline/runner";
import { purchaseDomain, addDomainToProject } from "@/lib/vercel-domains";
import { db } from "@/db";
import { sites, subscribers, digestHistory, posts, users } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { resend } from "@/lib/email/resend";
import { digestEmail, sanitizeFromName } from "@/lib/email/templates";

/**
 * Background function: Run the content pipeline for a new site.
 */
export const runPipelineFunction = inngest.createFunction(
  {
    id: "run-pipeline",
    retries: 1,
    triggers: [{ event: "pipeline/run" }],
  },
  async ({ event }) => {
    const { siteId } = event.data as { siteId: string };
    await runPipeline(siteId);
    return { siteId, status: "completed" };
  },
);

/**
 * Background function: Re-sync a platform connection.
 */
export const syncPlatformFunction = inngest.createFunction(
  {
    id: "sync-platform",
    retries: 1,
    triggers: [{ event: "platform/sync" }],
  },
  async ({ event }) => {
    const { siteId, platform, handle } = event.data as {
      siteId: string;
      platform: "instagram" | "tiktok";
      handle: string;
    };

    const { scrapeProfile } = await import("@/lib/pipeline/scraper");
    const posts = await scrapeProfile({ platform, handle, maxPosts: 50 });
    return { siteId, status: "synced", scraped: posts.length };
  },
);

/**
 * Background function: Retry a failed domain registration.
 *
 * Triggered by the Stripe webhook when purchaseDomain or addDomainToProject
 * throws. Inngest will retry with exponential backoff (up to 5 attempts).
 */
export const retryDomainRegistrationFunction = inngest.createFunction(
  {
    id: "retry-domain-registration",
    retries: 5, // up to 5 attempts with built-in exponential backoff
    triggers: [{ event: "domain/register-retry" }],
  },
  async ({ event }) => {
    const { domain } = event.data as { domain: string };

    // These will throw on failure, triggering Inngest's retry
    await purchaseDomain(domain);
    await addDomainToProject(domain);

    return { domain, status: "registered" };
  },
);

/**
 * Scheduled digest cron.
 *
 * Runs daily at 09:00 UTC. For each published site:
 *  - Find subscribers whose frequency matches today (daily always; weekly on
 *    Monday; monthly on day 1 of month)
 *  - Gather posts published since the subscriber's last digest
 *  - Send the digest, record in digest_history, update lastDigestAt
 */
export const scheduledDigestFunction = inngest.createFunction(
  {
    id: "scheduled-digest",
    retries: 1,
    triggers: [{ cron: "0 9 * * *" }], // 09:00 UTC every day
  },
  async () => {
    if (!db || !resend) return { skipped: "service not configured" };

    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sunday, 1=Monday
    const dom = now.getUTCDate();

    // Allowed frequencies for today
    const frequencies: string[] = ["daily"];
    if (dow === 1) frequencies.push("weekly"); // Monday
    if (dom === 1) frequencies.push("monthly"); // 1st of month

    const publishedSites = await db.query.sites.findMany({
      where: eq(sites.isPublished, true),
    });

    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://buildmy.directory";
    let totalSent = 0;
    let siteCount = 0;

    for (const site of publishedSites) {
      // Subscribers whose frequency matches today's cadence
      const activeSubs = await db.query.subscribers.findMany({
        where: and(
          eq(subscribers.siteId, site.id),
          eq(subscribers.isActive, true),
          eq(subscribers.isVerified, true),
        ),
      });
      const matching = activeSubs.filter((s) => frequencies.includes(s.frequency));
      if (matching.length === 0) continue;

      // Posts since the most recent digest for this site (fallback: last 7 days)
      const lastDigest = await db.query.digestHistory.findFirst({
        where: eq(digestHistory.siteId, site.id),
        orderBy: [desc(digestHistory.sentAt)],
      });
      const since = lastDigest
        ? new Date(lastDigest.sentAt)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentPosts = await db.query.posts.findMany({
        where: and(eq(posts.siteId, site.id), gte(posts.createdAt, since)),
        orderBy: [desc(posts.createdAt)],
        limit: 20,
      });

      if (recentPosts.length === 0) continue;

      const owner = await db.query.users.findFirst({
        where: eq(users.id, site.userId),
        columns: { email: true },
      });

      const siteName = site.displayName || site.slug;
      const fromName = sanitizeFromName(site.newsletterFromName || siteName);
      const replyTo = site.newsletterReplyTo || owner?.email || undefined;
      const siteUrl = `${origin}/d/${site.slug}`;

      let sentCount = 0;
      for (const sub of matching) {
        const unsubscribeUrl = `${origin}/d/${site.slug}/unsubscribe?token=${sub.unsubscribeToken}`;
        const template = digestEmail({
          siteName,
          siteUrl,
          posts: recentPosts.map((p) => ({
            title: p.title,
            url: `${siteUrl}/p/${p.shortcode}`,
            category: p.category,
          })),
          unsubscribeUrl,
        });

        try {
          const { error: sendError } = await resend.emails.send({
            from: `${fromName} <hello@buildmy.directory>`,
            to: sub.email,
            replyTo,
            subject: template.subject,
            html: template.html,
          });
          if (!sendError) sentCount++;
        } catch (err) {
          console.error(`[cron] Failed to send to ${sub.email}:`, err);
        }
      }

      if (sentCount > 0) {
        await db.insert(digestHistory).values({
          siteId: site.id,
          subject: `New posts on ${siteName}`,
          postCount: recentPosts.length,
          recipientCount: sentCount,
          openCount: 0,
          clickCount: 0,
        });
        await db.update(subscribers)
          .set({ lastDigestAt: new Date() })
          .where(and(
            eq(subscribers.siteId, site.id),
            eq(subscribers.isActive, true),
            eq(subscribers.isVerified, true),
          ));
        totalSent += sentCount;
        siteCount++;
      }
    }

    return { totalSent, siteCount, frequencies };
  },
);
