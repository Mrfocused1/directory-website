import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
for (const slug of ["themoneystocker","joshthomas"]) {
  console.log(`\n══ /${slug} ══`);
  const totals = await sql`
    SELECT r.kind, (CASE WHEN r.video_id IS NOT NULL THEN 'embeddable' WHEN r.url LIKE '%youtube%' THEN 'yt-link' ELSE 'article-link' END) AS subtype, COUNT(*)::int AS n
    FROM "references" r JOIN posts p ON p.id = r.post_id JOIN sites s ON s.id = p.site_id
    WHERE s.slug = ${slug}
    GROUP BY r.kind, subtype ORDER BY r.kind
  `;
  for (const t of totals) console.log(`  ${t.kind.padEnd(8)} ${t.subtype.padEnd(15)} ${t.n}`);
  // Show a few embeddable YouTube refs
  const yt = await sql`
    SELECT r.title, r.video_id, r.note FROM "references" r
    JOIN posts p ON p.id = r.post_id JOIN sites s ON s.id = p.site_id
    WHERE s.slug = ${slug} AND r.kind = 'youtube' AND r.video_id IS NOT NULL LIMIT 5
  `;
  if (yt.length) {
    console.log(`  Sample embeddable YouTube refs:`);
    for (const v of yt) console.log(`    "${v.title}" → youtu.be/${v.video_id}  (${v.note?.slice(0,60) || ""})`);
  }
}
await sql.end();
