/**
 * Content Scraper — two-tier fallback for Instagram, TikTok disabled.
 *
 * Tier 1: Public `web_profile_info` endpoint. Free, no auth, returns
 *   profile + ~12 latest posts in one HTTP call. Used as a fast seed
 *   so a directory has content even if the VPS is slow or down.
 *
 * Tier 2: Self-hosted VPS (Puppeteer + IPRoyal residential proxy)
 *   paginating through `v1/feed/user/{userId}`. Scrapes hundreds of
 *   posts with proper pacing. Slower, more moving parts, but the only
 *   path that returns more than ~12 posts.
 *
 * Apify has been removed. See git history for the previous fallback.
 */

import { captureError } from "@/lib/error";

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

type IgEdgeNode = {
  shortcode?: string;
  is_video?: boolean;
  __typename?: string;
  display_url?: string;
  video_url?: string;
  thumbnail_src?: string;
  taken_at_timestamp?: number;
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_sidecar_to_children?: { edges?: unknown[] };
};

function nodeToPost(node: IgEdgeNode): ScrapedPost | null {
  if (!node.shortcode) return null;
  const type: ScrapedPost["type"] = node.is_video
    ? "video"
    : node.__typename === "GraphSidecar"
      ? "carousel"
      : "image";
  const mediaUrls: string[] = [];
  if (node.video_url) mediaUrls.push(node.video_url);
  if (node.display_url) mediaUrls.push(node.display_url);
  return {
    shortcode: node.shortcode,
    type,
    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
    takenAt: node.taken_at_timestamp
      ? new Date(node.taken_at_timestamp * 1000)
      : new Date(),
    mediaUrls,
    thumbUrl: node.thumbnail_src || node.display_url || "",
    numSlides: node.edge_sidecar_to_children?.edges?.length || 0,
    platformUrl: `https://www.instagram.com/p/${node.shortcode}/`,
  };
}

async function quickScrapeInstagram(
  handle: string,
  maxPosts: number,
): Promise<ScrapedPost[]> {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "X-IG-App-ID": "936619743392459",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      console.warn(`[scraper] quick tier: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const edges: { node?: IgEdgeNode }[] =
      data?.data?.user?.edge_owner_to_timeline_media?.edges || [];
    const posts: ScrapedPost[] = [];
    for (const edge of edges) {
      if (posts.length >= maxPosts) break;
      const p = edge.node ? nodeToPost(edge.node) : null;
      if (p) posts.push(p);
    }
    return posts;
  } catch (err) {
    console.warn(
      `[scraper] quick tier failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

async function scrapeViaVPS(
  handle: string,
  platform: string,
  maxPosts: number,
): Promise<ScrapedPost[]> {
  const vpsUrl = process.env.SCRAPER_VPS_URL;
  const vpsKey = process.env.SCRAPER_VPS_API_KEY;
  if (!vpsUrl || !vpsKey) {
    throw new Error("VPS scraper not configured (SCRAPER_VPS_URL/SCRAPER_VPS_API_KEY missing)");
  }

  // Scale timeout with post count; hard ceiling 5 min for Vercel budget
  const timeoutMs = Math.min(60_000 + maxPosts * 1500, 300_000);
  console.log(
    `[scraper] VPS ${vpsUrl} → @${handle} (max ${maxPosts}, timeout ${timeoutMs / 1000}s)`,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${vpsUrl}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": vpsKey,
      },
      body: JSON.stringify({ handle, platform, maxPosts }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`VPS returned ${res.status}: ${body.slice(0, 180)}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || "VPS reported failure");
  }

  const rawPosts = Array.isArray(data.posts) ? data.posts : [];
  return rawPosts.map((p: Record<string, unknown>) => ({
    shortcode: (p.shortcode as string) || `vps-${Date.now()}`,
    type:
      p.type === "video"
        ? ("video" as const)
        : p.type === "carousel"
          ? ("carousel" as const)
          : ("image" as const),
    caption: (p.caption as string) || "",
    takenAt: p.takenAt ? new Date(p.takenAt as string) : new Date(),
    mediaUrls: Array.isArray(p.mediaUrls)
      ? (p.mediaUrls as string[])
      : p.videoUrl
        ? [p.videoUrl as string]
        : p.displayUrl
          ? [p.displayUrl as string]
          : [],
    thumbUrl: (p.thumbUrl as string) || (p.displayUrl as string) || "",
    numSlides: (p.numSlides as number) || 0,
    platformUrl: (p.platformUrl as string) || "",
  }));
}

export async function scrapeProfile(config: ScraperConfig): Promise<ScrapedPost[]> {
  const { platform, handle } = config;
  const maxPosts = config.maxPosts || 50;
  const cleanHandle = handle.replace(/^@/, "");

  if (platform === "tiktok") {
    console.warn("[scraper] TikTok scraping is disabled — VPS supports Instagram only");
    return [];
  }

  // Tier 1: fast public-API scrape (up to ~12 posts). Used both as a
  // quick seed and as a safety net if the VPS fails.
  const quickPosts = await quickScrapeInstagram(cleanHandle, maxPosts);
  console.log(`[scraper] tier 1 (public API): ${quickPosts.length} posts`);

  // If the plan only needs what quick already got, skip the VPS.
  // web_profile_info returns ~12 edges, so plans with postLimit ≤ 12
  // (currently Free = 9) finish here in ~5s with zero VPS load.
  if (quickPosts.length >= maxPosts) {
    return quickPosts.slice(0, maxPosts);
  }

  // Tier 2: deep VPS scrape. If it fails, use quick results as fallback.
  let vpsPosts: ScrapedPost[] = [];
  try {
    vpsPosts = await scrapeViaVPS(cleanHandle, platform, maxPosts);
    console.log(`[scraper] tier 2 (VPS): ${vpsPosts.length} posts`);
  } catch (error) {
    captureError(error, { context: "scraper-instagram-deep", handle: cleanHandle });
    console.warn(
      `[scraper] VPS failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (quickPosts.length > 0) {
      console.log(
        `[scraper] returning ${quickPosts.length} tier-1 posts as fallback`,
      );
      return quickPosts;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Instagram scrape failed for @${cleanHandle}: ${detail.slice(0, 180)}`,
    );
  }

  // Merge tiers. VPS entries come first because their payload is richer
  // (video URLs, full carousel children) than edges from web_profile_info.
  const seen = new Set<string>();
  const combined: ScrapedPost[] = [];
  for (const p of [...vpsPosts, ...quickPosts]) {
    if (!seen.has(p.shortcode)) {
      seen.add(p.shortcode);
      combined.push(p);
    }
  }
  return combined.slice(0, maxPosts);
}
