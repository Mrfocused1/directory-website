/**
 * Content Scraper Module — powered by Apify
 *
 * Uses Apify actors to scrape Instagram and TikTok profiles.
 * Actors used:
 * - Instagram: apify/instagram-profile-scraper
 * - TikTok: clockworks/tiktok-profile-scraper
 */

import { ApifyClient } from "apify-client";

const apify = process.env.APIFY_API_TOKEN
  ? new ApifyClient({ token: process.env.APIFY_API_TOKEN })
  : null;

export type ScrapedPost = {
  shortcode: string;
  type: "video" | "image" | "carousel";
  caption: string;
  takenAt: Date;
  mediaUrls: string[];
  thumbUrl: string;
  numSlides: number;
  platformUrl: string;
};

export type ScraperConfig = {
  platform: "instagram" | "tiktok";
  handle: string;
  maxPosts?: number;
};

export async function scrapeProfile(config: ScraperConfig): Promise<ScrapedPost[]> {
  if (!apify) {
    console.warn("[scraper] Apify not configured — returning empty results");
    return [];
  }

  const { platform, handle } = config;
  const maxPosts = config.maxPosts || 50;

  if (platform === "instagram") {
    return scrapeInstagram(handle, maxPosts);
  } else {
    return scrapeTikTok(handle, maxPosts);
  }
}

async function scrapeInstagram(handle: string, maxPosts: number): Promise<ScrapedPost[]> {
  if (!apify) return [];

  const cleanHandle = handle.replace(/^@/, "");

  let items: Record<string, unknown>[] = [];
  try {
    const run = await apify.actor("apify/instagram-profile-scraper").call({
      usernames: [cleanHandle],
      resultsLimit: maxPosts,
      addParentData: false,
    });
    const result = await apify.dataset(run.defaultDatasetId).listItems();
    items = result.items;
  } catch (error) {
    console.error("[scraper] Apify Instagram error:", error);
    throw new Error(`Failed to scrape Instagram profile @${cleanHandle}. Please check the handle and try again.`);
  }

  return items.map((item: Record<string, unknown>) => {
    const shortcode = (item.shortCode as string) || (item.id as string) || `ig-${Date.now()}`;
    const type = item.type === "Video"
      ? "video"
      : item.type === "Sidecar"
        ? "carousel"
        : "image";

    const mediaUrls: string[] = [];
    if (item.videoUrl) mediaUrls.push(item.videoUrl as string);
    if (item.displayUrl) mediaUrls.push(item.displayUrl as string);
    if (Array.isArray(item.images)) {
      mediaUrls.push(...(item.images as string[]));
    }

    return {
      shortcode,
      type,
      caption: (item.caption as string) || "",
      takenAt: new Date((item.timestamp as string) || Date.now()),
      mediaUrls,
      thumbUrl: (item.displayUrl as string) || (item.thumbnailUrl as string) || "",
      numSlides: type === "carousel" && Array.isArray(item.childPosts) ? item.childPosts.length : 0,
      platformUrl: (item.url as string) || `https://www.instagram.com/p/${shortcode}/`,
    } satisfies ScrapedPost;
  });
}

async function scrapeTikTok(handle: string, maxPosts: number): Promise<ScrapedPost[]> {
  if (!apify) return [];

  const cleanHandle = handle.replace(/^@/, "");

  let items: Record<string, unknown>[] = [];
  try {
    const run = await apify.actor("clockworks/tiktok-profile-scraper").call({
      profiles: [cleanHandle],
      resultsPerPage: maxPosts,
    });
    const result = await apify.dataset(run.defaultDatasetId).listItems();
    items = result.items;
  } catch (error) {
    console.error("[scraper] Apify TikTok error:", error);
    throw new Error(`Failed to scrape TikTok profile @${cleanHandle}. Please check the handle and try again.`);
  }

  return items.map((item: Record<string, unknown>) => {
    const id = (item.id as string) || `tt-${Date.now()}`;

    return {
      shortcode: id,
      type: "video" as const,
      caption: (item.text as string) || (item.desc as string) || "",
      takenAt: new Date(((item.createTime as number) || 0) * 1000 || Date.now()),
      mediaUrls: [(item.videoUrl as string) || (item.video as Record<string, unknown>)?.downloadAddr as string || ""].filter(Boolean),
      thumbUrl: (item.coverUrl as string) || (item.video as Record<string, unknown>)?.cover as string || "",
      numSlides: 0,
      platformUrl: (item.webVideoUrl as string) || `https://www.tiktok.com/@${cleanHandle}/video/${id}`,
    } satisfies ScrapedPost;
  });
}
