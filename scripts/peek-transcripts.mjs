import postgres from "postgres";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.match(/^[A-Z_]+=/)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const sql = postgres(env.DATABASE_URL,{max:1});
const rows = await sql`
  SELECT s.slug, p.shortcode, p.transcript
  FROM posts p JOIN sites s ON s.id = p.site_id
  WHERE s.slug = 'themoneystocker' AND p.transcript IS NOT NULL
  ORDER BY p.created_at DESC LIMIT 3
`;
for (const r of rows) {
  console.log(`\n──── ${r.shortcode} ────`);
  console.log(r.transcript.slice(0, 800));
  // Also look for things that LOOK like references
  const dotted = r.transcript.match(/\b\w+\.(com|co|io|net|uk|tv|app|me|org|edu|gov|info|ai)\b/gi) || [];
  const youtube = r.transcript.match(/\byoutube\b|\byoutu\.be\b/gi) || [];
  const brands = r.transcript.match(/\b(Vanguard|Tesla|Apple|Amazon|Google|Microsoft|HMRC|FIRE|S&P|ISA|SIPP|Trading|InvestEngine|Hargreaves)\w*\b/g) || [];
  console.log(`  domains: ${dotted.join(", ") || "(none)"}`);
  console.log(`  youtube refs: ${youtube.length}`);
  console.log(`  brands: ${[...new Set(brands)].join(", ") || "(none)"}`);
}
await sql.end();
