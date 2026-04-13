/**
 * Content Scraper Module
 *
 * Handles scraping posts from Instagram and TikTok.
 * In production, this should use official APIs where possible:
 * - Instagram Graph API (requires Facebook app approval)
 * - TikTok Research API or Display API
 *
 * Fallback: Playwright-based browser-based scraping
 * but this is fragile and rate-limited at scale.
 */

export type ScrapedPost = {
  shortcode: string;
  type: "video" | "image" | "carousel";
  caption: string;
  takenAt: Date;
  mediaUrls: string[];
  thumbUrl: string;
  numSlides: number;
};

export type ScraperConfig = {
  platform: "instagram" | "tiktok";
  handle: string;
  maxPosts?: number;
};

export async function scrapeProfile(config: ScraperConfig): Promise<ScrapedPost[]> {
  const { platform, handle } = config;

  if (platform === "instagram") {
    return scrapeInstagram(handle, config.maxPosts);
  } else {
    return scrapeTikTok(handle, config.maxPosts);
  }
}

async function scrapeInstagram(handle: string, maxPosts = 100): Promise<ScrapedPost[]> {
  // TODO: Implement Instagram scraping
  //
  // Option A (recommended for production): Instagram Graph API
  //   - Requires a Facebook App and user authorization
  //   - GET /{user-id}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink
  //   - Handles pagination automatically
  //   - Rate limited to 200 calls/hour per user
  //
  // Option B (fallback): Playwright browser-based scraping
  //   - Uses pw_scrape.py approach: scroll profile, harvest shortcodes
  //   - Then fetch each post via OG meta tags with Googlebot UA
  //   - Fragile — Instagram changes their markup frequently
  //   - Rate limited — need proxies for scale
  //
  // Option C: Third-party API (Apify, RapidAPI, etc.)
  //   - Most reliable for MVP
  //   - Costs per request but handles all edge cases

  console.log(`[scraper] Would scrape Instagram @${handle} (max ${maxPosts} posts)`);
  return [];
}

async function scrapeTikTok(handle: string, maxPosts = 100): Promise<ScrapedPost[]> {
  // TODO: Implement TikTok scraping
  //
  // Option A: TikTok Research API (requires approval)
  //   - GET /user/info/ and /user/posts/
  //
  // Option B: TikTok Display API
  //   - Requires OAuth flow
  //   - Limited to user's own content
  //
  // Option C: Third-party API

  console.log(`[scraper] Would scrape TikTok @${handle} (max ${maxPosts} posts)`);
  return [];
}
