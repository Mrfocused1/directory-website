import { captureError } from "@/lib/error";
import { inngest } from "./client";
import { runPipeline } from "@/lib/pipeline/runner";
import { db } from "@/db";
import {
  sites,
  subscribers,
  digestHistory,
  posts,
  users,
  pageViews,
  postClicks,
  searchEvents,
  categoryClicks,
} from "@/db/schema";
import { eq, and, gte, desc, lt } from "drizzle-orm";
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
    // Apify's FREE tier has an 8 GB global actor-memory cap. With the
    // 512 MB per-run we request (see scraper.ts), 4 concurrent pipeline
    // runs use 2 GB, leaving headroom for references actor, sync jobs,
    // and transient overlap. Bump to 6–8 on Apify Starter (32 GB cap).
    //
    // Without this cap, Inngest's default concurrency of 10 would
    // stack up 10×1024MB=10.24 GB and Apify would reject the 5th run
    // with "exceed the memory limit" — the exact outage we saw on
    // 2026-04-15.
    concurrency: { limit: 4 },
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
      const siteUrl = `${origin}/${site.slug}`;

      let sentCount = 0;
      for (const sub of matching) {
        const unsubscribeUrl = `${origin}/${site.slug}/unsubscribe?token=${sub.unsubscribeToken}`;
        const preferencesUrl = `${origin}/${site.slug}/preferences?token=${sub.unsubscribeToken}`;
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
          const { error: sendError } = await resend.emails.send({
            from: `${fromName} <hello@buildmy.directory>`,
            to: sub.email,
            replyTo,
            subject: template.subject,
            html: template.html,
          });
          if (!sendError) sentCount++;
        } catch (err) {
          captureError(err, { context: "digest-cron", subscriberEmail: sub.email, siteId: site.id });
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

/**
 * Weekly analytics pruner.
 *
 * Raw page_views / post_clicks / search_events / category_clicks rows
 * are append-only and grow forever. The dashboard analytics reads from
 * these tables for "last 30 days" windows and from daily_stats for the
 * longer view, so anything older than ~90 days is dead weight — it's
 * already been rolled up into daily_stats (or it never contributed to
 * a date the dashboard cares about).
 *
 * Without this, a busy site accumulates ~millions of rows per year and
 * Supabase's 500 MB free-tier DB fills up long before it otherwise
 * would. Running weekly instead of daily keeps the writes spiky but
 * amortized — a Monday DELETE is ~7× what a daily DELETE would be,
 * still completes in seconds at this volume.
 */
export const pruneAnalyticsFunction = inngest.createFunction(
  {
    id: "prune-analytics",
    retries: 1,
    triggers: [{ cron: "0 3 * * 1" }], // 03:00 UTC every Monday
  },
  async () => {
    if (!db) return { skipped: "db not configured" };
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const results: Record<string, number> = {};

    const [pv] = await db
      .delete(pageViews)
      .where(lt(pageViews.createdAt, cutoff))
      .returning({ id: pageViews.id })
      .then((rows) => [rows.length]);
    results.pageViews = pv;

    const [pc] = await db
      .delete(postClicks)
      .where(lt(postClicks.createdAt, cutoff))
      .returning({ id: postClicks.id })
      .then((rows) => [rows.length]);
    results.postClicks = pc;

    const [se] = await db
      .delete(searchEvents)
      .where(lt(searchEvents.createdAt, cutoff))
      .returning({ id: searchEvents.id })
      .then((rows) => [rows.length]);
    results.searchEvents = se;

    const [cc] = await db
      .delete(categoryClicks)
      .where(lt(categoryClicks.createdAt, cutoff))
      .returning({ id: categoryClicks.id })
      .then((rows) => [rows.length]);
    results.categoryClicks = cc;

    const total = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`[prune-analytics] deleted ${total} rows older than ${cutoff.toISOString()}`, results);
    return { deleted: total, byTable: results, cutoff: cutoff.toISOString() };
  },
);
