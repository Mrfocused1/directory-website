// Backfill transcripts for video posts that are missing them. Calls
// Deepgram directly against the already-uploaded Vercel Blob URLs.
// No Apify spend. After transcription completes, re-runs the
// references extractor over caption + transcript.
//
// Usage: node scripts/backfill-transcripts.mjs [siteSlug]
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const sql = postgres(env.DATABASE_URL, { max: 1 });
const DG_KEY = env.DEEPGRAM_API_KEY;

async function transcribe(videoUrl) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 180_000);
  try {
    const r = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DG_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: videoUrl }),
        signal: c.signal,
      },
    );
    if (!r.ok) throw new Error(`Deepgram HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const result = data.results?.channels?.[0]?.alternatives?.[0];
    const segments = (data.results?.utterances || []).map((u) => ({
      start: u.start,
      end: u.end,
      text: u.transcript,
    }));
    return {
      text: result?.transcript || "",
      segments,
      duration: data.metadata?.duration || 0,
    };
  } finally {
    clearTimeout(t);
  }
}

// Inline references extractor (mirrors src/lib/pipeline/references.ts)
const URL_REGEX = /https?:\/\/[^\s<>"'()]+/gi;
const YT = [
  /youtube\.com\/watch\?[^"]*v=([A-Za-z0-9_-]{11})/i,
  /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
];
const cleanUrl = (raw) => raw.replace(/[.,;:!?)\]}>"'""]+$/g, "");
const ytId = (url) => {
  for (const re of YT) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
};
async function fetchYTMeta(videoId) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5000);
  try {
    const r = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
      { signal: c.signal },
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (d.error || !d.title) return null;
    return { title: d.title, channel: d.author_name || "" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function fetchTitle(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5000);
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: { "User-Agent": "Mozilla/5.0 BuildMyDirectoryBot/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/.test(ct)) return null;
    const reader = r.body?.getReader();
    if (!reader) return null;
    const dec = new TextDecoder();
    let buf = "";
    let read = 0;
    while (read < 512_000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      read += value.length;
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
async function inferRefsViaLLM(post) {
  if (!env.ANTHROPIC_API_KEY) return [];
  const text = `${post.caption || ""}\n${post.transcript || ""}`.slice(0, 6000);
  if (text.trim().length < 40) return [];
  const prompt = `You're identifying things a viewer would want to look up after watching this short-form video.

Read the caption + transcript below. Extract up to 6 NAMED references — a mix of WEBSITES and YOUTUBE VIDEOS — that a viewer would benefit from a clickable link to.

WEBSITE references (kind: "article"):
- Specific brands, products, tools, services
- Companies, organizations, regulators
- Books, podcasts, documentaries
- Articles or studies referenced
- url: official site if known, otherwise https://www.google.com/search?q=<urlencoded name>

YOUTUBE references (kind: "youtube"):
- For at least 2 of the references (when topic warrants), find a high-quality EXPLAINER YOUTUBE VIDEO on the topic from a CREDIBLE channel
- Credible channels: official brand channels, BBC News, CNBC, Bloomberg Television, The Wall Street Journal, Financial Times, Forbes, TED, official institution channels, well-established educators (>500K subs)
- url: MUST be a real YouTube watch URL of the form https://www.youtube.com/watch?v=<11-char-id> from a known credible channel
- If you don't know a specific real video on the topic, DO NOT make one up — instead use a YouTube SEARCH URL: https://www.youtube.com/results?search_query=<urlencoded topic>+<credible source>

DO NOT extract:
- Generic concepts (these are topics, not references)
- The creator themselves
- The platform (Instagram, TikTok)
- Numbers, percentages, prices, dates

For each reference, produce one JSON object:
{
  "kind": "youtube" | "article",
  "title": "display name (1-6 words)",
  "url": "destination URL — see rules above",
  "note": "why a viewer would click — 1 short sentence"
}

Output ONLY a JSON array. Empty array [] if nothing concrete to reference.

Caption + transcript:
${text}`;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12_000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: c.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    const responseText = (data.content?.[0]?.text || "").trim();
    const m = responseText.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const kind = item.kind === "youtube" ? "youtube" : "article";
      const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      const note = typeof item.note === "string" ? item.note.trim().slice(0, 200) : null;
      if (!title || !url) continue;
      try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      } catch {
        continue;
      }
      if (kind === "youtube") {
        const vid = ytId(url);
        if (vid) {
          // Validate via noembed — drops hallucinated video IDs
          const meta = await fetchYTMeta(vid);
          if (!meta) continue;
          out.push({
            post_id: post.id,
            kind: "youtube",
            title: meta.title || title,
            url: null,
            video_id: vid,
            note: note || meta.channel || null,
          });
        } else {
          // Channel page or search URL — store as link-only YouTube ref
          out.push({
            post_id: post.id,
            kind: "youtube",
            title,
            url,
            video_id: null,
            note,
          });
        }
      } else {
        out.push({ post_id: post.id, kind: "article", title, url, video_id: null, note });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function extractRefs(post) {
  const text = `${post.caption || ""}\n${post.transcript || ""}`;
  const urls = Array.from(new Set((text.match(URL_REGEX) || []).map(cleanUrl))).filter(Boolean);
  const out = [];
  const seenY = new Set();
  const seenA = new Set();

  // Pass 1: literal URLs
  for (const url of urls) {
    const vid = ytId(url);
    if (vid) {
      if (seenY.has(vid)) continue;
      seenY.add(vid);
      const meta = await fetchYTMeta(vid);
      out.push({
        post_id: post.id,
        kind: "youtube",
        title: meta?.title || `YouTube video ${vid}`,
        url: null,
        video_id: vid,
        note: meta?.channel || null,
      });
    } else {
      if (seenA.has(url)) continue;
      seenA.add(url);
      const title = await fetchTitle(url);
      let display = title;
      if (!display) {
        try {
          display = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          display = url;
        }
      }
      out.push({ post_id: post.id, kind: "article", title: display, url, video_id: null, note: null });
    }
  }

  // Pass 2: Claude-inferred named entities
  const inferred = await inferRefsViaLLM(post);
  for (const r of inferred) {
    const key = r.kind === "youtube" ? (r.video_id || r.title) : (r.url || r.title);
    if (!key) continue;
    if (r.kind === "youtube") {
      if (seenY.has(key)) continue;
      seenY.add(key);
    } else {
      if (seenA.has(key)) continue;
      seenA.add(key);
    }
    out.push(r);
  }

  return out;
}

const targetSlug = process.argv[2] || null;
const sites = targetSlug
  ? await sql`SELECT id, slug FROM sites WHERE slug = ${targetSlug}`
  : await sql`SELECT id, slug FROM sites WHERE is_published = true`;

console.log(`Backfilling transcripts for ${sites.length} site(s)\n`);

let totalT = 0;
let totalErr = 0;
let totalRefs = 0;

for (const s of sites) {
  console.log(`──── ${s.slug} ────`);
  const videos = await sql`
    SELECT id, shortcode, media_url, caption
    FROM posts
    WHERE site_id = ${s.id}
      AND type = 'video'
      AND media_url IS NOT NULL
      AND (transcript IS NULL OR length(transcript) = 0)
  `;
  console.log(`  ${videos.length} video posts missing transcripts`);

  for (const v of videos) {
    process.stdout.write(`    ${v.shortcode}…`);
    try {
      const r = await transcribe(v.media_url);
      if (r.text) {
        await sql`
          UPDATE posts
          SET transcript = ${r.text},
              transcript_segments = ${JSON.stringify(r.segments)}::jsonb
          WHERE id = ${v.id}
        `;
        totalT++;
        process.stdout.write(` ✓ ${r.text.length} chars\n`);
      } else {
        process.stdout.write(` (empty)\n`);
      }
    } catch (e) {
      totalErr++;
      process.stdout.write(` ✗ ${e.message?.slice(0, 100)}\n`);
    }
  }

  // After transcripts populate, run references extractor across ALL posts
  console.log(`  extracting references…`);
  const allPosts = await sql`SELECT id, caption, transcript FROM posts WHERE site_id = ${s.id}`;
  // Wipe existing refs to avoid dupes
  for (const p of allPosts) {
    await sql`DELETE FROM "references" WHERE post_id = ${p.id}`;
  }
  let siteRefs = 0;
  for (const p of allPosts) {
    const rows = await extractRefs(p);
    for (const r of rows) {
      try {
        await sql`
          INSERT INTO "references" (post_id, kind, title, url, video_id, note)
          VALUES (${r.post_id}, ${r.kind}, ${r.title}, ${r.url}, ${r.video_id}, ${r.note})
        `;
        siteRefs++;
        totalRefs++;
      } catch {}
    }
    if (rows.length) console.log(`    ${p.id.slice(0, 8)}: +${rows.length} refs`);
  }
  console.log(`  → ${siteRefs} refs added\n`);
}

await sql.end();
console.log(`\n📊 Totals — transcribed: ${totalT}, errors: ${totalErr}, refs: ${totalRefs}`);
