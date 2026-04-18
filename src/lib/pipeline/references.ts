/**
 * Reference Finder — extracts YouTube and article references from each
 * post's caption and video transcript.
 *
 * Strategy:
 *   1. Regex-extract every URL in caption + transcript.
 *   2. Classify each URL: youtube.com / youtu.be / m.youtube.com →
 *      YouTube reference (parse 11-char video id). Everything else →
 *      article reference.
 *   3. Fetch a title:
 *        - YouTube → noembed.com (no API key needed, backed by oEmbed)
 *        - Article → HEAD-style GET with 5s timeout, parse <title>
 *   4. Dedupe by (kind, videoId|url) per post.
 *
 * Output is saved to the `references` table keyed on post_id. The
 * pipeline runner calls findAndStoreReferences for every scraped +
 * transcribed post on plans that include the `references` feature.
 */

import type { Reference } from "@/lib/types";

type PostInput = {
  postId: string;
  caption: string;
  transcript: string | null;
};

export type ReferenceRow = {
  postId: string;
  kind: "youtube" | "article";
  title: string;
  url: string | null; // populated for articles
  videoId: string | null; // populated for youtube
  note: string | null;
};

const URL_REGEX = /https?:\/\/[^\s<>"'()]+/gi;

// Match youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
// youtube.com/embed/ID. Video ids are always 11 chars from [A-Za-z0-9_-].
const YT_WATCH = /youtube\.com\/watch\?[^"]*v=([A-Za-z0-9_-]{11})/i;
const YT_SHORT = /youtu\.be\/([A-Za-z0-9_-]{11})/i;
const YT_SHORTS = /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i;
const YT_EMBED = /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i;

function extractYouTubeId(url: string): string | null {
  for (const re of [YT_WATCH, YT_SHORT, YT_SHORTS, YT_EMBED]) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Strip trailing punctuation that URL_REGEX over-captures. */
function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}>"'“”]+$/g, "");
}

/**
 * Fetch YouTube video metadata via noembed.com (no API key required).
 * Returns title + channel name, or null on any failure.
 */
async function fetchYouTubeMeta(videoId: string): Promise<{ title: string; channel: string } | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string; error?: string };
    if (data.error || !data.title) return null;
    return { title: data.title, channel: data.author_name || "" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch the <title> of an article URL. 5s timeout, 500KB cap, text only.
 */
async function fetchArticleTitle(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 BuildMyDirectoryBot/1.0 (+https://buildmy.directory)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/.test(ct)) return null;
    // Only read the first 500KB to avoid pulling huge pages.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const dec = new TextDecoder();
    let buf = "";
    let read = 0;
    while (read < 512_000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      read += value.length;
      // Early-exit once we've seen </title>
      if (/<\/title>/i.test(buf)) break;
    }
    await reader.cancel().catch(() => null);
    const m = buf.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!m) return null;
    return m[1]
      .replace(/\s+/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
      .slice(0, 200);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─── SearXNG Web Search ─────────────────────────────────────────────

const SEARXNG_URL = process.env.SEARXNG_URL || "";

type SearchResult = { title: string; url: string };

/**
 * Search via self-hosted SearXNG. Returns top results.
 * categories: "general" for articles, "videos" for YouTube.
 */
async function webSearch(query: string, category: "general" | "videos", limit = 5): Promise<SearchResult[]> {
  // Try SearXNG first
  if (SEARXNG_URL) {
    try {
      const params = new URLSearchParams({ q: query, format: "json", categories: category });
      const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []) as { title?: string; url?: string }[];
        const filtered = results.filter((r) => r.title && r.url).slice(0, limit).map((r) => ({ title: r.title!, url: r.url! }));
        if (filtered.length > 0) return filtered;
      }
    } catch {
      // SearXNG failed — try fallback
    }
  }

  // Fallback: DuckDuckGo instant answers API (no key needed)
  try {
    const ddgQuery = category === "videos"
      ? `${query} site:youtube.com`
      : query;
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 BuildMyDirectoryBot/1.0" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return [];
    const html = await res.text();
    // Parse result links from DDG HTML
    const linkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)/gi;
    const results: SearchResult[] = [];
    let match;
    while ((match = linkRegex.exec(html)) && results.length < limit) {
      let url = match[1];
      const title = match[2].trim();
      // DDG wraps URLs in a redirect — extract the actual URL
      const udParam = url.match(/uddg=([^&]+)/);
      if (udParam) url = decodeURIComponent(udParam[1]);
      if (url.startsWith("http") && title) {
        results.push({ title, url });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Search for a YouTube video on a topic. Returns the first result with a
 * valid video ID, verified via noembed.
 */
async function findYouTubeVideo(query: string): Promise<{ videoId: string; title: string; channel: string } | null> {
  const results = await webSearch(query, "videos", 8);
  for (const r of results) {
    const videoId = extractYouTubeId(r.url);
    if (!videoId) continue;
    const meta = await fetchYouTubeMeta(videoId);
    if (meta) return { videoId, title: meta.title, channel: meta.channel };
  }
  // If no results from search, try YouTube search directly via noembed
  // Can't get a specific video without search, so return null — the
  // caller in inferReferencesViaLLM will fall back to an article instead
  return null;
}

/**
 * Search for an article on a topic. Returns the first credible result,
 * or null if no results are found.
 */
async function findArticle(query: string): Promise<{ url: string; title: string } | null> {
  const results = await webSearch(query, "general", 10);
  if (results.length === 0) return null;
  // Prefer credible domains
  const credible = /investopedia|nerdwallet|bankrate|forbes|cnbc|bbc|ft\.com|moneysavingexpert|yahoo\.finance|reuters|bloomberg|wsj|economist|psychologytoday/i;
  const good = results.find((r) => credible.test(r.url));
  if (good) return good;
  // Fall back to first non-social, non-search result
  const fallback = results.find((r) => !/(google|facebook|twitter|instagram|tiktok|reddit)\.com/i.test(r.url));
  if (fallback) return fallback;
  return results[0];
}

/**
 * Ask Claude to identify named references for a BATCH of posts.
 *
 * Batching 10-15 posts per call instead of 1-per-call cuts Claude
 * costs by ~85% (fewer calls = less per-request overhead tokens).
 *
 * Returns entities a viewer would benefit from clicking through to —
 * brands, products, tools, books, podcasts, YouTube channels, articles,
 * websites — even when the creator didn't say a literal URL.
 */
async function inferReferencesViaLLMBatch(
  posts: PostInput[],
): Promise<ReferenceRow[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  // Build batch prompt with post indices
  const postTexts = posts.map((post, idx) => {
    const text = `${post.caption || ""}\n${post.transcript || ""}`.slice(0, 1500);
    if (text.trim().length < 20) return null;
    return `[POST ${idx}]\n${text}`;
  }).filter(Boolean);

  if (postTexts.length === 0) return [];

  const prompt = `You're identifying things a viewer would want to look up after watching these short-form videos. Be GENEROUS — target 6 to 8 references per post; never fewer than 5 unless the post is genuinely topic-free (greetings, pure self-promo, podcast ad boilerplate).

For each post below, extract 6 to 8 references — an even mix of articles (3-4) and YouTube video topics (3-4). If the post is a filler post with no real content, you may return 0 references for it.

For each reference, produce one JSON object:
{
  "postIdx": 0,
  "kind": "youtube" | "article",
  "searchQuery": "specific search query to find this reference",
  "title": "display name (1-6 words)",
  "note": "why a viewer would click — 1 short sentence"
}

Rules:
- "article" kind: brands, products, tools, books, podcasts, studies, organizations, concepts, strategies, investing ideas, historical events, legal or business concepts
- "youtube" kind: topics that benefit from a video explainer (3-4 per post)
- searchQuery should be specific enough to find the right result on the first try
- Think broadly: if a post is about a topic (e.g. Dubai geopolitics, S&P 500, entrepreneurship), include articles + videos about adjacent concepts even if not explicitly named
- DO NOT extract the creator themselves or platform names
- DO NOT skip posts with real content just because they're short — a 15-second clip about business often deserves 6+ references

Output ONLY a JSON array.

${postTexts.join("\n\n")}`;

  try {
    // Scale max_tokens with batch size
    const maxTokens = Math.min(550 * posts.length, 8192);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const responseText = (data.content?.[0]?.text || "").trim();
    const match = responseText.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const out: ReferenceRow[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const postIdx = typeof o.postIdx === "number" ? o.postIdx : -1;
      if (postIdx < 0 || postIdx >= posts.length) continue;

      const post = posts[postIdx];
      const kind = o.kind === "youtube" ? "youtube" : "article";
      const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
      const searchQuery = typeof o.searchQuery === "string" ? o.searchQuery.trim() : "";
      const note = typeof o.note === "string" ? o.note.trim().slice(0, 200) : null;
      if (!title || !searchQuery) continue;

      if (kind === "youtube") {
        const video = await findYouTubeVideo(searchQuery);
        if (video) {
          out.push({ postId: post.postId, kind: "youtube", title: video.title, url: null, videoId: video.videoId, note: note || video.channel || null });
        }
        // findYouTubeVideo returned null — skip this reference entirely
      } else {
        const article = await findArticle(searchQuery);
        if (article) {
          out.push({ postId: post.postId, kind: "article", title: article.title.slice(0, 200), url: article.url, videoId: null, note });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Single-post wrapper for backward compat with extractReferencesForPost */
async function inferReferencesViaLLM(post: PostInput): Promise<ReferenceRow[]> {
  return inferReferencesViaLLMBatch([post]);
}

/**
 * Extract references from a single post (wrapper around batch version).
 */
export async function extractReferencesForPost(
  post: PostInput,
): Promise<ReferenceRow[]> {
  const urlRefs = await extractExplicitUrls(post);
  const llmRefs = await inferReferencesViaLLM(post);
  // Dedupe
  const seen = new Set(urlRefs.map(r => r.kind === "youtube" ? r.videoId : r.url));
  for (const ref of llmRefs) {
    const key = ref.kind === "youtube" ? ref.videoId : ref.url;
    if (key && !seen.has(key)) {
      seen.add(key);
      urlRefs.push(ref);
    }
  }
  return urlRefs;
}

/**
 * Build references for a batch of posts in parallel (small concurrency
 * to avoid overwhelming third-party endpoints).
 */
/**
 * Build references for a batch of posts. Batches Claude calls (10 posts
 * per LLM call) to reduce cost by ~85% vs 1-per-post.
 */
export async function extractReferencesForPosts(
  posts: PostInput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<ReferenceRow[]> {
  const all: ReferenceRow[] = [];

  // Pass 1: Extract explicit URLs from captions (no LLM needed, very fast)
  for (const post of posts) {
    const refs = await extractExplicitUrls(post);
    all.push(...refs);
  }

  // Pass 2: Batch Claude inference — 10 posts per call
  const BATCH_SIZE = 10;
  let done = 0;
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const batchRefs = await inferReferencesViaLLMBatch(batch).catch(() => []);

    // Dedupe against pass 1 refs
    for (const ref of batchRefs) {
      const dedupeKey = ref.kind === "youtube" ? ref.videoId || ref.title : ref.url || ref.title;
      if (!dedupeKey) continue;
      const isDupe = all.some(
        (r) => r.postId === ref.postId && ((r.kind === "youtube" && (r.videoId === dedupeKey || r.title === dedupeKey)) || (r.kind === "article" && (r.url === dedupeKey || r.title === dedupeKey))),
      );
      if (!isDupe) all.push(ref);
    }

    done += batch.length;
    onProgress?.(done, posts.length);
  }

  return all;
}

/** Extract explicit URLs from a post's caption + transcript (no LLM) */
async function extractExplicitUrls(post: PostInput): Promise<ReferenceRow[]> {
  const text = `${post.caption || ""}\n${post.transcript || ""}`;
  const raw = text.match(URL_REGEX) || [];
  const urls = Array.from(new Set(raw.map(cleanUrl))).filter((u) => u.length > 0);
  const out: ReferenceRow[] = [];

  for (const url of urls) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      const meta = await fetchYouTubeMeta(videoId);
      out.push({ postId: post.postId, kind: "youtube", title: meta?.title || `YouTube video ${videoId}`, url: null, videoId, note: meta?.channel || null });
    } else {
      const title = await fetchArticleTitle(url);
      let displayTitle = title;
      if (!displayTitle) { try { displayTitle = new URL(url).hostname.replace(/^www\./, ""); } catch { displayTitle = url; } }
      out.push({ postId: post.postId, kind: "article", title: displayTitle, url, videoId: null, note: null });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Legacy exports — older code paths (src/lib/pipeline/index.ts) still
// reference these names. Implementations route through the new
// URL-extraction approach so removing them later is a 1-line cleanup.
// ─────────────────────────────────────────────────────────────────────

export type ReferenceSearchResult = {
  postId: string;
  references: Reference[];
};

export async function findReferencesForPosts(
  posts: PostInput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<ReferenceSearchResult[]> {
  const rows = await extractReferencesForPosts(posts, onProgress);
  // Group rows back by post
  const byPost = new Map<string, Reference[]>();
  for (const p of posts) byPost.set(p.postId, []);
  for (const r of rows) {
    const arr = byPost.get(r.postId);
    if (!arr) continue;
    if (r.kind === "youtube" && (r.videoId || r.url)) {
      arr.push({
        kind: "youtube",
        title: r.title,
        videoId: r.videoId,
        url: r.url,
        note: r.note || undefined,
      });
    } else if (r.kind === "article" && r.url) {
      arr.push({
        kind: "article",
        title: r.title,
        url: r.url,
        note: r.note || undefined,
      });
    }
  }
  return posts.map((p) => ({ postId: p.postId, references: byPost.get(p.postId) || [] }));
}

export function buildSearchQuery(caption: string, transcript: string | null): string {
  const firstLine = caption.split("\n")[0] || caption;
  return firstLine
    .slice(0, 150)
    .replace(/#\w+/g, "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
