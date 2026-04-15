/**
 * Content Scraper Module — talks to Apify via direct REST calls
 *
 * Using `fetch` against Apify's HTTP API instead of the `apify-client`
 * SDK. The SDK has a transitive dependency on `proxy-agent` that
 * Next.js/Vercel can't reliably bundle in the serverless output —
 * `apify-client` loads `proxy-agent` via a dynamic require at runtime
 * and it ends up missing from /var/task, crashing the pipeline with
 * `Cannot find module 'proxy-agent'`. The REST API has no such
 * dependency and behaves identically for our use case.
 *
 * Actors used:
 * - Instagram: apify/instagram-scraper (posts, not profile metadata)
 * - TikTok:    clockworks/tiktok-profile-scraper
 */

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

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

/**
 * Call Apify's `run-sync-get-dataset-items` endpoint, which starts an
 * actor run, waits for it to finish, and returns the resulting dataset
 * items in a single HTTP call. This is equivalent to what the SDK's
 * `actor(id).call()` + `dataset(id).listItems()` pair does, but without
 * the SDK's problematic transitive deps.
 *
 * Timeout: we give the call up to 4 minutes; anything longer and we
 * surface a clear timeout error to the user instead of letting the
 * serverless invocation hit Vercel's own 5-min limit.
 */
async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  timeoutMs = 240_000,
): Promise<Record<string, unknown>[]> {
  if (!APIFY_TOKEN) return [];

  // Actor IDs contain a "/" when sent by the SDK; the REST API uses "~"
  // to separate username and actor name.
  const actorPath = actorId.replace("/", "~");
  // Request 512 MB per run. Apify's default for instagram-scraper is
  // 1024 MB; halving it doubles our concurrent capacity within the
  // same Apify memory budget without any quality hit on small
  // profiles (<100 posts). Combined with the Inngest concurrency:4
  // cap above, 4 × 512 = 2048 MB — comfortably under the 8 GB ceiling.
  const url =
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(APIFY_TOKEN)}&memory=512`;

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(abortTimer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Apify run timed out after 4 minutes");
    }
    throw err;
  }
  clearTimeout(abortTimer);

  if (!res.ok) {
    // Apify returns structured errors with { error: { message } }. Surface
    // that so the user sees the real reason (rate limit, invalid input,
    // actor failure) instead of a generic HTTP code.
    let detail = `Apify returned HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message || body?.error?.type || detail;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) detail = text.slice(0, 180);
    }
    throw new Error(detail);
  }

  const items = await res.json();
  if (!Array.isArray(items)) {
    throw new Error("Unexpected Apify response shape");
  }
  return items as Record<string, unknown>[];
}

export async function scrapeProfile(config: ScraperConfig): Promise<ScrapedPost[]> {
  if (!APIFY_TOKEN) {
    console.warn("[scraper] APIFY_API_TOKEN not set — returning empty results");
    return [];
  }

  const { platform, handle } = config;
  const maxPosts = config.maxPosts || 50;

  if (platform === "instagram") {
    return scrapeInstagram(handle, maxPosts);
  }
  return scrapeTikTok(handle, maxPosts);
}

async function scrapeInstagram(handle: string, maxPosts: number): Promise<ScrapedPost[]> {
  const cleanHandle = handle.replace(/^@/, "");

  let items: Record<string, unknown>[] = [];
  try {
    items = await runApifyActor("apify/instagram-scraper", {
      directUrls: [`https://www.instagram.com/${cleanHandle}/`],
      resultsType: "posts",
      resultsLimit: maxPosts,
      addParentData: false,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[scraper] Apify Instagram error:", detail);
    throw new Error(
      `Instagram scrape failed for @${cleanHandle}: ${detail.slice(0, 180)}`,
    );
  }

  return items.map((item) => {
    const shortcode =
      (item.shortCode as string) || (item.id as string) || `ig-${Date.now()}`;
    const type =
      item.type === "Video"
        ? ("video" as const)
        : item.type === "Sidecar"
          ? ("carousel" as const)
          : ("image" as const);

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
      thumbUrl:
        (item.displayUrl as string) || (item.thumbnailUrl as string) || "",
      numSlides:
        type === "carousel" && Array.isArray(item.childPosts)
          ? (item.childPosts as unknown[]).length
          : 0,
      platformUrl:
        (item.url as string) || `https://www.instagram.com/p/${shortcode}/`,
    } satisfies ScrapedPost;
  });
}

async function scrapeTikTok(handle: string, maxPosts: number): Promise<ScrapedPost[]> {
  const cleanHandle = handle.replace(/^@/, "");

  let items: Record<string, unknown>[] = [];
  try {
    items = await runApifyActor("clockworks/tiktok-profile-scraper", {
      profiles: [cleanHandle],
      resultsPerPage: maxPosts,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[scraper] Apify TikTok error:", detail);
    throw new Error(
      `TikTok scrape failed for @${cleanHandle}: ${detail.slice(0, 180)}`,
    );
  }

  return items.map((item) => {
    const id = (item.id as string) || `tt-${Date.now()}`;
    const video = item.video as Record<string, unknown> | undefined;

    return {
      shortcode: id,
      type: "video" as const,
      caption: (item.text as string) || (item.desc as string) || "",
      takenAt: new Date(
        ((item.createTime as number) || 0) * 1000 || Date.now(),
      ),
      mediaUrls: [
        (item.videoUrl as string) ||
          ((video?.downloadAddr as string) ?? "") ||
          "",
      ].filter(Boolean),
      thumbUrl:
        (item.coverUrl as string) || ((video?.cover as string) ?? ""),
      numSlides: 0,
      platformUrl:
        (item.webVideoUrl as string) ||
        `https://www.tiktok.com/@${cleanHandle}/video/${id}`,
    } satisfies ScrapedPost;
  });
}
