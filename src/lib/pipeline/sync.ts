/**
 * Incremental sync — creator-facing self-serve pipeline.
 *
 * Unlike runPipeline (operator-triggered, full build), runSync is:
 *   - Tier-1 only (public web_profile_info API, 12 posts max)
 *   - No operator involvement, no IG session cookies, no residential
 *     proxy — it's safe to run from Vercel on demand and on a daily cron
 *   - Incremental: filters against shortcodes already in the DB, so only
 *     genuinely new posts go through upload/transcribe/categorize/refs
 *   - Preserves existing site.categories (doesn't re-detect them)
 *   - No relevance filter (too expensive per sync, and the operator
 *     already vetted the account at initial build time)
 *
 * Net effect: creator clicks "Sync now" or the daily cron runs, their
 * last 12 IG posts are checked, any new ones get added. Takes ~10s for
 * 1-3 new posts. Zero new posts = ~2s (just the scrape + no-op).
 */

import { db } from "@/db";
import { sites, posts, users, references as referencesTable } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { scrapeProfile } from "./scraper";
import { uploadThumbnail, uploadMedia } from "./storage";
import { transcribeVideo } from "./transcriber";
import { categorizeBatchWithLLM } from "./categorizer";
import { extractReferencesForPosts } from "./references";
import { hasFeature, type PlanId } from "@/lib/plans";
import { captureError } from "@/lib/error";

const UPLOAD_CONCURRENCY = 10;

export type SyncResult = {
  success: boolean;
  newPosts: number;
  reason?:
    | "no_db"
    | "site_not_found"
    | "not_published"
    | "no_new_posts"
    | "ig_returned_zero"
    | "pipeline_error";
  detail?: string;
};

export async function runSync(siteId: string): Promise<SyncResult> {
  if (!db) return { success: false, newPosts: 0, reason: "no_db" };
  const database = db;

  const site = await database.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return { success: false, newPosts: 0, reason: "site_not_found" };

  // Don't sync unpublished sites — they haven't had their initial
  // operator-run build yet. Those go through runPipeline, not here.
  if (!site.isPublished) {
    return { success: false, newPosts: 0, reason: "not_published" };
  }

  const owner = await database.query.users.findFirst({
    where: eq(users.id, site.userId),
    columns: { plan: true },
  });
  const userPlan: PlanId = ((owner?.plan as string) || "creator") as PlanId;

  try {
    // 1) Tier-1-only scrape. No VPS, no session, no operator needed.
    const scraped = await scrapeProfile({
      platform: site.platform as "instagram" | "tiktok",
      handle: site.handle,
      maxPosts: 12,
      tier1Only: true,
    });

    if (scraped.length === 0) {
      await database.update(sites).set({ lastSyncAt: new Date() }).where(eq(sites.id, siteId));
      return { success: true, newPosts: 0, reason: "ig_returned_zero" };
    }

    // 2) Keep only posts we haven't seen before.
    const existingRows = await database
      .select({ shortcode: posts.shortcode })
      .from(posts)
      .where(eq(posts.siteId, siteId));
    const existingSet = new Set(existingRows.map((r) => r.shortcode));
    const newPosts = scraped.filter((p) => !existingSet.has(p.shortcode));

    if (newPosts.length === 0) {
      await database.update(sites).set({ lastSyncAt: new Date() }).where(eq(sites.id, siteId));
      return { success: true, newPosts: 0, reason: "no_new_posts" };
    }

    console.log(`[sync] ${site.slug}: ${newPosts.length} new posts to process`);

    // 3) Sort-order cursor so new posts appear at the end (creator
    // manual reorder survives).
    const [maxRow] = await database
      .select({ max: sql<number>`coalesce(max(${posts.sortOrder}), -1)` })
      .from(posts)
      .where(eq(posts.siteId, siteId));
    let nextSortOrder = (maxRow?.max ?? -1) + 1;

    // 4) Upload media (parallel) + insert post rows.
    for (let i = 0; i < newPosts.length; i += UPLOAD_CONCURRENCY) {
      const batch = newPosts.slice(i, i + UPLOAD_CONCURRENCY);
      const uploaded = await Promise.all(
        batch.map(async (p) => {
          const thumbUrl = await uploadThumbnail(site.slug, p.shortcode, p.thumbUrl);
          const mediaUrl = p.mediaUrls[0]
            ? await uploadMedia(
                site.slug,
                p.shortcode,
                p.mediaUrls[0],
                p.type === "video" ? "video" : "image",
              )
            : null;
          return { p, thumbUrl, mediaUrl };
        }),
      );
      for (const { p, thumbUrl, mediaUrl } of uploaded) {
        const title = (p.caption.split("\n")[0] || "Untitled").slice(0, 80);
        await database
          .insert(posts)
          .values({
            siteId,
            shortcode: p.shortcode,
            type: p.type,
            caption: p.caption,
            title,
            category: "Uncategorized",
            takenAt: p.takenAt,
            mediaUrl,
            thumbUrl,
            numSlides: p.numSlides,
            platformUrl: p.platformUrl,
            isVisible: true,
            sortOrder: nextSortOrder++,
          })
          .onConflictDoNothing();
      }
    }

    // Re-fetch the inserted rows so we have their ids for subsequent steps.
    const newShortcodes = newPosts.map((p) => p.shortcode);
    const insertedPosts = await database.query.posts.findMany({
      where: and(eq(posts.siteId, siteId), inArray(posts.shortcode, newShortcodes)),
      columns: {
        id: true,
        shortcode: true,
        type: true,
        caption: true,
        transcript: true,
        mediaUrl: true,
      },
    });

    // 5) Transcribe new videos (feature-gated by plan).
    if (hasFeature(userPlan, "transcription")) {
      const videoPosts = insertedPosts.filter(
        (p) =>
          p.type === "video" && p.mediaUrl && (!p.transcript || p.transcript.length < 50),
      );
      for (const vp of videoPosts) {
        try {
          const result = await transcribeVideo(vp.mediaUrl as string);
          if (result.text) {
            await database
              .update(posts)
              .set({ transcript: result.text, transcriptSegments: result.segments })
              .where(eq(posts.id, vp.id));
          }
        } catch (err) {
          captureError(err, { step: "sync-transcribe", shortcode: vp.shortcode, siteId });
        }
      }
    }

    // 6) Categorize into the site's EXISTING categories — no re-detection.
    if (hasFeature(userPlan, "auto_categorization")) {
      const existingCats =
        (Array.isArray(site.categories) && (site.categories as string[]).length > 0
          ? (site.categories as string[])
          : ["General", "Updates", "Featured", "Uncategorized"]);
      try {
        // Re-read so we have fresh transcript values from step 5.
        const freshPosts = await database.query.posts.findMany({
          where: and(eq(posts.siteId, siteId), inArray(posts.shortcode, newShortcodes)),
        });
        const results = await categorizeBatchWithLLM(
          freshPosts.map((p) => ({ caption: p.caption, transcript: p.transcript })),
          existingCats,
        );
        await Promise.all(
          freshPosts.map((post, idx) => {
            const result = results[idx];
            const updates: Record<string, unknown> = {
              category: result?.category || existingCats[0],
            };
            if (result?.summary) updates.summary = result.summary;
            if (result?.title && result.title.length > 0) {
              const captionFirstLine = (post.caption?.split("\n")[0] || "").slice(0, 80);
              if (result.title.toLowerCase() !== captionFirstLine.toLowerCase()) {
                updates.title = result.title.slice(0, 100);
              }
            }
            return database.update(posts).set(updates).where(eq(posts.id, post.id));
          }),
        );
      } catch (err) {
        captureError(err, { step: "sync-categorize", siteId });
      }
    }

    // 7) References for the new posts.
    if (hasFeature(userPlan, "references")) {
      try {
        const refTargets = await database.query.posts.findMany({
          where: and(eq(posts.siteId, siteId), inArray(posts.shortcode, newShortcodes)),
          columns: { id: true, caption: true, transcript: true },
        });
        const rows = await extractReferencesForPosts(
          refTargets.map((p) => ({
            postId: p.id,
            caption: p.caption || "",
            transcript: p.transcript,
          })),
        );
        const byPost = new Map<string, typeof rows>();
        for (const r of rows) {
          if (!byPost.has(r.postId)) byPost.set(r.postId, []);
          byPost.get(r.postId)!.push(r);
        }
        for (const [postId, postRows] of byPost) {
          if (postRows.length > 0) {
            await database.insert(referencesTable).values(
              postRows.map((r) => ({
                postId: r.postId,
                kind: r.kind,
                title: r.title,
                url: r.url,
                videoId: r.videoId,
                note: r.note,
              })),
            );
          }
        }
      } catch (err) {
        captureError(err, { step: "sync-references", siteId });
      }
    }

    // 8) Stamp lastSyncAt + bust tenant CDN cache.
    await database.update(sites).set({ lastSyncAt: new Date() }).where(eq(sites.id, siteId));
    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath(`/${site.slug}`);
    } catch {
      /* revalidatePath throws outside request scope; safe to ignore */
    }

    return { success: true, newPosts: newPosts.length };
  } catch (err) {
    captureError(err, { step: "sync", siteId });
    return {
      success: false,
      newPosts: 0,
      reason: "pipeline_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
