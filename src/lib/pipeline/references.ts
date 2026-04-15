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

/**
 * Extract references from a single post. Returns the rows to insert
 * into the `references` table, deduped within the post.
 */
export async function extractReferencesForPost(
  post: PostInput,
): Promise<ReferenceRow[]> {
  const text = `${post.caption || ""}\n${post.transcript || ""}`;
  const raw = text.match(URL_REGEX) || [];
  const urls = Array.from(new Set(raw.map(cleanUrl))).filter((u) => u.length > 0);

  const out: ReferenceRow[] = [];
  const seenYouTube = new Set<string>();
  const seenArticle = new Set<string>();

  for (const url of urls) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      if (seenYouTube.has(videoId)) continue;
      seenYouTube.add(videoId);
      const meta = await fetchYouTubeMeta(videoId);
      out.push({
        postId: post.postId,
        kind: "youtube",
        title: meta?.title || `YouTube video ${videoId}`,
        url: null,
        videoId,
        note: meta?.channel || null,
      });
    } else {
      if (seenArticle.has(url)) continue;
      seenArticle.add(url);
      const title = await fetchArticleTitle(url);
      // If title lookup failed, still keep the reference — the URL alone
      // is useful. Fall back to the host name as a display title.
      let displayTitle = title;
      if (!displayTitle) {
        try {
          displayTitle = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          displayTitle = url;
        }
      }
      out.push({
        postId: post.postId,
        kind: "article",
        title: displayTitle,
        url,
        videoId: null,
        note: null,
      });
    }
  }
  return out;
}

/**
 * Build references for a batch of posts in parallel (small concurrency
 * to avoid overwhelming third-party endpoints).
 */
export async function extractReferencesForPosts(
  posts: PostInput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<ReferenceRow[]> {
  const all: ReferenceRow[] = [];
  const CONCURRENCY = 4;
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < posts.length) {
      const myIdx = idx++;
      const refs = await extractReferencesForPost(posts[myIdx]).catch(() => []);
      all.push(...refs);
      done++;
      onProgress?.(done, posts.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, posts.length) }, worker));
  return all;
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
    if (r.kind === "youtube" && r.videoId) {
      arr.push({
        kind: "youtube",
        title: r.title,
        videoId: r.videoId,
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
