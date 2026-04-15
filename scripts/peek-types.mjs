import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
const rows = await sql`
  SELECT s.slug, p.type, COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE p.transcript IS NOT NULL AND length(p.transcript) > 0)::int AS with_transcript
  FROM posts p JOIN sites s ON s.id = p.site_id
  WHERE s.slug IN ('themoneystocker', 'joshthomas')
  GROUP BY s.slug, p.type ORDER BY s.slug, p.type
`;
console.log("type breakdown + transcripts:");
for (const r of rows) console.log(`  ${r.slug.padEnd(20)} ${r.type.padEnd(10)} ${r.n} posts, ${r.with_transcript} transcribed`);
await sql.end();
