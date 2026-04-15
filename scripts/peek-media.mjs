import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
const rows = await sql`
  SELECT s.slug, p.shortcode, p.type, p.media_url, p.thumb_url, p.transcript
  FROM posts p JOIN sites s ON s.id = p.site_id
  WHERE s.slug = 'themoneystocker' AND p.type = 'video'
  LIMIT 4
`;
for (const r of rows) {
  console.log(`\n${r.shortcode}:`);
  console.log(`  media_url: ${r.media_url || "(null)"}`);
  console.log(`  thumb_url: ${r.thumb_url ? r.thumb_url.slice(0,120) : "(null)"}`);
  console.log(`  transcript: ${r.transcript ? `(${r.transcript.length} chars)` : "(null)"}`);
}
await sql.end();
