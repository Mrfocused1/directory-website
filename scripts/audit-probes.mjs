#!/usr/bin/env node
/**
 * Deep-audit probes — targets flows the standing behavioral suite
 * doesn't cover. Live against buildmy.directory. Each probe reports
 * PASS / FAIL with a short reason. Standalone — doesn't modify the
 * behavioral.mjs suite.
 */
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")]; }),
);
const BASE = "https://buildmy.directory";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(env.DATABASE_URL, { max: 2 });

const findings = [];
function record(id, pass, note) {
  findings.push({ id, pass, note });
  console.log(`  ${pass ? "✓" : "✗"} ${id} — ${note || "ok"}`);
}

async function mkUser(label, plan = "free") {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const email = `qa-audit-${label}-${stamp}@example.com`;
  const password = "testpassword123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`mkUser: ${error.message}`);
  const id = data.user.id;
  await sql`INSERT INTO users (id, email, plan, created_at, updated_at) VALUES (${id}, ${email}, ${plan}, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`;
  return { id, email, password };
}
async function rmUser(id) {
  try { await sql`DELETE FROM users WHERE id = ${id}`; } catch {}
  try { await admin.auth.admin.deleteUser(id); } catch {}
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/dashboard")}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^sign in$/i.test((x.textContent || "").trim()));
    b?.click();
  });
  await page.waitForFunction(() => /welcome back/i.test(document.querySelector("h1")?.textContent || ""), { timeout: 5000 }).catch(() => null);
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.startsWith("/login"), { timeout: 20000, polling: 400 }).catch(() => null);
}

async function run() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  try {
    // ── A1: sync-status endpoint shape for free ─────────────────────
    {
      const u = await mkUser("a1", "free");
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const data = await page.evaluate(async () => (await fetch("/api/pipeline/sync-status")).json());
        const expected = data.enabled === false && data.limit === 0 && data.remaining === 0 && data.used === 0;
        record("A1 sync-status:free", expected, JSON.stringify(data));
      } finally { await page.close(); await rmUser(u.id); }
    }

    // ── A2: sync-status counter increments after a real retry ───────
    {
      const u = await mkUser("a2", "creator");
      const slug = `qa-a2-${Date.now().toString(36)}`;
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published) VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'A2', true) RETURNING id`;
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const before = await page.evaluate(async () => (await fetch("/api/pipeline/sync-status")).json());
        // Trigger a retry — will either succeed or hit cooldown depending on last_sync_at (null here, so no cooldown)
        const post = await page.evaluate(async (sid) => { const r = await fetch(`/api/pipeline/retry?siteId=${sid}`, { method: "POST" }); return { status: r.status, body: await r.text() }; }, s.id);
        const after = await page.evaluate(async () => (await fetch("/api/pipeline/sync-status")).json());
        // A sync that landed in the DB should bump used by 1
        const bumped = post.status === 200 && after.used === before.used + 1;
        record("A2 sync-status:counter-after-retry", bumped, `before=${before.used} post=${post.status} after=${after.used}`);
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A3: cooldown doesn't consume quota ──────────────────────────
    {
      const u = await mkUser("a3", "creator");
      const slug = `qa-a3-${Date.now().toString(36)}`;
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published, last_sync_at) VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'A3', true, NOW()) RETURNING id`;
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const before = await page.evaluate(async () => (await fetch("/api/pipeline/sync-status")).json());
        const post = await page.evaluate(async (sid) => { const r = await fetch(`/api/pipeline/retry?siteId=${sid}`, { method: "POST" }); return { status: r.status, body: await r.text() }; }, s.id);
        const after = await page.evaluate(async () => (await fetch("/api/pipeline/sync-status")).json());
        const parsed = JSON.parse(post.body);
        const ok = post.status === 200 && parsed.cooldown === true && after.used === before.used;
        record("A3 cooldown:no-quota-burn", ok, `before=${before.used} after=${after.used} cooldown=${parsed.cooldown}`);
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A4: quota exceeded returns 429 with reason ──────────────────
    {
      const u = await mkUser("a4", "creator");
      const slug = `qa-a4-${Date.now().toString(36)}`;
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published, last_sync_at) VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'A4', true, NOW() - INTERVAL '2 hours') RETURNING id`;
      const utcFirst = new Date(); utcFirst.setUTCDate(1); utcFirst.setUTCHours(0,0,0,0); utcFirst.setUTCMinutes(utcFirst.getUTCMinutes()+1);
      const first = utcFirst;
      // Seed 31 fake scrape rows in this month so the user is already past the 30-sync limit (Creator plan).
      // The quota counter subtracts 1 for the initial build, so we need 31 rows -> used = 30 -> blocked.
      for (let i = 0; i < 31; i++) {
        await sql`INSERT INTO pipeline_jobs (site_id, step, status, progress, message, created_at) VALUES (${s.id}, 'scrape', 'completed', 100, 'seeded', ${new Date(first.getTime() + i * 1000)})`;
      }
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const post = await page.evaluate(async (sid) => { const r = await fetch(`/api/pipeline/retry?siteId=${sid}`, { method: "POST" }); return { status: r.status, body: await r.text() }; }, s.id);
        const parsed = JSON.parse(post.body);
        const ok = post.status === 429 && parsed.reason === "quota_exceeded" && parsed.used >= 30;
        record("A4 quota:429-reason", ok, `status=${post.status} reason=${parsed.reason} used=${parsed.used}`);
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A5: dashboard button state when remaining = 0 ───────────────
    {
      const u = await mkUser("a5", "creator");
      const slug = `qa-a5-${Date.now().toString(36)}`;
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published) VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'A5', true) RETURNING id`;
      const utcFirst = new Date(); utcFirst.setUTCDate(1); utcFirst.setUTCHours(0,0,0,0); utcFirst.setUTCMinutes(utcFirst.getUTCMinutes()+1);
      const first = utcFirst;
      for (let i = 0; i < 31; i++) {
        await sql`INSERT INTO pipeline_jobs (site_id, step, status, progress, message, created_at) VALUES (${s.id}, 'scrape', 'completed', 100, 'seeded', ${new Date(first.getTime() + i * 1000)})`;
      }
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 1500));
        const state = await page.evaluate(() => {
          const btn = [...document.querySelectorAll("button")].find(
            (b) => /sync now|no syncs left|quota/i.test((b.textContent || "").trim()),
          );
          return btn ? { text: btn.textContent?.trim(), disabled: btn.disabled } : null;
        });
        const text = state?.text || "";
        // With remaining=0 the button MUST (a) be disabled and (b) NOT
        // say "Sync now · 0/N" which reads as available.
        const weirdText = /Sync now · 0\//i.test(text);
        const notDisabled = state && state.disabled === false;
        record(
          "A5 dashboard:quota-0-button-label",
          !weirdText && !notDisabled && !!state,
          `text="${text}" disabled=${state?.disabled}`,
        );
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A6: "Sync — upgrade" link anchors to something useful ───────
    {
      const u = await mkUser("a6", "free");
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published) VALUES (${u.id}, ${`qa-a6-${Date.now().toString(36)}`}, 'instagram', 'qa', 'A6', true) RETURNING id`;
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 1500));
        const href = await page.evaluate(() => {
          const link = [...document.querySelectorAll("a")].find((a) => /sync.*upgrade/i.test(a.textContent || ""));
          return link?.getAttribute("href") || null;
        });
        // Now navigate to the href and check the target element exists
        if (!href) { record("A6 upgrade-link:href-present", false, "no upgrade link"); }
        else {
          await page.goto(`${BASE}${href}`, { waitUntil: "networkidle2" });
          // Extract anchor fragment from href
          const anchor = href.includes("#") ? href.split("#")[1] : null;
          const found = anchor ? await page.evaluate((a) => !!document.getElementById(a), anchor) : true;
          // Even if no anchor, the page should at least render a Plan card
          const hasPlanCard = await page.evaluate(() => /current plan|plan/i.test(document.body.innerText));
          record("A6 upgrade-link:target-exists", found || hasPlanCard, `href=${href} anchorFound=${found} hasPlanCard=${hasPlanCard}`);
        }
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A7: /dashboard/build/<free-site-id> still accessible? ──────
    // Free users can't sync but their initial build flow is here. Should still render (for watching a fresh build).
    {
      const u = await mkUser("a7", "free");
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published) VALUES (${u.id}, ${`qa-a7-${Date.now().toString(36)}`}, 'instagram', 'qa', 'A7', false) RETURNING id`;
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const resp = await page.goto(`${BASE}/dashboard/build/${s.id}`, { waitUntil: "networkidle2" });
        const status = resp?.status() ?? 0;
        const hasError = await page.evaluate(() => /something went wrong|unexpected error/i.test(document.body.innerText));
        record("A7 build-page:free-plan-access", status === 200 && !hasError, `status=${status} err=${hasError}`);
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A8: clock-skew edge case — future lastSyncAt ────────────────
    // Site.lastSyncAt set to 5 min in future (network clock weirdness). Cooldown math: elapsed < 0, < COOLDOWN_MS, triggers cooldown. Fail-safe = OK.
    {
      const u = await mkUser("a8", "creator");
      const [s] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published, last_sync_at) VALUES (${u.id}, ${`qa-a8-${Date.now().toString(36)}`}, 'instagram', 'qa', 'A8', true, NOW() + INTERVAL '5 minutes') RETURNING id`;
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const post = await page.evaluate(async (sid) => { const r = await fetch(`/api/pipeline/retry?siteId=${sid}`, { method: "POST" }); return { status: r.status, body: await r.text() }; }, s.id);
        const parsed = JSON.parse(post.body);
        // Should refuse (cooldown), not throw or allow
        const ok = post.status === 200 && parsed.cooldown === true;
        record("A8 clock-skew:future-lastSyncAt", ok, `status=${post.status} cooldown=${parsed.cooldown}`);
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A9: sync counter correctness with multiple sites ────────────
    // User with 2 sites, 1 scrape row per site = 2 rows total. Post-fix
    // every scrape row counts (no "-1"), so quota reads "2 used".
    {
      const u = await mkUser("a9", "agency");
      const [s1] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published) VALUES (${u.id}, ${`qa-a9a-${Date.now().toString(36)}`}, 'instagram', 'qa', 'A9a', true) RETURNING id`;
      const [s2] = await sql`INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published) VALUES (${u.id}, ${`qa-a9b-${Date.now().toString(36)}`}, 'instagram', 'qa', 'A9b', true) RETURNING id`;
      const utcFirst = new Date(); utcFirst.setUTCDate(1); utcFirst.setUTCHours(0,0,0,0); utcFirst.setUTCMinutes(utcFirst.getUTCMinutes()+1);
      const first = utcFirst;
      await sql`INSERT INTO pipeline_jobs (site_id, step, status, progress, created_at) VALUES (${s1.id}, 'scrape', 'completed', 100, ${first})`;
      await sql`INSERT INTO pipeline_jobs (site_id, step, status, progress, created_at) VALUES (${s2.id}, 'scrape', 'completed', 100, ${first})`;
      const page = await browser.newPage();
      try {
        await signIn(page, u.email, u.password);
        const data = await page.evaluate(async () => (await fetch("/api/pipeline/sync-status")).json());
        record("A9 multi-site:quota-counting", data.used === 2, `used=${data.used} limit=${data.limit}`);
      } finally { await page.close(); await sql`DELETE FROM sites WHERE id = ${s1.id}`.catch(() => {}); await sql`DELETE FROM sites WHERE id = ${s2.id}`.catch(() => {}); await rmUser(u.id); }
    }

    // ── A10: pricing page claims vs reality ─────────────────────────
    {
      const page = await browser.newPage();
      try {
        await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
        const body = await page.evaluate(() => document.body.innerText);
        const freeHasSyncLine = /no ongoing sync|one.?shot build/i.test(body);
        const creatorHasQuotaLine = /30 syncs/i.test(body);
        const proHasQuotaLine = /100 syncs/i.test(body);
        const agencyHasQuotaLine = /500 syncs/i.test(body);
        const ok = freeHasSyncLine && creatorHasQuotaLine && proHasQuotaLine && agencyHasQuotaLine;
        record("A10 pricing-copy:quotas-visible", ok, `free=${freeHasSyncLine} creator=${creatorHasQuotaLine} pro=${proHasQuotaLine} agency=${agencyHasQuotaLine}`);
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
    await sql.end();
  }

  const failed = findings.filter((f) => !f.pass);
  console.log(`\n${"═".repeat(60)}\nAUDIT: ${findings.length - failed.length}/${findings.length} passed\n${"═".repeat(60)}`);
  for (const f of failed) console.log(`  ✗ ${f.id} — ${f.note}`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
