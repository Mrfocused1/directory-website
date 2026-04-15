import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
const rows = await sql`
  SELECT s.slug, p.shortcode, p.caption, COALESCE(p.transcript, '') AS transcript
  FROM posts p JOIN sites s ON s.id = p.site_id
  WHERE s.slug IN ('themoneystocker', 'joshthomas')
  ORDER BY s.slug, p.created_at DESC LIMIT 6
`;
for (const r of rows) {
  console.log(`\n──── ${r.slug} / ${r.shortcode} ────`);
  console.log("CAPTION:", r.caption?.slice(0,300) || "(none)");
  console.log("TRANSCRIPT:", r.transcript?.slice(0,200) || "(none)");
  const allText = `${r.caption||""} ${r.transcript||""}`;
  const urls = allText.match(/https?:\/\/\S+/g) || [];
  const handles = allText.match(/@\w+/g) || [];
  const youtube = allText.match(/youtube|youtu\.be/gi) || [];
  console.log(`URLs: ${urls.length}, @mentions: ${handles.length}, youtube refs: ${youtube.length}`);
}
await sql.end();
