#!/usr/bin/env node
/**
 * Live progress bar for a site build.
 *
 * Usage: node scripts/progress.mjs <slug>
 *
 * Polls pipeline_jobs every 1s and renders one bar per step, updating
 * in place. Exits on completion, failure, or Ctrl+C.
 */

import postgres from "postgres";
import "dotenv/config";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/progress.mjs <slug>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 2 });

const STEP_ORDER = ["scrape", "transcribe", "categorize", "references", "complete"];
const STEP_LABEL = {
  scrape: "Scrape    ",
  transcribe: "Transcribe",
  categorize: "Categorize",
  references: "References",
  complete: "Finalize  ",
};

// ANSI escape codes
const CLEAR_LINE = "\x1b[2K\r";
const CURSOR_UP = (n) => `\x1b[${n}A`;
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREY = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const BAR_WIDTH = 30;

function bar(progress, status) {
  const filled = Math.round((progress / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  let color = GREY;
  if (status === "running") color = YELLOW;
  else if (status === "completed") color = GREEN;
  else if (status === "failed") color = RED;
  return `${color}${"█".repeat(filled)}${GREY}${"░".repeat(empty)}${RESET}`;
}

function statusIcon(status) {
  if (status === "completed") return `${GREEN}✓${RESET}`;
  if (status === "failed") return `${RED}✗${RESET}`;
  if (status === "running") return `${YELLOW}…${RESET}`;
  return `${GREY}·${RESET}`;
}

let firstRender = true;
let linesDrawn = 0;

function render(jobs) {
  if (!firstRender) process.stdout.write(CURSOR_UP(linesDrawn));

  const ordered = STEP_ORDER.map((step) => jobs.find((j) => j.step === step)).filter(Boolean);
  const lines = [];

  for (const j of ordered) {
    const pct = String(j.progress).padStart(3);
    const msg = (j.message || "").slice(0, 50);
    const icon = statusIcon(j.status);
    lines.push(
      `${CLEAR_LINE}${icon} ${BOLD}${STEP_LABEL[j.step] || j.step}${RESET}  ${bar(j.progress, j.status)}  ${pct}%  ${GREY}${msg}${RESET}`,
    );
  }

  // Include any unknown steps at the end
  for (const j of jobs) {
    if (!STEP_ORDER.includes(j.step)) {
      const pct = String(j.progress).padStart(3);
      const msg = (j.message || "").slice(0, 50);
      const icon = statusIcon(j.status);
      lines.push(
        `${CLEAR_LINE}${icon} ${BOLD}${j.step.padEnd(10)}${RESET}  ${bar(j.progress, j.status)}  ${pct}%  ${GREY}${msg}${RESET}`,
      );
    }
  }

  const output = lines.join("\n") + "\n";
  process.stdout.write(output);
  linesDrawn = lines.length;
  firstRender = false;
}

async function main() {
  const [site] = await sql`SELECT id, display_name, handle FROM sites WHERE slug = ${slug}`;
  if (!site) {
    console.error(`✗ No site with slug "${slug}"`);
    process.exit(2);
  }

  process.stdout.write(HIDE_CURSOR);
  process.on("SIGINT", () => {
    process.stdout.write(SHOW_CURSOR);
    process.exit(130);
  });
  process.on("exit", () => process.stdout.write(SHOW_CURSOR));

  console.log(`\n${BOLD}${site.display_name || slug}${RESET}  ${GREY}(@${site.handle})${RESET}`);
  console.log();

  const startedAt = Date.now();
  const MAX_WAIT_MS = 30 * 60 * 1000;

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

    if (jobs.length === 0) {
      process.stdout.write(`${CLEAR_LINE}${GREY}Waiting for pipeline to start…${RESET}`);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    render(jobs);

    const anyFailed = jobs.some((j) => j.status === "failed");
    // True completion: the 'complete' step row exists AND is completed.
    // The runner inserts steps lazily as it progresses, so
    // "all rows in the table are completed" fires prematurely when
    // only 'scrape' exists. Waiting on 'complete' specifically avoids
    // that race.
    const completeRow = jobs.find((j) => j.step === "complete");
    const allCompleted = completeRow?.status === "completed";

    if (anyFailed) {
      const fail = jobs.find((j) => j.status === "failed");
      console.log();
      console.log(`${RED}✗ Pipeline failed at step "${fail.step}":${RESET} ${fail.error || fail.message}`);
      await sql.end();
      process.exit(3);
    }
    if (allCompleted) {
      const [postRow] = await sql`SELECT COUNT(*)::int AS n FROM posts WHERE site_id = ${site.id}`;
      console.log();
      console.log(`${GREEN}✓ Done.${RESET} ${postRow.n} posts live at ${BOLD}https://buildmy.directory/${slug}${RESET}`);
      await sql.end();
      return;
    }

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.log();
      console.error(`${YELLOW}⚠ 30 min elapsed without completion — giving up on the watch${RESET}`);
      await sql.end();
      process.exit(4);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((err) => {
  process.stdout.write(SHOW_CURSOR);
  console.error(err);
  process.exit(1);
});
