/**
 * Pipeline Runner — orchestrates the full content pipeline
 *
 * Steps: scrape → store media → transcribe → categorize → publish
 *
 * Can be called directly or via Inngest for background execution.
 */

import { db } from "@/db";
import { sites, posts, pipelineJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { scrapeProfile } from "./scraper";
import { uploadThumbnail, uploadMedia } from "./storage";
import { transcribeVideo } from "./transcriber";
import { categorizeWithLLM, detectCategories } from "./categorizer";

type ProgressCallback = (step: string, progress: number, message: string) => Promise<void>;

/**
 * Run the full pipeline for a site.
 */
export async function runPipeline(siteId: string, onProgress?: ProgressCallback) {
  if (!db) throw new Error("Database not configured");

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  const report = onProgress || (async () => {});

  try {
    // ── Step 1: SCRAPE ──────────────────────────────────────────────
    await report("scrape", 0, "Scraping your content...");
    await updateJob(siteId, "scrape", "running", 0, "Scraping content...");

    const scrapedPosts = await scrapeProfile({
      platform: site.platform as "instagram" | "tiktok",
      handle: site.handle,
      maxPosts: 50,
    });

    await updateJob(siteId, "scrape", "completed", 100, `Scraped ${scrapedPosts.length} posts`);
    await report("scrape", 100, `Scraped ${scrapedPosts.length} posts`);

    if (scrapedPosts.length === 0) {
      await updateJob(siteId, "complete", "completed", 100, "No posts found — directory is empty");
      await db.update(sites).set({ isPublished: true }).where(eq(sites.id, siteId));
      return;
    }

    // ── Step 2: STORE MEDIA ─────────────────────────────────────────
    await report("transcribe", 10, "Uploading media...");
    await updateJob(siteId, "transcribe", "running", 10, "Uploading media...");

    // Insert posts into DB and upload media
    for (let i = 0; i < scrapedPosts.length; i++) {
      const p = scrapedPosts[i];

      // Upload thumbnail and primary media
      const thumbUrl = await uploadThumbnail(site.slug, p.shortcode, p.thumbUrl);
      const mediaUrl = p.mediaUrls[0]
        ? await uploadMedia(site.slug, p.shortcode, p.mediaUrls[0], p.type === "video" ? "video" : "image")
        : null;

      // Generate a title from caption (first line, max 80 chars)
      const title = (p.caption.split("\n")[0] || "Untitled").slice(0, 80);

      await db.insert(posts).values({
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
      }).onConflictDoNothing();

      const pct = Math.round(10 + (i / scrapedPosts.length) * 30);
      await report("transcribe", pct, `Uploaded ${i + 1}/${scrapedPosts.length}...`);
    }

    // ── Step 3: TRANSCRIBE ──────────────────────────────────────────
    await report("transcribe", 40, "Transcribing videos...");
    await updateJob(siteId, "transcribe", "running", 40, "Transcribing videos...");

    const videoPosts = scrapedPosts.filter((p) => p.type === "video" && p.mediaUrls[0]);
    let transcribed = 0;

    for (const vp of videoPosts) {
      const result = await transcribeVideo(vp.mediaUrls[0]);
      if (result.text) {
        await db.update(posts)
          .set({
            transcript: result.text,
            transcriptSegments: result.segments,
          })
          .where(eq(posts.shortcode, vp.shortcode));
        transcribed++;
      }
      const pct = Math.round(40 + (transcribed / Math.max(videoPosts.length, 1)) * 20);
      await report("transcribe", pct, `Transcribed ${transcribed}/${videoPosts.length} videos`);
    }

    await updateJob(siteId, "transcribe", "completed", 100, `Transcribed ${transcribed} videos`);

    // ── Step 4: CATEGORIZE ──────────────────────────────────────────
    await report("categorize", 60, "Categorizing posts...");
    await updateJob(siteId, "categorize", "running", 60, "Categorizing posts...");

    // First, detect categories from all captions
    const allCaptions = scrapedPosts.map((p) => p.caption).filter(Boolean);
    const detectedCategories = await detectCategories(allCaptions);

    // Update site with detected categories
    await db.update(sites)
      .set({ categories: detectedCategories })
      .where(eq(sites.id, siteId));

    // Categorize each post
    const dbPosts = await db.query.posts.findMany({ where: eq(posts.siteId, siteId) });
    let categorized = 0;

    for (const post of dbPosts) {
      const result = await categorizeWithLLM(
        post.caption,
        post.transcript,
        detectedCategories,
      );

      await db.update(posts)
        .set({ category: result.category })
        .where(eq(posts.id, post.id));

      categorized++;
      const pct = Math.round(60 + (categorized / dbPosts.length) * 25);
      await report("categorize", pct, `Categorized ${categorized}/${dbPosts.length} posts`);
    }

    await updateJob(siteId, "categorize", "completed", 100, `Categorized into ${detectedCategories.length} categories`);

    // ── Step 5: PUBLISH ─────────────────────────────────────────────
    await report("complete", 90, "Publishing your directory...");
    await updateJob(siteId, "complete", "running", 90, "Publishing...");

    await db.update(sites)
      .set({ isPublished: true, lastSyncAt: new Date() })
      .where(eq(sites.id, siteId));

    await updateJob(siteId, "complete", "completed", 100, "Your directory is ready!");
    await report("complete", 100, "Your directory is ready!");
  } catch (error) {
    console.error("[pipeline] Error:", error);
    const message = error instanceof Error ? error.message : "Pipeline failed";
    await updateJob(siteId, "scrape", "failed", 0, message);
    throw error;
  }
}

async function updateJob(siteId: string, step: string, status: string, progress: number, message: string) {
  if (!db) return;

  // Upsert the pipeline job for this step
  const existing = await db.query.pipelineJobs.findFirst({
    where: eq(pipelineJobs.siteId, siteId),
  });

  if (existing) {
    await db.update(pipelineJobs)
      .set({ step, status, progress, message, completedAt: status === "completed" ? new Date() : null })
      .where(eq(pipelineJobs.id, existing.id));
  } else {
    await db.insert(pipelineJobs).values({
      siteId,
      step,
      status,
      progress,
      message,
      startedAt: new Date(),
    });
  }
}
