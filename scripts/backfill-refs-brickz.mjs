/**
 * Standalone references backfill for @brickzwithtipz.
 * Pure JS + postgres + direct Claude/SearXNG calls — avoids the
 * TS module resolution pain with tsx.
 */

import postgres from "postgres";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 4 });
const SEARXNG_URL = process.env.SEARXNG_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SEARXNG_URL) throw new Error("SEARXNG_URL missing");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

const [site] = await sql`SELECT id, slug FROM sites WHERE slug = 'brickzwiththetipz'`;
console.log(`site: ${site.slug} (${site.id})`);

const posts = await sql`SELECT id, caption, transcript FROM posts WHERE site_id = ${site.id}`;
const refCounts = new Map(
  (
    await sql`SELECT post_id, COUNT(*)::int as n FROM "references" WHERE post_id IN ${sql(posts.map((p) => p.id))} GROUP BY post_id`
  ).map((r) => [r.post_id, r.n]),
);
// Target any post with < 4 refs, not just zero-ref posts — boost the
// sparse ones up toward the 5-8 range the improved prompt aims for.
const targets = posts.filter((p) => (refCounts.get(p.id) ?? 0) < 4);
console.log(`${posts.length} posts total, ${targets.length} need more references (< 4 each)`);

// Whitelist of TLDs we trust to serve primarily English content.
const ENGLISH_TLD = /\.(com|org|net|edu|gov|io|ai|co|dev|app|tech|info|news|me|tv|xyz|site|blog|uk|us|ca|au|nz|ie|za|in|ph|sg|directory)$/i;
const NON_ENGLISH_HOST = /(baidu|zhihu|qq|sohu|sina|naver|yandex|rakuten|goo)\.(com|co\.jp|com\.cn|ne\.jp)/i;

function isEnglishResult(title, url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (NON_ENGLISH_HOST.test(hostname)) return false;
    if (!ENGLISH_TLD.test(hostname)) return false;
  } catch { return false; }
  if (!title) return true;
  const nonAscii = (title.match(/[^\x00-\x7F]/g) || []).length;
  return nonAscii / title.length < 0.05;
}

const STOPWORDS = new Set([
  "a","an","and","the","of","to","in","on","for","with","is","are",
  "how","why","what","when","where","who","uk","us","guide","tips",
]);
function isRelevantToQuery(title, query) {
  const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)));
  const qw = words(query);
  const tw = words(title);
  if (qw.size === 0) return true;
  for (const w of qw) if (tw.has(w)) return true;
  return false;
}

async function searxSearch(query, category) {
  try {
    const u = new URL(`${SEARXNG_URL}/search`);
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    u.searchParams.set("categories", category);
    u.searchParams.set("language", "en-GB");
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((r) => r.title && r.url && isEnglishResult(r.title, r.url) && isRelevantToQuery(r.title, query))
      .slice(0, 3);
  } catch {
    return [];
  }
}

function extractYouTubeId(url) {
  const patterns = [
    /youtube\.com\/watch\?[^"]*v=([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function inferReferencesForBatch(batch) {
  const postTexts = batch
    .map((post, idx) => {
      const text = `${post.caption || ""}\n${post.transcript || ""}`.slice(0, 1500);
      if (text.trim().length < 20) return null;
      return `[POST ${idx}]\n${text}`;
    })
    .filter(Boolean);

  if (postTexts.length === 0) return [];

  const prompt = `You're identifying things a viewer would want to look up after watching these short-form videos. Be GENEROUS — target 6 to 8 references per post; never fewer than 5 unless the post is genuinely topic-free (greetings, pure self-promo, etc).

For each post below, extract 6 to 8 references — an even mix of articles (3-4) and YouTube video topics (3-4). If the post is a filler post with no real content (e.g. "Happy Sunday", podcast ad boilerplate), you may return 0 references for it.

For each reference, produce one JSON object:
{"postIdx": 0, "kind": "youtube" | "article", "searchQuery": "specific search query", "title": "display name (1-6 words)", "note": "why a viewer would click — 1 sentence"}

Rules:
- "article" kind: brands, products, tools, books, podcasts, studies, organizations, concepts, strategies, investing ideas, historical events, legal/business concepts
- "youtube" kind: topics that benefit from a video explainer (3-4 per post)
- searchQuery MUST be specific, English-only, and 4-8 words. Short queries like "UK statistics" or "credit score" return generic or foreign results — write "first time buyer credit score UK guide" instead
- Include the post's specific topic word(s) in EVERY searchQuery so downstream relevance filtering keeps the result
- The audience is English-speaking (UK/US). Never write a query likely to surface German, French, Spanish, Chinese, or Japanese sources
- Think broadly: if a post is about a topic (e.g. Dubai geopolitics, S&P 500, entrepreneurship), include articles + videos about adjacent concepts even if not explicitly named
- DO NOT extract the creator themselves or platform names
- DO NOT skip posts with real content just because they're short — even a 15-second clip about business often deserves 6+ references

Output ONLY a JSON array.

${postTexts.join("\n\n")}`;

  // Retry on 429 with exponential backoff — Anthropic's Haiku tier
  // rate-limits around 50 RPM, and batching 10 posts × ~20s each can
  // cluster requests faster than that if we don't pace ourselves.
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: Math.min(550 * batch.length, 8192),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status !== 429) break;
    const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
    const waitMs = retryAfter ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 60_000);
    console.warn(`  Claude 429 (attempt ${attempt + 1}), waiting ${waitMs / 1000}s`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!res.ok) {
    console.warn(`  Claude API ${res.status}`);
    return [];
  }
  const data = await res.json();
  const text = (data.content?.[0]?.text || "").trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const refs = [];
  // Per-post dedup sets: different search queries from Claude can
  // resolve to the same SearXNG result, and we don't want the same
  // "First Homes scheme - GOV.UK" appearing three times on one post.
  const seenPerPost = new Map(); // postId → { urls: Set, videoIds: Set, titles: Set }
  const getSeen = (postId) => {
    if (!seenPerPost.has(postId)) {
      seenPerPost.set(postId, { urls: new Set(), videoIds: new Set(), titles: new Set() });
    }
    return seenPerPost.get(postId);
  };
  const normalizeTitle = (t) => (t || "").toLowerCase().replace(/\s+/g, " ").trim();
  const normalizeUrl = (u) => {
    if (!u) return "";
    try {
      const p = new URL(u);
      return (p.hostname.replace(/^www\./, "") + p.pathname).toLowerCase().replace(/\/+$/, "");
    } catch {
      return u.toLowerCase();
    }
  };

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const postIdx = typeof item.postIdx === "number" ? item.postIdx : -1;
    if (postIdx < 0 || postIdx >= batch.length) continue;
    const post = batch[postIdx];
    const seen = getSeen(post.id);
    const kind = item.kind === "youtube" ? "youtube" : "article";
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : "";
    const searchQuery = typeof item.searchQuery === "string" ? item.searchQuery.trim() : "";
    const note = typeof item.note === "string" ? item.note.trim().slice(0, 200) : null;
    if (!title || !searchQuery) continue;

    if (kind === "youtube") {
      const results = await searxSearch(searchQuery, "videos");
      for (const r of results) {
        const vid = extractYouTubeId(r.url);
        if (vid) {
          if (seen.videoIds.has(vid) || seen.titles.has(normalizeTitle(r.title))) break;
          seen.videoIds.add(vid);
          seen.titles.add(normalizeTitle(r.title));
          refs.push({ postId: post.id, kind: "youtube", title: r.title, url: null, videoId: vid, note });
          break;
        }
      }
    } else {
      const results = await searxSearch(searchQuery, "general");
      for (const r of results) {
        const urlKey = normalizeUrl(r.url);
        const titleKey = normalizeTitle(r.title);
        if (seen.urls.has(urlKey) || seen.titles.has(titleKey)) continue;
        seen.urls.add(urlKey);
        seen.titles.add(titleKey);
        refs.push({ postId: post.id, kind: "article", title: r.title.slice(0, 200), url: r.url, videoId: null, note });
        break;
      }
    }
  }
  return refs;
}

const BATCH = 10;
let totalInserted = 0;
let postsTouched = 0;
for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  let refs;
  try {
    refs = await inferReferencesForBatch(batch);
  } catch (err) {
    console.warn(`  batch ${i / BATCH + 1}: FAILED (${err.message}) — skipping, will rerun for these later`);
    continue;
  }
  // Flush per batch so a late crash doesn't lose the work
  const byPost = new Map();
  for (const r of refs) {
    if (!byPost.has(r.postId)) byPost.set(r.postId, []);
    byPost.get(r.postId).push(r);
  }
  for (const [postId, rows] of byPost) {
    await sql`DELETE FROM "references" WHERE post_id = ${postId}`;
    if (rows.length) {
      const inserted = rows.map((r) => ({
        post_id: r.postId,
        kind: r.kind,
        title: r.title,
        url: r.url,
        video_id: r.videoId,
        note: r.note,
      }));
      await sql`INSERT INTO "references" ${sql(inserted)}`;
    }
  }
  totalInserted += refs.length;
  postsTouched += byPost.size;
  console.log(`  batch ${i / BATCH + 1}: ${refs.length} refs across ${byPost.size} posts (${i + batch.length}/${targets.length} done, total ${totalInserted} refs)`);
}
console.log(`done. ${totalInserted} refs across ${postsTouched} posts`);
await sql.end();
