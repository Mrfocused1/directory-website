/**
 * Pipeline Runner — orchestrates the full content pipeline
 *
 * Steps: scrape → store media → transcribe → categorize → publish
 *
 * Can be called directly or via Inngest for background execution.
 */

import { db } from "@/db";
import { sites, posts, pipelineJobs, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { scrapeProfile } from "./scraper";
import { uploadThumbnail, uploadMedia } from "./storage";
import { transcribeVideo } from "./transcriber";
import { categorizeWithLLM, detectCategories, categorizeByKeywords } from "./categorizer";
import { extractReferencesForPosts } from "./references";
import { references as referencesTable } from "@/db/schema";
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
  const canExtractReferences = hasFeature(userPlan, "references");
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
      // Mark every remaining step as completed so the client's
      // `allCompleted` check passes and polling terminates.
      await updateJob(siteId, "transcribe", "completed", 100, "No posts to transcribe");
      await updateJob(siteId, "categorize", "completed", 100, "No posts to categorize");
      await updateJob(siteId, "complete", "completed", 100, "No posts found — directory is empty");
      await db.update(sites).set({ isPublished: true }).where(eq(sites.id, siteId));
      return;
    }

    // ── Step 2: STORE MEDIA ─────────────────────────────────────────
    currentStep = "transcribe";
    await report("transcribe", 10, "Uploading media...");
    await updateJob(siteId, "transcribe", "running", 10, "Uploading media...");

    // For sortOrder of newly-inserted posts: append after any posts the
    // creator already manually reordered. If we left sortOrder=0 (the
    // column default) on every new insert, fresh posts would collide
    // with all existing reordered ones at position 0 and the order
    // would be ambiguous. Instead we start above the current max.
    const [maxRow] = await database
      .select({ max: sql<number>`coalesce(max(${posts.sortOrder}), -1)` })
      .from(posts)
      .where(eq(posts.siteId, siteId));
    let nextSortOrder = (maxRow?.max ?? -1) + 1;

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

      await database.insert(posts).values({
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
      }).onConflictDoNothing();

      const pct = Math.round(10 + (i / scrapedPosts.length) * 30);
      await report("transcribe", pct, `Uploaded ${i + 1}/${scrapedPosts.length}...`);
    }

    // ── Step 3: TRANSCRIBE (Creator+ plans only) ────────────────────
    if (canTranscribe) {
      await report("transcribe", 40, "Transcribing videos...");
      await updateJob(siteId, "transcribe", "running", 40, "Transcribing videos...");

      // Fetch the permanent Vercel Blob URLs from the DB. The Apify
      // mediaUrls[0] is a signed Instagram CDN URL that often returns
      // 403 to Deepgram (Deepgram's IP isn't on Instagram's whitelist
      // and the signed token expires fast). The uploaded Blob URL is
      // public and stable.
      const videoPostRows = await database.query.posts.findMany({
        where: eq(posts.siteId, siteId),
        columns: { id: true, shortcode: true, type: true, mediaUrl: true },
      });
      const videoPosts = videoPostRows.filter(
        (p) => p.type === "video" && p.mediaUrl,
      );
      let transcribed = 0;
      let transcribeErrors = 0;

      for (const vp of videoPosts) {
        try {
          const result = await transcribeVideo(vp.mediaUrl as string);
          if (result.text) {
            await database
              .update(posts)
              .set({
                transcript: result.text,
                transcriptSegments: result.segments,
              })
              .where(eq(posts.id, vp.id));
            transcribed++;
          } else {
            transcribeErrors++;
            console.warn(
              `[runner] transcription empty for ${vp.shortcode} (Deepgram returned no text)`,
            );
          }
        } catch (err) {
          transcribeErrors++;
          console.error(
            `[runner] transcription failed for ${vp.shortcode}:`,
            err instanceof Error ? err.message : err,
          );
        }
        const pct = Math.round(
          40 + ((transcribed + transcribeErrors) / Math.max(videoPosts.length, 1)) * 20,
        );
        await report(
          "transcribe",
          pct,
          `Transcribed ${transcribed}/${videoPosts.length} (${transcribeErrors} failed)`,
        );
      }

      const summary =
        transcribeErrors > 0
          ? `Transcribed ${transcribed}/${videoPosts.length} videos (${transcribeErrors} failed)`
          : `Transcribed ${transcribed} videos`;
      await updateJob(siteId, "transcribe", "completed", 100, summary);
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

    // ── Step 4.5: REFERENCES (Creator+ plans only) ──────────────────
    // Extract any YouTube videos / article URLs that appear in the
    // post's caption or transcript. Non-fatal: if this fails or times
    // out per-post, we still publish the directory — refs are a nice-
    // to-have, not a blocker.
    if (canExtractReferences) {
      await report("references", 85, "Finding references...");
      try {
        const refPosts = await database.query.posts.findMany({
          where: eq(posts.siteId, siteId),
          columns: { id: true, caption: true, transcript: true },
          limit: 1000,
        });
        const rows = await extractReferencesForPosts(
          refPosts.map((p) => ({
            postId: p.id,
            caption: p.caption || "",
            transcript: p.transcript,
          })),
          (done, total) => {
            const pct = Math.round(85 + (done / Math.max(total, 1)) * 4);
            void report("references", pct, `Found references for ${done}/${total}`);
          },
        );

        // Group new refs by post so we can do a clean wipe-then-insert
        // per post. The references table has no natural unique key
        // (kind+url+videoId can all repeat), so onConflictDoNothing
        // doesn't dedupe — without this, every re-sync doubled the
        // refs on every post.
        const byPost = new Map<string, typeof rows>();
        for (const r of rows) {
          if (!byPost.has(r.postId)) byPost.set(r.postId, []);
          byPost.get(r.postId)!.push(r);
        }
        for (const [postId, postRows] of byPost) {
          await database.delete(referencesTable).where(eq(referencesTable.postId, postId));
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
        console.error("[runner] references step failed (non-fatal):", err);
      }
    }

    // ── Step 5: PUBLISH ─────────────────────────────────────────────
    currentStep = "complete";
    await report("complete", 90, "Publishing your directory...");
    await updateJob(siteId, "complete", "running", 90, "Publishing...");

    await database.update(sites)
      .set({ isPublished: true, lastSyncAt: new Date() })
      .where(eq(sites.id, siteId));

    await updateJob(siteId, "complete", "completed", 100, "Your directory is ready!");
    await report("complete", 100, "Your directory is ready!");

    // Notify the site owner by email (non-blocking)
    try {
      const { resend } = await import("@/lib/email/resend");
      const { pipelineCompleteNotification } = await import("@/lib/email/templates");
      if (resend && owner) {
        const ownerFull = await database.query.users.findFirst({
          where: eq(users.id, site.userId),
          columns: { email: true },
        });
        const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://buildmy.directory";
        if (ownerFull?.email) {
          const postCount = scrapedPosts.length;
          const template = pipelineCompleteNotification({
            siteName: site.displayName || site.slug,
            siteUrl: `${publicOrigin}/${site.slug}`,
            postCount,
          });
          await resend.emails.send({
            from: "BuildMy.Directory <hello@buildmy.directory>",
            to: ownerFull.email,
            subject: template.subject,
            html: template.html,
          });
        }
      }
    } catch (notifyErr) {
      console.error("[pipeline] Owner completion notification failed:", notifyErr);
    }
  } catch (error) {
    console.error(`[pipeline] Error in ${currentStep}:`, error);
    const message = error instanceof Error ? error.message : "Pipeline failed";
    await updateJob(siteId, currentStep, "failed", 0, message);
    throw error;
  }
}

async function updateJob(siteId: string, step: string, status: string, progress: number, message: string) {
  if (!db) return;

  // When a step fails, persist the message into the `error` column too —
  // the GET /api/pipeline status endpoint reads from `error` to surface the
  // reason back to the onboarding UI. Clear it again on non-failed writes so
  // a successful retry doesn't keep showing a stale error.
  const error = status === "failed" ? message : null;

  // Upsert the pipeline job for this site+step combination
  const existing = await db.query.pipelineJobs.findFirst({
    where: and(eq(pipelineJobs.siteId, siteId), eq(pipelineJobs.step, step)),
  });

  if (existing) {
    await db.update(pipelineJobs)
      .set({
        status,
        progress,
        message,
        error,
        completedAt: status === "completed" ? new Date() : null,
      })
      .where(eq(pipelineJobs.id, existing.id));
  } else {
    await db.insert(pipelineJobs).values({
      siteId,
      step,
      status,
      progress,
      message,
      error,
      startedAt: new Date(),
    });
  }
}
