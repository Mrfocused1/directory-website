// Manually retry the user's failed sites against production Inngest
// with the new (fixed) Apify actor.
import postgres from "postgres";
import { Inngest } from "inngest";
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

// Pick out the two user-owned failed sites we saw in inspect-prod
const sites = await sql`
  SELECT s.id, s.slug, s.handle, u.email
  FROM sites s
  JOIN users u ON u.id = s.user_id
  WHERE s.is_published = false
    AND u.email NOT LIKE 'qa-%@example.com'
  ORDER BY s.created_at DESC
`;
console.log(`Will retry ${sites.length} user sites:`);
for (const s of sites) console.log(`  ${s.slug} (${s.email})`);

// Reset any failed jobs to pending so the UI shows in-progress again
for (const s of sites) {
  await sql`
    UPDATE pipeline_jobs
    SET status = 'pending', error = NULL, progress = 0, message = 'Retrying with fixed scraper…'
    WHERE site_id = ${s.id} AND status = 'failed'
  `;
  console.log(`  reset failed jobs for ${s.slug}`);
}

// Now publish Inngest events so the pipeline actually runs
const inngest = new Inngest({
  id: "buildmy-directory",
  eventKey: env.INNGEST_EVENT_KEY,
});
for (const s of sites) {
  await inngest.send({ name: "pipeline/run", data: { siteId: s.id } });
  console.log(`  sent Inngest event for ${s.slug}`);
}

await sql.end();
console.log("\nDone. User can now refresh /dashboard and click 'See progress'.");
