/**
 * Site Doctor — autonomous debugging agent for BuildMy.Directory.
 *
 * Runs on the VPS as a standalone Node.js HTTP server on port 3003.
 * Self-contained: no imports from the main app.
 *
 * Endpoints:
 *   GET  /health  — liveness probe
 *   POST /doctor  — full inspection + auto-fix run, returns JSON report
 *
 * Auth: X-Api-Key header checked against /opt/doctor/.api-key
 *       (falls back to /opt/scraper/.api-key).
 *
 * Required env vars (inherit from systemd unit or .env):
 *   DATABASE_URL   — postgres connection string (same DB as the app)
 *   GROQ_API_KEY   — for Whisper transcription
 *   ANTHROPIC_API_KEY — for Claude Haiku reference generation
 */

import http from "node:http";

// Load .env file manually (no dotenv dependency)
import { readFileSync } from "node:fs";
try {
  const envFile = readFileSync("/opt/doctor/.env", "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
import fs from "node:fs";
import { execSync, exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";

const execAsync = promisify(exec);

const PORT = 3003;
const START_TIME = Date.now();

// ── Auth ──────────────────────────────────────────────────────────────────────

function loadApiKey() {
  const candidates = ["/opt/doctor/.api-key", "/opt/scraper/.api-key"];
  for (const p of candidates) {
    try {
      const key = fs.readFileSync(p, "utf8").trim();
      if (key) return key;
    } catch { /* try next */ }
  }
  throw new Error("No API key found at /opt/doctor/.api-key or /opt/scraper/.api-key");
}

const API_KEY = loadApiKey();

// ── DB ────────────────────────────────────────────────────────────────────────

function connectDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

/** HEAD-check a URL. Returns true if it exists (2xx). */
async function urlExists(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/** Check if a local service is up by GETting its health endpoint. */
async function checkLocalService(port, path = "/health") {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`http://localhost:${port}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Inspection 1: Data gaps ───────────────────────────────────────────────────

async function findDataGaps(sql, siteId) {
  const gaps = { missingTranscripts: [], missingReferences: [], staleJobs: [] };

  try {
    gaps.missingTranscripts = await sql`
      SELECT id, shortcode, media_url FROM posts
      WHERE site_id = ${siteId}
        AND type = 'video'
        AND is_visible = true
        AND (transcript IS NULL OR length(transcript) < 20)
    `;
  } catch (err) {
    console.error(`[doctor] missingTranscripts query failed for site ${siteId}:`, err.message);
  }

  try {
    gaps.missingReferences = await sql`
      SELECT p.id, p.shortcode, p.caption FROM posts p
      LEFT JOIN references r ON r.post_id = p.id
      WHERE p.site_id = ${siteId} AND p.is_visible = true
      GROUP BY p.id, p.shortcode, p.caption
      HAVING count(r.id) = 0
    `;
  } catch (err) {
    console.error(`[doctor] missingReferences query failed for site ${siteId}:`, err.message);
  }

  return gaps;
}

async function findStaleJobs(sql) {
  try {
    return await sql`
      SELECT id, site_id, step FROM pipeline_jobs
      WHERE status = 'running'
        AND created_at < now() - interval '30 minutes'
    `;
  } catch (err) {
    console.error("[doctor] staleJobs query failed:", err.message);
    return [];
  }
}

// ── Inspection 2: Puppeteer page check ───────────────────────────────────────

async function puppeteerInspect(slug) {
  const result = { slug, ok: true, statusCode: null, consoleErrors: [], hasModal: false, hasTranscript: false, hasReferences: false, error: null };

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-extra")).default;
    const { default: StealthPlugin } = await import("puppeteer-extra-plugin-stealth");
    puppeteer.use(StealthPlugin());
  } catch (err) {
    result.error = `puppeteer import failed: ${err.message}`;
    result.ok = false;
    return result;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      executablePath: "/usr/bin/chromium-browser",
    });

    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Navigate to the site
    const targetUrl = `https://buildmy.directory/${slug}`;
    let response;
    try {
      response = await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (err) {
      result.error = `page load failed: ${err.message}`;
      result.ok = false;
      return result;
    }

    result.statusCode = response?.status() ?? null;
    result.consoleErrors = consoleErrors.slice(0, 5); // cap at 5

    if (!response?.ok()) {
      result.ok = false;
      result.error = `HTTP ${result.statusCode}`;
      return result;
    }

    // Try clicking first post to open modal
    try {
      await page.waitForSelector("article, [data-shortcode], .post-card, a[href*='/p/']", { timeout: 8000 });
      const firstPost = await page.$("article, [data-shortcode], .post-card, a[href*='/p/']");
      if (firstPost) {
        await firstPost.click();
        await page.waitForSelector("[role='dialog'], .modal, [data-modal]", { timeout: 6000 });
        result.hasModal = true;

        // Check for transcript section
        const transcriptEl = await page.$("[data-transcript], .transcript, [class*='transcript']");
        result.hasTranscript = !!transcriptEl;

        // Check for references section
        const refsEl = await page.$("[data-references], .references, [class*='reference']");
        result.hasReferences = !!refsEl;
      }
    } catch {
      // Modal check is best-effort; don't mark as failed
    }

    result.ok = result.consoleErrors.length === 0 && result.statusCode < 400;
  } catch (err) {
    result.error = err.message;
    result.ok = false;
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }

  return result;
}

// ── Fix 1: Missing transcripts ────────────────────────────────────────────────

async function fixMissingTranscripts(sql, videos, siteSlug, report) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    report.flagged.push({ type: "config", detail: "GROQ_API_KEY not set — transcript fix skipped" });
    return;
  }

  const GROQ_MAX_BYTES = 25 * 1024 * 1024;
  let fixed = 0;
  let skipped = 0;

  for (const video of videos) {
    if (!video.media_url) { skipped++; continue; }

    // HEAD-check — skip expired URLs
    const exists = await urlExists(video.media_url);
    if (!exists) {
      console.log(`[doctor] media_url 404, skipping ${video.shortcode}`);
      report.issues.push({ type: "expired_media", siteSlug, shortcode: video.shortcode, detail: "media_url returned 404" });
      skipped++;
      await sleep(2000);
      continue;
    }

    let transcript = null;
    try {
      // Download video
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 90000);
      const srcRes = await fetch(video.media_url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!srcRes.ok) { skipped++; await sleep(2000); continue; }

      const len = Number(srcRes.headers.get("content-length") || 0);
      if (len && len > GROQ_MAX_BYTES) {
        report.flagged.push({ type: "oversized_video", siteSlug, shortcode: video.shortcode, detail: `${(len / 1024 / 1024).toFixed(1)} MB exceeds Groq 25 MB cap` });
        skipped++;
        await sleep(2000);
        continue;
      }

      const videoBlob = await srcRes.blob();
      if (videoBlob.size > GROQ_MAX_BYTES) {
        report.flagged.push({ type: "oversized_video", siteSlug, shortcode: video.shortcode, detail: `${(videoBlob.size / 1024 / 1024).toFixed(1)} MB exceeds Groq 25 MB cap` });
        skipped++;
        await sleep(2000);
        continue;
      }

      // Upload to Groq Whisper
      const form = new FormData();
      form.append("file", videoBlob, "video.mp4");
      form.append("model", "whisper-large-v3");
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");

      const uploadCtrl = new AbortController();
      const uploadTimer = setTimeout(() => uploadCtrl.abort(), 180000);
      let groqRes;
      try {
        groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: form,
          signal: uploadCtrl.signal,
        });
      } finally {
        clearTimeout(uploadTimer);
      }

      if (!groqRes.ok) {
        const body = await groqRes.text().catch(() => "");
        throw new Error(`Groq HTTP ${groqRes.status}: ${body.slice(0, 200)}`);
      }

      const data = await groqRes.json();
      transcript = data.text || "";
    } catch (err) {
      console.error(`[doctor] transcript failed for ${video.shortcode}:`, err.message);
      report.flagged.push({ type: "transcript_error", siteSlug, shortcode: video.shortcode, detail: err.message });
      await sleep(2000);
      continue;
    }

    if (transcript && transcript.length >= 20) {
      try {
        await sql`UPDATE posts SET transcript = ${transcript}, updated_at = now() WHERE id = ${video.id}`;
        fixed++;
      } catch (err) {
        console.error(`[doctor] DB update failed for ${video.shortcode}:`, err.message);
      }
    } else {
      skipped++;
    }

    await sleep(2000); // rate limit between videos
  }

  if (fixed > 0 || skipped > 0) {
    report.fixes.push({
      type: "missing_transcript",
      success: fixed > 0,
      detail: `Transcribed ${fixed} videos (${skipped} skipped/failed) on ${siteSlug}`,
    });
  }
}

// ── Fix 2: Missing references ─────────────────────────────────────────────────

async function fixMissingReferences(sql, posts, siteSlug, report) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    report.flagged.push({ type: "config", detail: "ANTHROPIC_API_KEY not set — references fix skipped" });
    return;
  }

  const SEARXNG_URL = "http://localhost:8888";
  const BATCH_SIZE = 10;
  let totalInserted = 0;
  let batches = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    batches++;

    // Ask Claude Haiku for reference queries per post
    let aiResult;
    try {
      const prompt = `You are helping build reference sections for social media posts. For each post below, return 3-6 search queries to find relevant articles, papers, or YouTube videos that would add educational value.

Posts:
${batch.map((p, idx) => `[${idx}] ${(p.caption || "").slice(0, 300)}`).join("\n\n")}

Respond with a JSON array exactly like this (one entry per post, same order):
[
  { "postIdx": 0, "queries": ["query 1", "query 2", "query 3"] },
  ...
]

Only output valid JSON, no prose.`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text().catch(() => "");
        throw new Error(`Claude HTTP ${claudeRes.status}: ${err.slice(0, 200)}`);
      }

      const claudeData = await claudeRes.json();
      const raw = claudeData.content?.[0]?.text || "[]";
      aiResult = JSON.parse(raw);
    } catch (err) {
      console.error(`[doctor] Claude references failed:`, err.message);
      report.flagged.push({ type: "references_ai_error", siteSlug, detail: err.message });
      continue;
    }

    // For each post's queries, search via SearXNG and insert results
    for (const entry of aiResult) {
      const post = batch[entry.postIdx];
      if (!post) continue;

      const queries = (entry.queries || []).slice(0, 4);
      const inserted = [];

      for (const query of queries) {
        await sleep(500); // rate limit between search queries
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const searchRes = await fetch(
            `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general`,
            { signal: ctrl.signal },
          );
          clearTimeout(t);

          if (!searchRes.ok) continue;

          const searchData = await searchRes.json();
          const results = (searchData.results || []).slice(0, 2);

          for (const r of results) {
            if (!r.url || !r.title) continue;
            // Skip duplicates
            if (inserted.find((ins) => ins.url === r.url)) continue;

            const kind = r.url.includes("youtube.com") || r.url.includes("youtu.be") ? "youtube" : "article";
            const ytMatch = r.url.match(/[?&]v=([A-Za-z0-9_-]{11})/) || r.url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
            const videoId = ytMatch ? ytMatch[1] : null;

            try {
              await sql`
                INSERT INTO references (post_id, kind, title, url, video_id, note, created_at)
                VALUES (${post.id}, ${kind}, ${r.title.slice(0, 255)}, ${r.url}, ${videoId}, ${"Auto-generated by Site Doctor"}, now())
                ON CONFLICT DO NOTHING
              `;
              inserted.push({ url: r.url });
              totalInserted++;
            } catch { /* dupe or schema mismatch — skip silently */ }
          }
        } catch (err) {
          console.warn(`[doctor] search failed for "${query}":`, err.message);
        }
      }
    }
  }

  if (totalInserted > 0 || batches > 0) {
    report.fixes.push({
      type: "missing_references",
      success: totalInserted > 0,
      detail: `Inserted ${totalInserted} references across ${batches} batches on ${siteSlug}`,
    });
  }
}

// ── Fix 3: Stale pipelines ────────────────────────────────────────────────────

async function fixStalePipelines(sql, staleJobs, report) {
  if (staleJobs.length === 0) return;

  try {
    await sql`
      UPDATE pipeline_jobs
      SET status = 'failed',
          message = 'Timed out — cleaned by Site Doctor',
          updated_at = now()
      WHERE status = 'running'
        AND created_at < now() - interval '30 minutes'
    `;
    report.fixes.push({
      type: "stale_pipelines",
      success: true,
      detail: `Marked ${staleJobs.length} stale job(s) as failed`,
    });
  } catch (err) {
    report.fixes.push({
      type: "stale_pipelines",
      success: false,
      detail: `Failed to clean stale jobs: ${err.message}`,
    });
  }
}

// ── Fix 4: Down services ──────────────────────────────────────────────────────

const SERVICE_MAP = {
  scraper:       { port: 3001, path: "/health", restart: "pkill -f '/opt/scraper/server.mjs'; sleep 2; cd /opt/scraper && nohup node server.mjs >> /opt/scraper/scraper.log 2>&1 &" },
  piper:         { port: 3002, path: "/health", restart: "pkill -f '/opt/piper/server.mjs'; sleep 2; cd /opt/piper && nohup node server.mjs >> /opt/piper/piper.log 2>&1 &" },
  searxng:       { port: 8888, path: "/",       restart: "docker restart searxng" },
  libretranslate:{ port: 5000, path: "/",       restart: "docker restart libretranslate" },
};

async function fixDownServices(report) {
  for (const [name, cfg] of Object.entries(SERVICE_MAP)) {
    const up = await checkLocalService(cfg.port, cfg.path);
    if (up) {
      console.log(`[doctor] ${name} is up on :${cfg.port}`);
      continue;
    }

    console.warn(`[doctor] ${name} is DOWN on :${cfg.port} — attempting restart`);
    report.issues.push({ type: "service_down", detail: `${name} not responding on :${cfg.port}` });

    try {
      execSync(cfg.restart, { timeout: 20000, stdio: "pipe" });
      await sleep(4000);
      const upNow = await checkLocalService(cfg.port, cfg.path);
      report.fixes.push({
        type: "service_restart",
        success: upNow,
        detail: upNow ? `${name} restarted successfully` : `${name} restart attempted but still down`,
      });
    } catch (err) {
      report.fixes.push({
        type: "service_restart",
        success: false,
        detail: `${name} restart failed: ${err.message}`,
      });
    }
  }
}

// ── Main /doctor handler ──────────────────────────────────────────────────────

async function runDoctor() {
  const report = {
    startedAt: new Date().toISOString(),
    completedAt: null,
    sitesInspected: 0,
    issues: [],
    fixes: [],
    flagged: [],
  };

  let sql;
  try {
    sql = connectDb();
  } catch (err) {
    report.flagged.push({ type: "db_error", detail: err.message });
    report.completedAt = new Date().toISOString();
    return report;
  }

  try {
    // ── Step 1: Query all published sites ──────────────────────────────────
    let sites = [];
    try {
      sites = await sql`SELECT id, slug, handle FROM sites WHERE is_published = true`;
    } catch (err) {
      report.flagged.push({ type: "db_error", detail: `sites query failed: ${err.message}` });
      return report;
    }

    report.sitesInspected = sites.length;
    console.log(`[doctor] found ${sites.length} published sites`);

    // ── Step 2: Find stale jobs (global, not per-site) ─────────────────────
    const staleJobs = await findStaleJobs(sql);
    if (staleJobs.length > 0) {
      for (const j of staleJobs) {
        report.issues.push({ type: "stale_pipeline", detail: `job ${j.id} step=${j.step} running >30min` });
      }
      await fixStalePipelines(sql, staleJobs, report);
    }

    // ── Step 3: Fix down services ──────────────────────────────────────────
    await fixDownServices(report);

    // ── Step 4: Per-site inspection + fixes ────────────────────────────────
    for (const site of sites) {
      console.log(`[doctor] inspecting site: ${site.slug}`);

      const gaps = await findDataGaps(sql, site.id);

      // Record issues
      for (const v of gaps.missingTranscripts) {
        report.issues.push({ type: "missing_transcript", siteSlug: site.slug, shortcode: v.shortcode, detail: "video has no transcript" });
      }
      for (const p of gaps.missingReferences) {
        report.issues.push({ type: "missing_references", siteSlug: site.slug, shortcode: p.shortcode, detail: "post has zero references" });
      }

      // Auto-fixes
      if (gaps.missingTranscripts.length > 0) {
        await fixMissingTranscripts(sql, gaps.missingTranscripts, site.slug, report);
      }
      if (gaps.missingReferences.length > 0) {
        await fixMissingReferences(sql, gaps.missingReferences, site.slug, report);
      }
    }

    // ── Step 5: Puppeteer checks (first 3 sites only) ──────────────────────
    const puppeteerSites = sites.slice(0, 3);
    for (const site of puppeteerSites) {
      console.log(`[doctor] puppeteer check: ${site.slug}`);
      const pResult = await puppeteerInspect(site.slug);

      if (!pResult.ok || pResult.consoleErrors.length > 0) {
        report.flagged.push({
          type: "page_error",
          detail: [
            `Console errors on /${pResult.slug}`,
            ...pResult.consoleErrors,
            pResult.error || "",
          ].filter(Boolean).join(" | "),
        });
      }
    }
  } catch (err) {
    report.flagged.push({ type: "unexpected_error", detail: err.message });
    console.error("[doctor] unexpected error:", err);
  } finally {
    try { await sql.end(); } catch { /* ignore */ }
  }

  report.completedAt = new Date().toISOString();
  console.log(`[doctor] done. issues=${report.issues.length} fixes=${report.fixes.length} flagged=${report.flagged.length}`);
  return report;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Health — no auth required
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: (Date.now() - START_TIME) / 1000 }));
    return;
  }

  // Auth check for all other routes
  const authHeader = req.headers["x-api-key"] || "";
  if (authHeader !== API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return;
  }

  if (req.method === "POST" && req.url === "/doctor") {
    // Parse optional body (reserved for future config flags)
    try { await readBody(req); } catch { /* ignore */ }

    console.log("[doctor] POST /doctor — starting run");
    try {
      const report = await runDoctor();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report, null, 2));
    } catch (err) {
      console.error("[doctor] fatal error in runDoctor:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[doctor] listening on :${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[doctor] SIGTERM received — shutting down");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
