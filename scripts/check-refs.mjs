import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
const site = await sql`SELECT id FROM sites WHERE slug = 'themoneystocker' LIMIT 1`;
if (!site.length) { console.log("no site"); process.exit(0); }
const refs = await sql`
  SELECT r.kind, r.title, r.url, r.video_id, r.post_id
  FROM "references" r
  JOIN posts p ON p.id = r.post_id
  WHERE p.site_id = ${site[0].id}
`;
console.log(`References for themoneystocker: ${refs.length}`);
refs.forEach(r => console.log(`  ${r.kind}: ${r.title?.slice(0,60)} ${r.url||r.video_id||""}`));

// Also show captions that have URLs in them
const posts = await sql`SELECT shortcode, caption, transcript FROM posts WHERE site_id = ${site[0].id}`;
console.log(`\nPosts with URLs in caption:`);
posts.forEach(p => {
  const urls = (p.caption||"").match(/https?:\/\/\S+/g) || [];
  const transUrls = (p.transcript||"").match(/https?:\/\/\S+/g) || [];
  if (urls.length || transUrls.length) console.log(`  ${p.shortcode}: caption=${urls.length} transcript=${transUrls.length}`);
});
await sql.end();
