/**
 * Pipeline Runner — orchestrates the full content pipeline
 *
 * Steps: scrape → store media → transcribe → categorize → publish
 *
 * Can be called directly or via Inngest for background execution.
 */

import { db } from "@/db";
import { sites, posts, pipelineJobs, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { scrapeProfile } from "./scraper";
import { uploadThumbnail, uploadMedia } from "./storage";
import { transcribeVideo } from "./transcriber";
import { categorizeWithLLM, detectCategories, categorizeByKeywords } from "./categorizer";
import { hasFeature, getPlan, type PlanId } from "@/lib/plans";

type ProgressCallback = (step: string, progress: number, message: string) => Promise<void>;

/**
 * Run the full pipeline for a site.
 */
export async function runPipeline(siteId: string, onProgress?: ProgressCallback) {
  if (!db) throw new Error("Database not configured");
  const database = db; // Stable non-null reference for closures

  const site = await database.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  // Look up the site owner's plan to gate paid features
  const owner = await database.query.users.findFirst({
    where: eq(users.id, site.userId),
    columns: { plan: true },
  });
  const validPlans = ["free", "creator", "pro", "agency"];
  const userPlan: PlanId = (validPlans.includes(owner?.plan as string) ? owner!.plan : "free") as PlanId;
  const planConfig = getPlan(userPlan);
  const canTranscribe = hasFeature(userPlan, "transcription");
  const canAutoCategorize = hasFeature(userPlan, "auto_categorization");
  // postLimit = 0 means unlimited; otherwise cap to plan's post limit
  const maxPosts = planConfig.postLimit === 0 ? 200 : planConfig.postLimit;

  const report = onProgress || (async () => {});
  let currentStep = "scrape";

  try {
    // ── Step 1: SCRAPE ──────────────────────────────────────────────
    currentStep = "scrape";
    await report("scrape", 0, "Scraping your content...");
    await updateJob(siteId, "scrape", "running", 0, "Scraping content...");

    const scrapedPosts = await scrapeProfile({
      platform: site.platform as "instagram" | "tiktok",
      handle: site.handle,
      maxPosts,
    });

    await updateJob(siteId, "scrape", "completed", 100, `Scraped ${scrapedPosts.length} posts`);
    await report("scrape", 100, `Scraped ${scrapedPosts.length} posts`);

    if (scrapedPosts.length === 0) {
      await updateJob(siteId, "complete", "completed", 100, "No posts found — directory is empty");
      await db.update(sites).set({ isPublished: true }).where(eq(sites.id, siteId));
      return;
    }

    // ── Step 2: STORE MEDIA ─────────────────────────────────────────
    currentStep = "transcribe";
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

    // ── Step 3: TRANSCRIBE (Creator+ plans only) ────────────────────
    if (canTranscribe) {
      await report("transcribe", 40, "Transcribing videos...");
      await updateJob(siteId, "transcribe", "running", 40, "Transcribing videos...");

      const videoPosts = scrapedPosts.filter((p) => p.type === "video" && p.mediaUrls[0]);
      let transcribed = 0;

      for (const vp of videoPosts) {
        const result = await transcribeVideo(vp.mediaUrls[0]);
        if (result.text) {
          await database.update(posts)
            .set({
              transcript: result.text,
              transcriptSegments: result.segments,
            })
            .where(and(eq(posts.siteId, siteId), eq(posts.shortcode, vp.shortcode)));
          transcribed++;
        }
        const pct = Math.round(40 + (transcribed / Math.max(videoPosts.length, 1)) * 20);
        await report("transcribe", pct, `Transcribed ${transcribed}/${videoPosts.length} videos`);
      }

      await updateJob(siteId, "transcribe", "completed", 100, `Transcribed ${transcribed} videos`);
    } else {
      await report("transcribe", 60, "Skipping transcription (upgrade to Creator for this feature)");
      await updateJob(siteId, "transcribe", "completed", 100, "Transcription not available on Free plan");
    }

    // ── Step 4: CATEGORIZE ──────────────────────────────────────────
    currentStep = "categorize";
    await report("categorize", 60, "Categorizing posts...");
    await updateJob(siteId, "categorize", "running", 60, "Categorizing posts...");

    // Detect categories — Pro+ uses Claude AI; Free/Creator get a default set
    const allCaptions = scrapedPosts.map((p) => p.caption).filter(Boolean);
    let detectedCategories = canAutoCategorize
      ? await detectCategories(allCaptions)
      : ["General", "Updates", "Featured"];
    // Always include "Uncategorized" so keyword/LLM fallbacks don't produce orphan categories
    if (!detectedCategories.includes("Uncategorized")) {
      detectedCategories = [...detectedCategories, "Uncategorized"];
    }

    // Update site with categories
    await database.update(sites)
      .set({ categories: detectedCategories })
      .where(eq(sites.id, siteId));

    // Limit to 1000 posts per pipeline run to avoid OOM
    const dbPosts = await database.query.posts.findMany({
      where: eq(posts.siteId, siteId),
      limit: 1000,
    });
    const BATCH_SIZE = 5;
    let categorized = 0;

    // Pre-build keyword rules for fallback categorization
    const keywordRules: Record<string, string[]> = canAutoCategorize ? {} : {
      General: ["update", "news", "today"],
      Updates: ["new", "launch", "release"],
      Featured: ["best", "top", "favorite"],
    };

    for (let i = 0; i < dbPosts.length; i += BATCH_SIZE) {
      const batch = dbPosts.slice(i, i + BATCH_SIZE);
      // Per-post try-catch so one failure doesn't kill the entire batch.
      // Posts that fail to categorize stay as "Uncategorized".
      await Promise.all(
        batch.map(async (post) => {
          try {
            const result = canAutoCategorize
              ? await categorizeWithLLM(post.caption, post.transcript, detectedCategories)
              : categorizeByKeywords(post.caption, post.transcript, keywordRules);
            await database.update(posts)
              .set({ category: result.category })
              .where(eq(posts.id, post.id));
          } catch (err) {
            console.error(`[runner] Failed to categorize post ${post.id}:`, err);
          }
        }),
      );
      categorized += batch.length;
      const pct = Math.round(60 + (categorized / dbPosts.length) * 25);
      await report("categorize", pct, `Categorized ${categorized}/${dbPosts.length} posts`);
    }

    await updateJob(siteId, "categorize", "completed", 100, `Categorized into ${detectedCategories.length} categories`);

    // ── Step 5: PUBLISH ─────────────────────────────────────────────
    currentStep = "complete";
    await report("complete", 90, "Publishing your directory...");
    await updateJob(siteId, "complete", "running", 90, "Publishing...");

    await db.update(sites)
      .set({ isPublished: true, lastSyncAt: new Date() })
      .where(eq(sites.id, siteId));

    await updateJob(siteId, "complete", "completed", 100, "Your directory is ready!");
    await report("complete", 100, "Your directory is ready!");
  } catch (error) {
    console.error(`[pipeline] Error in ${currentStep}:`, error);
    const message = error instanceof Error ? error.message : "Pipeline failed";
    await updateJob(siteId, currentStep, "failed", 0, message);
    throw error;
  }
}

async function updateJob(siteId: string, step: string, status: string, progress: number, message: string) {
  if (!db) return;

  // Upsert the pipeline job for this site+step combination
  const existing = await db.query.pipelineJobs.findFirst({
    where: and(eq(pipelineJobs.siteId, siteId), eq(pipelineJobs.step, step)),
  });

  if (existing) {
    await db.update(pipelineJobs)
      .set({ status, progress, message, completedAt: status === "completed" ? new Date() : null })
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
