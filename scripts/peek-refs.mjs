import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
for (const slug of ["themoneystocker", "joshthomas"]) {
  console.log(`\n══════ /${slug} ══════`);
  const refs = await sql`
    SELECT p.shortcode, p.title AS post_title, r.kind, r.title, r.url, r.note
    FROM "references" r
    JOIN posts p ON p.id = r.post_id
    JOIN sites s ON s.id = p.site_id
    WHERE s.slug = ${slug}
    ORDER BY p.created_at, r.kind
  `;
  let lastSc = null;
  for (const r of refs) {
    if (r.shortcode !== lastSc) {
      console.log(`\n── ${r.shortcode}: "${r.post_title?.slice(0, 70)}"`);
      lastSc = r.shortcode;
    }
    const dest = r.url || `youtube:${r.video_id || ""}`;
    console.log(`  [${r.kind.padEnd(7)}] ${r.title}`);
    if (r.note) console.log(`           ↳ ${r.note}`);
    console.log(`           → ${dest.slice(0, 90)}`);
  }
}
await sql.end();
