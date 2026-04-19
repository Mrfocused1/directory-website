#!/usr/bin/env node
/**
 * Operator CLI for manually running a site build.
 *
 * Usage:
 *   node scripts/build-site.mjs <slug>
 *
 * What it does:
 *   1. Looks up the site by slug
 *   2. Fires a `pipeline/run` Inngest event
 *   3. Polls pipeline_jobs every 5s, printing progress
 *   4. When all steps complete (or any fail), exits
 *   5. On success, sends the "your directory is live" email to the creator
 *
 * Needs in .env.local:
 *   DATABASE_URL           — Supabase Postgres
 *   INNGEST_EVENT_KEY      — to fire the pipeline/run event
 *   RESEND_API_KEY         — to send the creator's done email (optional)
 *
 * Flags:
 *   --skip-email    don't send the creator's completion email
 *   --no-wait       fire and exit instead of tailing progress
 */

import postgres from "postgres";
import { Inngest } from "inngest";
import "dotenv/config";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("-"));
const skipEmail = args.includes("--skip-email");
const noWait = args.includes("--no-wait");

if (!slug) {
  console.error("Usage: node scripts/build-site.mjs <slug> [--skip-email] [--no-wait]");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 2 });

async function main() {
  const [site] = await sql`
    SELECT id, slug, handle, platform, display_name, user_id
    FROM sites WHERE slug = ${slug}
  `;
  if (!site) {
    console.error(`✗ No site with slug "${slug}"`);
    process.exit(2);
  }
  const [owner] = await sql`SELECT email FROM users WHERE id = ${site.user_id}`;
  console.log(`→ ${site.display_name || site.slug} (${site.platform}/@${site.handle})`);
  console.log(`  site id: ${site.id}`);
  console.log(`  creator: ${owner?.email || "(no email on record)"}`);

  const inngest = new Inngest({ id: "buildmy.directory", eventKey: process.env.INNGEST_EVENT_KEY });
  const sent = await inngest.send({ name: "pipeline/run", data: { siteId: site.id } });
  console.log(`→ inngest event fired: ${sent.ids[0]}`);

  if (noWait) {
    console.log("→ --no-wait, exiting.");
    await sql.end();
    return;
  }

  console.log("\nTailing pipeline_jobs every 5s. Ctrl+C to stop watching.\n");

  let lastSig = "";
  const startedAt = Date.now();
  const MAX_WAIT_MS = 30 * 60 * 1000; // 30 min safety cap

  while (true) {
    const jobs = await sql`
      SELECT step, status, progress, message, error
      FROM pipeline_jobs
      WHERE site_id = ${site.id}
      ORDER BY CASE step
        WHEN 'scrape' THEN 1
        WHEN 'transcribe' THEN 2
        WHEN 'categorize' THEN 3
        WHEN 'references' THEN 4
        WHEN 'complete' THEN 5
        ELSE 9
      END
    `;
    const sig = jobs.map((j) => `${j.step}=${j.status}:${j.progress}`).join("|");
    if (sig !== lastSig) {
      const stamp = new Date().toISOString().slice(11, 19);
      console.log(`[${stamp}]`);
      for (const j of jobs) {
        const icon = j.status === "completed" ? "✓" : j.status === "failed" ? "✗" : j.status === "running" ? "…" : "·";
        console.log(`  ${icon} ${j.step.padEnd(12)} ${j.status.padEnd(10)} ${String(j.progress).padStart(3)}%  ${(j.message || "").slice(0, 60)}`);
      }
      lastSig = sig;
    }

    const anyFailed = jobs.some((j) => j.status === "failed");
    const allCompleted = jobs.length > 0 && jobs.every((j) => j.status === "completed");

    if (anyFailed) {
      const fail = jobs.find((j) => j.status === "failed");
      console.error(`\n✗ Pipeline failed at step "${fail.step}": ${fail.error || fail.message}`);
      await sql.end();
      process.exit(3);
    }
    if (allCompleted) {
      const postRow = await sql`SELECT COUNT(*)::int as n FROM posts WHERE site_id = ${site.id}`;
      console.log(`\n✓ Done. ${postRow[0].n} posts live at https://buildmy.directory/${site.slug}`);

      if (!skipEmail && owner?.email && process.env.RESEND_API_KEY) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const siteUrl = `https://buildmy.directory/${site.slug}`;
          await resend.emails.send({
            from: "BuildMy.Directory <hello@buildmy.directory>",
            to: owner.email,
            subject: `Your directory is live ✨`,
            text: `Your directory is ready at ${siteUrl}\n\n${postRow[0].n} posts scraped, transcribed, categorized, and published. Share the link with your audience — and come back anytime to manage subscribers and see analytics.`,
          });
          console.log(`✓ Completion email sent to ${owner.email}`);
        } catch (err) {
          console.warn(`⚠ Creator email failed: ${err.message || err}`);
        }
      }
      await sql.end();
      return;
    }

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.error("\n⚠ 30 min elapsed without completion — bailing on the tail (pipeline may still be running in background).");
      await sql.end();
      process.exit(4);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
