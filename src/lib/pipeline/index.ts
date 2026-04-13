/**
 * Pipeline Orchestrator
 *
 * Coordinates the full content pipeline:
 *   scrape → transcribe → categorize → find references → publish
 *
 * In production, each step should be a separate background job
 * (using BullMQ, Inngest, or similar) so they can:
 * - Retry on failure
 * - Report progress
 * - Run with concurrency limits
 * - Be monitored and debugged
 */

import { scrapeProfile } from "./scraper";
import { transcribeBatch } from "./transcriber";
import { categorizeByKeywords, detectCategories } from "./categorizer";
import { findReferencesForPosts } from "./references";

export type PipelineConfig = {
  siteId: string;
  platform: "instagram" | "tiktok";
  handle: string;
  maxPosts?: number;
  onProgress?: (step: string, progress: number, message: string) => void;
};

export async function runPipeline(config: PipelineConfig) {
  const { platform, handle, onProgress } = config;

  // ─── Step 1: Scrape ──────────────────────────────────────────
  onProgress?.("scrape", 0, "Scraping your content...");

  const scrapedPosts = await scrapeProfile({
    platform,
    handle,
    maxPosts: config.maxPosts,
  });

  onProgress?.("scrape", 100, `Found ${scrapedPosts.length} posts`);

  // TODO: Save scraped posts to the database
  // TODO: Upload media to blob storage

  // ─── Step 2: Transcribe ──────────────────────────────────────
  onProgress?.("transcribe", 0, "Transcribing videos...");

  const videoPosts = scrapedPosts
    .filter((p) => p.type === "video" && p.mediaUrls[0])
    .map((p) => ({ postId: p.shortcode, videoUrl: p.mediaUrls[0] }));

  const transcripts = await transcribeBatch(videoPosts, (done, total) => {
    onProgress?.("transcribe", Math.round((done / total) * 100), `Transcribed ${done}/${total} videos`);
  });

  // TODO: Save transcripts to the database

  // ─── Step 3: Categorize ──────────────────────────────────────
  onProgress?.("categorize", 0, "Categorizing posts...");

  // First, detect categories from the content
  const captions = scrapedPosts.map((p) => p.caption);
  const suggestedCategories = await detectCategories(captions);

  // Build keyword rules from detected categories
  // In production, the user would customize these
  const categoryRules: Record<string, string[]> = {};
  for (const cat of suggestedCategories) {
    categoryRules[cat] = [cat.toLowerCase()];
  }

  // Categorize each post
  for (const post of scrapedPosts) {
    const transcript = transcripts.get(post.shortcode)?.text || null;
    const result = categorizeByKeywords(post.caption, transcript, categoryRules);
    // TODO: Update post category in database
    // Categorized: post.shortcode → result.category
  }

  onProgress?.("categorize", 100, `Categorized ${scrapedPosts.length} posts`);

  // ─── Step 4: Find References ─────────────────────────────────
  onProgress?.("references", 0, "Finding references...");

  const postsForRefs = scrapedPosts.map((p) => ({
    postId: p.shortcode,
    caption: p.caption,
    transcript: transcripts.get(p.shortcode)?.text || null,
  }));

  await findReferencesForPosts(postsForRefs, (done, total) => {
    onProgress?.("references", Math.round((done / total) * 100), `Found references for ${done}/${total} posts`);
  });

  // TODO: Save references to the database

  // ─── Step 5: Publish ─────────────────────────────────────────
  onProgress?.("complete", 0, "Publishing your directory...");

  // TODO: Set site.isPublished = true in database
  // TODO: Trigger ISR revalidation for the tenant pages

  onProgress?.("complete", 100, "Your directory is live!");

  return {
    postsProcessed: scrapedPosts.length,
    videosTranscribed: videoPosts.length,
    categoriesDetected: suggestedCategories,
  };
}
