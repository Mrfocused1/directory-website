/**
 * Pipeline Runner — orchestrates the full content pipeline
 *
 * Steps: scrape → store media → transcribe → categorize → publish
 *
 * Can be called directly or via Inngest for background execution.
 */

import { db } from "@/db";
import { sites, posts, pipelineJobs, users } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { scrapeProfile } from "./scraper";
import { uploadThumbnail, uploadMedia } from "./storage";
import { transcribeVideo } from "./transcriber";
import { categorizeBatchWithLLM, detectCategories, categorizeByKeywords } from "./categorizer";
import { extractTalkingPoints } from "./talking-points";
import { extractReferencesForPosts } from "./references";
import { references as referencesTable } from "@/db/schema";
import { hasFeature, getPlan, type PlanId } from "@/lib/plans";
import { captureError } from "@/lib/error";

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

    // ── INCREMENTAL SYNC ────────────────────────────────────────────
    // On a re-run (sync), most posts already exist in the DB. Filter
    // down to only the shortcodes we haven't seen before so we don't
    // pay Groq/Apify/Claude for work we've already done.
    const existingRows = await database
      .select({ shortcode: posts.shortcode })
      .from(posts)
      .where(eq(posts.siteId, siteId));
    const existingShortcodes = new Set(existingRows.map((r) => r.shortcode));
    const newPosts = scrapedPosts.filter((p) => !existingShortcodes.has(p.shortcode));
    const isSync = existingShortcodes.size > 0;
    if (isSync) {
      await updateJob(
        siteId,
        "scrape",
        "completed",
        100,
        `Scraped ${scrapedPosts.length} posts · ${newPosts.length} new`,
      );
    }

    if (scrapedPosts.length === 0) {
      // Mark every remaining step as completed so the client's
      // `allCompleted` check passes and polling terminates.
      await updateJob(siteId, "transcribe", "completed", 100, "No posts to transcribe");
      await updateJob(siteId, "categorize", "completed", 100, "No posts to categorize");
      await updateJob(siteId, "complete", "completed", 100, "No posts found — directory is empty");
      await db.update(sites).set({ isPublished: true }).where(eq(sites.id, siteId));
      return;
    }

    // Determine which posts need uploading before filtering
    let postsToUpload = isSync ? newPosts : scrapedPosts;

    // ── Step 1.5: RELEVANCE FILTER ───────────────────────────────────
    // Use Claude to filter out posts that don't match the account's core
    // topic. Personal posts (birthdays, selfies, memes) get marked as
    // not visible so they don't appear in the directory. This runs BEFORE
    // media upload to avoid wasting money on irrelevant content.
    if (canAutoCategorize && postsToUpload.length > 0) {
      await report("scrape", 100, "Filtering irrelevant posts...");
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          // Sample captions to determine account niche
          const sampleCaptions = scrapedPosts.slice(0, 20).map((p) => p.caption.slice(0, 150)).filter((c) => c.length > 20).join("\n");
          const nicheRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 100,
              messages: [{ role: "user", content: `What is the primary niche/topic of this Instagram account? Answer in 2-5 words only.\n\n${sampleCaptions}` }],
            }),
            signal: AbortSignal.timeout(10_000),
          });
          const niche = nicheRes.ok ? ((await nicheRes.json()).content?.[0]?.text || "").trim() : "general content";

          // Batch filter posts for relevance (20 per call)
          const FILTER_BATCH = 20;
          const irrelevantShortcodes = new Set<string>();

          for (let fi = 0; fi < postsToUpload.length; fi += FILTER_BATCH) {
            const batch = postsToUpload.slice(fi, fi + FILTER_BATCH);
            const batchCaptions = batch.map((p, idx) => `[${idx}] ${p.caption.slice(0, 300)}`).join("\n\n");

            const filterRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 400,
                messages: [{ role: "user", content: `This account's niche is: ${niche}\n\nFor each post, output ONLY a JSON array of indices that are OFF-TOPIC (personal posts, birthdays, selfies, memes, unrelated lifestyle content that doesn't fit the niche). Empty array [] if all posts are relevant.\n\nPosts:\n${batchCaptions}` }],
              }),
              signal: AbortSignal.timeout(15_000),
            });

            if (filterRes.ok) {
              const filterData = await filterRes.json();
              const filterText = (filterData.content?.[0]?.text || "").trim();
              const match = filterText.match(/\[[\s\S]*?\]/);
              if (match) {
                try {
                  const indices = JSON.parse(match[0]);
                  if (Array.isArray(indices)) {
                    for (const idx of indices) {
                      if (typeof idx === "number" && idx >= 0 && idx < batch.length) {
                        irrelevantShortcodes.add(batch[idx].shortcode);
                      }
                    }
                  }
                } catch {}
              }
            }
          }

          if (irrelevantShortcodes.size > 0) {
            // Remove irrelevant posts from the upload list
            const before = postsToUpload.length;
            postsToUpload = postsToUpload.filter((p) => !irrelevantShortcodes.has(p.shortcode));
            console.log(`[pipeline] Filtered out ${before - postsToUpload.length} irrelevant posts (${postsToUpload.length} remaining)`);
            await report("scrape", 100, `Filtered ${before - postsToUpload.length} off-topic posts`);
          }
        } catch (err) {
          console.warn("[pipeline] Relevance filter failed (non-fatal):", err instanceof Error ? err.message : err);
        }
      }
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

    // Insert posts into DB and upload media — only NEW shortcodes.
    // Existing posts already have stable Blob URLs, so re-uploading
    // would burn bandwidth + $ for no gain. onConflictDoNothing() on
    // the insert is the final safety net.
    // postsToUpload already declared above (before relevance filter)
    if (postsToUpload.length === 0) {
      await report("transcribe", 40, "No new posts to upload");
    }
    for (let i = 0; i < postsToUpload.length; i++) {
      const p = postsToUpload[i];

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

      const pct = Math.round(10 + (i / postsToUpload.length) * 30);
      await report("transcribe", pct, `Uploaded ${i + 1}/${postsToUpload.length}...`);
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
        columns: { id: true, shortcode: true, type: true, mediaUrl: true, transcript: true },
      });
      // On sync: skip any video that already has a non-trivial transcript.
      // Initial build: transcribe everything (transcript is null). Saves
      // ~$0.003/video on Groq + wall-clock time when the user re-syncs
      // and most content is unchanged.
      const videoPosts = videoPostRows.filter(
        (p) =>
          p.type === "video" &&
          p.mediaUrl &&
          (!p.transcript || p.transcript.length < 50),
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
              `[runner] transcription empty for ${vp.shortcode} (all providers returned no text — likely music-only reel). url=${(vp.mediaUrl as string).slice(0, 100)}`,
            );
          }
        } catch (err) {
          transcribeErrors++;
          captureError(err, { step: "transcribe", shortcode: vp.shortcode, siteId });
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

    // ── Step 3b: TALKING POINTS (post-transcription) ─────────────────
    // Analyze transcribed videos to extract intelligent talking points
    // (numbered tips, topic transitions, key arguments) instead of
    // raw 30-second audio chunks.
    if (canTranscribe) {
      const transcribedPosts = await database.query.posts.findMany({
        where: and(eq(posts.siteId, siteId), eq(posts.type, "video")),
        columns: { id: true, shortcode: true, transcript: true, transcriptSegments: true },
      });
      const postsWithSegments = transcribedPosts.filter(
        (p) => p.transcript && p.transcriptSegments && Array.isArray(p.transcriptSegments) && p.transcriptSegments.length > 0,
      );

      for (const tp of postsWithSegments) {
        try {
          const rawSegments = tp.transcriptSegments as { start: number; end: number; text: string }[];
          const talkingPoints = await extractTalkingPoints(rawSegments, tp.transcript!);
          if (talkingPoints.length > 0) {
            await database.update(posts)
              .set({ transcriptSegments: talkingPoints })
              .where(eq(posts.id, tp.id));
          }
        } catch {
          // Keep raw segments as fallback
        }
      }
    }

    // ── Step 4: CATEGORIZE ──────────────────────────────────────────
    currentStep = "categorize";
    await report("categorize", 60, "Categorizing posts...");
    await updateJob(siteId, "categorize", "running", 60, "Categorizing posts...");

    // Detect categories — Pro+ uses Claude AI; Free/Creator get a default set.
    // On sync: if the site already has detected categories, reuse them
    // instead of re-inferring (saves one Claude call and keeps the
    // creator's existing tabs stable). We still categorize any posts
    // that are "Uncategorized" into the existing buckets.
    const existingCategories =
      isSync && Array.isArray(site.categories) && site.categories.length > 0
        ? (site.categories as string[])
        : null;
    const allCaptions = scrapedPosts.map((p) => p.caption).filter(Boolean);
    let detectedCategories =
      existingCategories ??
      (canAutoCategorize ? await detectCategories(allCaptions) : ["General", "Updates", "Featured"]);
    // Always include "Uncategorized" so keyword/LLM fallbacks don't produce orphan categories
    if (!detectedCategories.includes("Uncategorized")) {
      detectedCategories = [...detectedCategories, "Uncategorized"];
    }

    // Update site with categories
    if (!existingCategories) {
      await database.update(sites)
        .set({ categories: detectedCategories })
        .where(eq(sites.id, siteId));
    }

    // On sync: only categorize posts that are still "Uncategorized" —
    // typically just the newly-inserted ones. On initial build the
    // DB-stored category defaults to "Uncategorized" for every post.
    const dbPosts = await database.query.posts.findMany({
      where: isSync
        ? and(eq(posts.siteId, siteId), eq(posts.category, "Uncategorized"))
        : eq(posts.siteId, siteId),
      limit: 1000,
    });
    // Batch size = 25 posts per Claude call. Haiku comfortably handles
    // this volume of short captions in a single prompt, and we avoid
    // the per-call overhead of the old one-post-at-a-time loop.
    const BATCH_SIZE = 25;
    let categorized = 0;

    // Pre-build keyword rules for fallback categorization
    const keywordRules: Record<string, string[]> = canAutoCategorize ? {} : {
      General: ["update", "news", "today"],
      Updates: ["new", "launch", "release"],
      Featured: ["best", "top", "favorite"],
    };

    for (let i = 0; i < dbPosts.length; i += BATCH_SIZE) {
      const batch = dbPosts.slice(i, i + BATCH_SIZE);
      try {
        if (canAutoCategorize) {
          const results = await categorizeBatchWithLLM(
            batch.map((p) => ({ caption: p.caption, transcript: p.transcript })),
            detectedCategories,
          );
          // Update in parallel — just DB round-trips now, not API calls
          await Promise.all(
            batch.map((post, idx) => {
              const result = results[idx];
              const updates: Record<string, unknown> = {
                category: result?.category || detectedCategories[0],
              };
              // Save the AI-generated summary
              if (result?.summary && result.summary.length > 0) {
                updates.summary = result.summary;
              }
              // Save the AI-generated title if it's meaningful and better
              // than the naive caption-first-line fallback
              if (result?.title && result.title.length > 0) {
                const captionFirstLine = (post.caption?.split("\n")[0] || "").slice(0, 80);
                const isSameAsCaption =
                  result.title.toLowerCase() === captionFirstLine.toLowerCase();
                if (!isSameAsCaption) {
                  updates.title = result.title.slice(0, 100);
                }
              }
              return database
                .update(posts)
                .set(updates)
                .where(eq(posts.id, post.id));
            }),
          );
        } else {
          await Promise.all(
            batch.map(async (post) => {
              const result = categorizeByKeywords(post.caption, post.transcript, keywordRules);
              await database
                .update(posts)
                .set({ category: result.category })
                .where(eq(posts.id, post.id));
            }),
          );
        }
      } catch (err) {
        // If the entire batch call fails, leave posts as "Uncategorized"
        // and continue — one slow Claude call shouldn't break the run.
        captureError(err, { step: "categorize", batchSize: batch.length, siteId });
      }
      categorized += batch.length;
      const pct = Math.round(60 + (categorized / dbPosts.length) * 25);
      await report("categorize", pct, `Categorized ${categorized}/${dbPosts.length} posts`);
    }

    await updateJob(siteId, "categorize", "completed", 100, `Categorized into ${detectedCategories.length} categories`);

    // ── Reconcile sites.categories with actual post categories ──────
    // After categorization, posts may have categories that differ from
    // sites.categories (e.g. LLM assigned a new label, or some
    // categories are no longer used). Query the distinct set from posts
    // and update sites.categories — preserving existing order and
    // appending new ones at the end.
    const distinctRows = await database
      .selectDistinct({ category: posts.category })
      .from(posts)
      .where(eq(posts.siteId, siteId));
    const actualCategories = new Set(distinctRows.map((r) => r.category));
    const currentSiteCategories: string[] = (
      await database.query.sites.findFirst({
        where: eq(sites.id, siteId),
        columns: { categories: true },
      })
    )?.categories as string[] ?? [];
    // Keep existing order for categories still in use, then append new ones
    const reconciledCategories = [
      ...currentSiteCategories.filter((c) => actualCategories.has(c)),
      ...[...actualCategories].filter((c) => !currentSiteCategories.includes(c)),
    ];
    await database.update(sites)
      .set({ categories: reconciledCategories })
      .where(eq(sites.id, siteId));

    // ── Step 4.5: REFERENCES (Creator+ plans only) ──────────────────
    // Extract any YouTube videos / article URLs that appear in the
    // post's caption or transcript. Non-fatal: if this fails or times
    // out per-post, we still publish the directory — refs are a nice-
    // to-have, not a blocker.
    if (canExtractReferences) {
      await report("references", 85, "Finding references...");
      try {
        // On sync: run references for NEW posts AND existing posts that
        // have zero references (meaning they failed last time). This
        // ensures a SearXNG outage doesn't permanently leave posts
        // without references.
        const newShortcodes = new Set(newPosts.map((p) => p.shortcode));
        const refPosts = await database.query.posts.findMany({
          where: eq(posts.siteId, siteId),
          columns: { id: true, caption: true, transcript: true, shortcode: true },
          limit: 1000,
        });

        let refTargets: typeof refPosts;
        if (isSync) {
          // Find posts that have zero references
          const postIds = refPosts.map((p) => p.id);
          const existingRefs = postIds.length > 0
            ? await database.query.references.findMany({
                where: inArray(referencesTable.postId, postIds),
                columns: { postId: true },
              })
            : [];
          const postsWithRefs = new Set(existingRefs.map((r) => r.postId));
          refTargets = refPosts.filter(
            (p) => newShortcodes.has(p.shortcode) || !postsWithRefs.has(p.id),
          );
        } else {
          refTargets = refPosts;
        }
        const rows = refTargets.length === 0
          ? []
          : await extractReferencesForPosts(
              refTargets.map((p) => ({
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
        console.error("[pipeline] References step failed:", err instanceof Error ? err.message : err);
        captureError(err, { step: "references", siteId });
      }
    }

    // ── Step 5: PUBLISH ─────────────────────────────────────────────
    currentStep = "complete";
    await report("complete", 90, "Publishing your directory...");
    await updateJob(siteId, "complete", "running", 90, "Publishing...");

    await database.update(sites)
      .set({ isPublished: true, lastSyncAt: new Date() })
      .where(eq(sites.id, siteId));

    // Stamp the user's free-build-used flag so they can't delete + re-create
    // on the free plan. Paid plans ignore this field entirely.
    if (userPlan === "free") {
      await database.update(users)
        .set({ freeBuildUsedAt: new Date() })
        .where(eq(users.id, site.userId));
    }

    // Blow away the 5-minute CDN cache on the public tenant root so
    // visitors see the freshly-synced posts immediately instead of
    // up to 5 minutes of stale HTML.
    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath(`/${site.slug}`);
    } catch (err) {
      // revalidatePath throws outside a request context (e.g. when
      // runner is called via Inngest cron from outside Next). That's
      // fine — the cache TTL will expire on its own.
      console.warn("[runner] revalidatePath skipped:", err instanceof Error ? err.message : err);
    }

    await updateJob(siteId, "complete", "completed", 100, "Your directory is ready!");
    await report("complete", 100, "Your directory is ready!");

    // Notify the site owner by email on FIRST build only (not syncs)
    try {
      const { resend } = await import("@/lib/email/resend");
      const { pipelineCompleteNotification } = await import("@/lib/email/templates");
      if (resend && owner && !isSync) {
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
      captureError(notifyErr, { step: "notify", siteId });
    }
  } catch (error) {
    captureError(error, { step: currentStep, siteId });
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
