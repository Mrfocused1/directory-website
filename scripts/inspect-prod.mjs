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

// Look at every recent site + its pipeline jobs
const sites = await sql`
  SELECT s.id, s.slug, s.handle, s.platform, s.is_published, s.user_id,
         s.created_at, u.email
  FROM sites s
  JOIN users u ON u.id = s.user_id
  ORDER BY s.created_at DESC
  LIMIT 20
`;
console.log(`\nRecent sites (${sites.length}):`);
for (const s of sites) {
  console.log(`  ${s.slug.padEnd(25)} @${s.handle.padEnd(20)} ${s.platform.padEnd(10)} ${s.is_published ? "LIVE" : "draft"} ${s.email}`);
}

// For each recent draft, show its pipeline_jobs state
const drafts = sites.filter((s) => !s.is_published);
for (const s of drafts) {
  const jobs = await sql`
    SELECT step, status, progress, message, error, created_at
    FROM pipeline_jobs
    WHERE site_id = ${s.id}
    ORDER BY created_at DESC
  `;
  console.log(`\n─── ${s.slug} (id=${s.id.slice(0, 8)}) ${s.email} ─────────────`);
  for (const j of jobs) {
    const t = new Date(j.created_at).toISOString().slice(11, 19);
    const err = j.error ? ` ERR="${j.error.slice(0, 100)}"` : "";
    const msg = j.message ? ` MSG="${j.message.slice(0, 80)}"` : "";
    console.log(`  ${t}  ${j.step.padEnd(12)} ${j.status.padEnd(10)} ${j.progress}%${msg}${err}`);
  }
  const postCount = await sql`SELECT COUNT(*)::int AS c FROM posts WHERE site_id = ${s.id}`;
  console.log(`  posts: ${postCount[0].c}`);
}

await sql.end();
