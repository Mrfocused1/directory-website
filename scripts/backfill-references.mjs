// Backfill references for already-published sites whose pipeline ran
// before the references step was implemented. Extracts directly from
// stored caption + transcript — does NOT re-scrape (no Apify spend).
//
// Usage: node scripts/backfill-references.mjs [siteSlug]
import postgres from "postgres";
import { readFileSync } from "node:fs";

// Inline references extractor (mirrors src/lib/pipeline/references.ts so
// this script can run without compiling TS).
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
async function fetchArticleTitle(url) {
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
async function extractReferencesForPost(post) {
  const text = `${post.caption || ""}\n${post.transcript || ""}`;
  const raw = text.match(URL_REGEX) || [];
  const urls = Array.from(new Set(raw.map(cleanUrl))).filter(Boolean);
  const out = [];
  const seenY = new Set();
  const seenA = new Set();
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
      const title = await fetchArticleTitle(url);
      let display = title;
      if (!display) {
        try {
          display = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          display = url;
        }
      }
      out.push({
        post_id: post.id,
        kind: "article",
        title: display,
        url,
        video_id: null,
        note: null,
      });
    }
  }
  return out;
}

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
const targetSlug = process.argv[2] || null;

let sites;
if (targetSlug) {
  sites = await sql`SELECT id, slug, handle FROM sites WHERE slug = ${targetSlug}`;
} else {
  sites = await sql`
    SELECT DISTINCT s.id, s.slug, s.handle
    FROM sites s
    LEFT JOIN posts p ON p.site_id = s.id
    LEFT JOIN "references" r ON r.post_id = p.id
    WHERE s.is_published = true
    GROUP BY s.id
    HAVING COUNT(r.id) = 0
  `;
}

console.log(`Backfilling refs for ${sites.length} site(s):`);
for (const s of sites) console.log(`  ${s.slug} (@${s.handle})`);

let totalRefs = 0;
for (const site of sites) {
  const posts = await sql`SELECT id, caption, transcript FROM posts WHERE site_id = ${site.id}`;
  console.log(`\n${site.slug}: scanning ${posts.length} posts…`);
  let siteRefs = 0;
  for (const p of posts) {
    const rows = await extractReferencesForPost(p);
    for (const r of rows) {
      try {
        await sql`
          INSERT INTO "references" (post_id, kind, title, url, video_id, note)
          VALUES (${r.post_id}, ${r.kind}, ${r.title}, ${r.url}, ${r.video_id}, ${r.note})
        `;
        siteRefs++;
        totalRefs++;
      } catch (e) {
        console.log(`    skip (${e.message?.slice(0, 60)})`);
      }
    }
    if (rows.length) console.log(`    ${p.id.slice(0, 8)}: +${rows.length} refs`);
  }
  console.log(`  → ${siteRefs} refs added for ${site.slug}`);
}

await sql.end();
console.log(`\nDone. Total references inserted: ${totalRefs}`);
