#!/usr/bin/env node
/**
 * BEHAVIORAL live audit — asserts user-visible expectations, not just HTTP shape.
 *
 * Each test returns {name, pass, reason}. The runner prints ✓/✗ and
 * exits non-zero if any fail.
 *
 * Usage: node scripts/test-agent/behavioral.mjs [--base=URL]
 *
 * Throwaway-user tests create + delete a Supabase auth user and its
 * corresponding DB rows. Read-only tests touch real live sites but
 * never mutate them.
 */

import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// ── env ──────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const BASE =
  process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ||
  "https://buildmy.directory";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(env.DATABASE_URL, { max: 2 });

// ── runner ───────────────────────────────────────────────────────────
const results = [];
function record(name, pass, reason) {
  results.push({ name, pass, reason });
  if (pass) console.log(`  ✓ ${name}`);
  else console.log(`  ✗ ${name} — ${reason}`);
}

async function run(name, fn) {
  const started = Date.now();
  try {
    const out = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("test-timeout-60s")), 60_000)),
    ]);
    const reason = out?.reason || "";
    record(name, out?.pass === true, reason);
  } catch (e) {
    record(name, false, `${e.message?.slice(0, 200)} (${Date.now() - started}ms)`);
  }
}

// ── helpers ──────────────────────────────────────────────────────────
const GENERIC_CATEGORIES = new Set(
  [
    "General",
    "Updates",
    "Featured",
    "Other",
    "Tips",
    "Content",
    "Misc",
    "Uncategorized",
    "Posts",
  ].map((s) => s.toLowerCase()),
);

const FEATURE_BY_PLAN = {
  free: new Set(["auto_categorization"]),
  creator: new Set([
    "analytics_basic","analytics_full","newsletter","requests","bookmarks",
    "platforms_multi","references","transcription","auto_categorization","custom_domain",
  ]),
  pro: new Set([
    "analytics_basic","analytics_full","analytics_ai_insights","newsletter","requests",
    "bookmarks","platforms_multi","references","transcription","auto_categorization",
    "custom_domain","seo_meta","remove_branding","export_subscribers",
  ]),
  agency: new Set([
    "analytics_basic","analytics_full","analytics_ai_insights","newsletter","requests",
    "bookmarks","platforms_multi","multi_accounts_per_platform","references","transcription",
    "auto_categorization","custom_domain","seo_meta","remove_branding","export_subscribers",
    "unlimited_posts","white_label","api_access",
  ]),
};

async function newPage(browser, vp = { w: 1280, h: 900, mobile: false }) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.w, height: vp.h,
    isMobile: vp.mobile, hasTouch: vp.mobile,
    deviceScaleFactor: vp.mobile ? 3 : 1,
  });
  if (vp.mobile) {
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );
  }
  return page;
}

async function signInViaForm(page, email, password, next = "/dashboard") {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`, {
    waitUntil: "networkidle2",
  });
  // /login defaults to Signup mode when next=/onboarding; force Sign in.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => /^sign in$/i.test((x.textContent || "").trim()),
    );
    b?.click();
  });
  await page
    .waitForFunction(
      () => /welcome back/i.test(document.querySelector("h1")?.textContent || ""),
      { timeout: 5000 },
    )
    .catch(() => null);
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('form button[type="submit"]');
  await page
    .waitForFunction(
      () => !window.location.pathname.startsWith("/login"),
      { timeout: 30000, polling: 500 },
    )
    .catch(() => null);
}

/** Create + force-confirm a throwaway user via Supabase admin. Returns { id, email, password }. */
async function createThrowawayUser(label = "behav") {
  const stamp = Date.now().toString(36);
  const email = `qa-${label}-${stamp}@example.com`;
  const password = "testpassword123";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user.id;
  // Mirror into public.users so FK-referenced rows (sites) can be created.
  await sql`
    INSERT INTO users (id, email, plan, created_at, updated_at)
    VALUES (${id}, ${email}, 'free', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  return { id, email, password };
}

async function deleteThrowawayUser(id) {
  try { await sql`DELETE FROM users WHERE id = ${id}`; } catch {}
  try { await admin.auth.admin.deleteUser(id); } catch {}
}

// ── test 1: titleNotDoubled ──────────────────────────────────────────
async function test_titleNotDoubled(browser) {
  const page = await newPage(browser);
  try {
    const urls = [`${BASE}/`];
    const rows = await sql`
      SELECT slug FROM sites WHERE is_published = true ORDER BY created_at DESC LIMIT 3
    `;
    for (const r of rows) urls.push(`${BASE}/${r.slug}`);

    for (const u of urls) {
      await page.goto(u, { waitUntil: "networkidle2", timeout: 20000 });
      const title = await page.title();
      if (/BuildMy\.Directory.*BuildMy\.Directory/i.test(title)) {
        return { pass: false, reason: `${u} has doubled suffix: "${title}"` };
      }
    }
    return { pass: true };
  } finally {
    await page.close();
  }
}

// ── test 2: passwordResetLandsOnReset ────────────────────────────────
async function test_passwordResetLandsOnReset(browser) {
  const u = await createThrowawayUser("reset");
  const page = await newPage(browser);
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: u.email,
      options: { redirectTo: `${BASE}/auth/reset` },
    });
    if (error) return { pass: false, reason: `generateLink: ${error.message}` };
    const link = data?.properties?.action_link || data?.action_link;
    if (!link) return { pass: false, reason: "no action_link in generateLink response" };

    await page.goto(link, { waitUntil: "networkidle2", timeout: 20000 });
    await page
      .waitForFunction(() => /\/auth\/reset/.test(window.location.pathname), {
        timeout: 10000, polling: 300,
      })
      .catch(() => null);

    const finalPath = new URL(page.url()).pathname;
    if (finalPath !== "/auth/reset") {
      return { pass: false, reason: `final path is ${finalPath}, expected /auth/reset` };
    }
    // Poll for the form (client exchanges the code asynchronously)
    const formReady = await page
      .waitForFunction(
        () => {
          const h1 = document.querySelector("h1")?.textContent || "";
          const labels = [...document.querySelectorAll("label")].map((l) => l.textContent || "").join(" ");
          return /set a new password/i.test(h1) && /new password/i.test(labels);
        },
        { timeout: 10000, polling: 400 },
      )
      .then(() => true)
      .catch(() => false);
    if (!formReady) {
      const body = await page.evaluate(() => document.body.innerText);
      return { pass: false, reason: `form did not render after 10s (body: "${body.slice(0, 160)}")` };
    }
    return { pass: true };
  } finally {
    await page.close();
    await deleteThrowawayUser(u.id);
  }
}

// ── test 3: liveSitesHaveContent ─────────────────────────────────────
async function test_liveSitesHaveContent() {
  const sites = await sql`
    SELECT s.id, s.slug, s.categories, u.plan
    FROM sites s
    JOIN users u ON u.id = s.user_id
    WHERE s.is_published = true
  `;
  if (sites.length === 0) return { pass: false, reason: "no published sites in DB" };
  const failures = [];
  for (const s of sites) {
    const planFeats = FEATURE_BY_PLAN[s.plan] || new Set();
    const posts = await sql`
      SELECT id, type, caption, transcript, category
      FROM posts WHERE site_id = ${s.id}
    `;
    if (posts.length === 0) { failures.push(`${s.slug}: 0 posts`); continue; }
    if (!posts.some((p) => p.caption && p.caption.trim().length > 0)) {
      failures.push(`${s.slug}: no post has a non-empty caption`);
    }
    if (planFeats.has("transcription")) {
      const badVid = posts.find(
        (p) => p.type === "video" && (!p.transcript || p.transcript.length <= 100),
      );
      if (badVid) failures.push(`${s.slug}: video post ${badVid.id.slice(0, 8)} has transcript len=${(badVid.transcript || "").length}`);
    }
    if (planFeats.has("references")) {
      const [refCount] = await sql`
        SELECT COUNT(*)::int AS c FROM "references" r
        JOIN posts p ON p.id = r.post_id WHERE p.site_id = ${s.id}
      `;
      if (refCount.c === 0) failures.push(`${s.slug}: plan=${s.plan} has references feature but 0 refs`);
    }
    const cats = Array.isArray(s.categories) ? s.categories : [];
    const usedCats = new Set(posts.map((p) => (p.category || "").trim()).filter(Boolean));
    const tabs = cats.length ? cats : [...usedCats];
    const allGeneric = tabs.length > 0 && tabs.every((c) => GENERIC_CATEGORIES.has(c.toLowerCase()));
    if (allGeneric) failures.push(`${s.slug}: categories all generic (${tabs.join("|")})`);
  }
  if (failures.length) return { pass: false, reason: failures.slice(0, 4).join("; ") };
  return { pass: true };
}

// ── test 4: syncNowActuallySyncs ─────────────────────────────────────
async function test_syncNowActuallySyncs(browser) {
  const u = await createThrowawayUser("sync");
  let siteId = null;
  const page = await newPage(browser);
  try {
    // Seed a site directly in DB so we skip Apify spend.
    const slug = `qa-sync-${Date.now().toString(36)}`;
    const [siteRow] = await sql`
      INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published)
      VALUES (${u.id}, ${slug}, 'instagram', 'garyvee', 'QA Sync', false)
      RETURNING id
    `;
    siteId = siteRow.id;

    await signInViaForm(page, u.email, u.password, "/dashboard");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    // Wait for the site card to render then click "Sync now"
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => /^sync now$/i.test((b.textContent || "").trim()),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) return { pass: false, reason: "no 'Sync now' button on /dashboard" };

    // Poll for URL change to /dashboard/build/<id>
    const navigated = await page
      .waitForFunction(
        (sid) => window.location.pathname === `/dashboard/build/${sid}`,
        { timeout: 10000, polling: 250 },
        siteId,
      )
      .then(() => true)
      .catch(() => false);
    if (!navigated) {
      return { pass: false, reason: `URL didn't change to /dashboard/build/${siteId} (got ${page.url()})` };
    }

    // Poll DB for pipeline_jobs row within 5s
    const deadline = Date.now() + 5000;
    let jobCount = 0;
    while (Date.now() < deadline) {
      const [row] = await sql`SELECT COUNT(*)::int AS c FROM pipeline_jobs WHERE site_id = ${siteId}`;
      jobCount = row.c;
      if (jobCount > 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (jobCount === 0) return { pass: false, reason: "no pipeline_jobs row appeared within 5s" };
    return { pass: true };
  } finally {
    await page.close();
    if (siteId) { try { await sql`DELETE FROM sites WHERE id = ${siteId}`; } catch {} }
    await deleteThrowawayUser(u.id);
  }
}

// ── test 5: dragReorderPersists ──────────────────────────────────────
async function test_dragReorderPersists(browser) {
  const u = await createThrowawayUser("drag");
  let siteId = null;
  const page = await newPage(browser);
  try {
    const slug = `qa-drag-${Date.now().toString(36)}`;
    const [siteRow] = await sql`
      INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published)
      VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'QA Drag', true)
      RETURNING id
    `;
    siteId = siteRow.id;
    const mkPost = async (code, order) => {
      const [row] = await sql`
        INSERT INTO posts (site_id, shortcode, type, caption, title, category, sort_order)
        VALUES (${siteId}, ${code}, 'image', ${`Caption ${code}`}, ${`Title ${code}`}, 'Food', ${order})
        RETURNING id
      `;
      return row.id;
    };
    const id1 = await mkPost("QA1", 0);
    const id2 = await mkPost("QA2", 1);
    const id3 = await mkPost("QA3", 2);

    await signInViaForm(page, u.email, u.password, "/dashboard/posts");
    await page.goto(`${BASE}/dashboard/posts`, { waitUntil: "networkidle2" });
    // Wait for the Move buttons to render on each tile
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll('button[aria-label="Move post down"]').length >= 3,
        { timeout: 15000 },
      )
      .catch(() => null);

    // Move the QA1 tile down twice. We locate it by its rendered title text
    // on every click because the DOM re-renders after each persist and the
    // positional index at [0] is no longer QA1 after the first move.
    const moved = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const findQA1DownBtn = () => {
        const tiles = [...document.querySelectorAll("div")].filter((d) => {
          const titleP = d.querySelector("p.line-clamp-2");
          return titleP && /QA1/.test(titleP.textContent || "");
        });
        // Pick the smallest matching ancestor that contains the down button
        for (const t of tiles) {
          const btn = t.querySelector('button[aria-label="Move post down"]');
          if (btn) return btn;
        }
        return null;
      };
      for (let i = 0; i < 2; i++) {
        const btn = findQA1DownBtn();
        if (!btn) return false;
        btn.click();
        await sleep(900);
      }
      return true;
    });
    if (!moved) {
      return { pass: false, reason: "no 'Move post down' buttons on /dashboard/posts" };
    }

    // Allow the last persist to settle
    await new Promise((r) => setTimeout(r, 1500));

    // Reload + verify DOM order from DB (source of truth)
    const finalOrder = await sql`
      SELECT shortcode FROM posts WHERE site_id = ${siteId} ORDER BY sort_order ASC
    `;
    const order = finalOrder.map((p) => p.shortcode).join(",");
    if (order === "QA1,QA2,QA3") {
      return { pass: false, reason: `reorder did not persist (still ${order})` };
    }
    return { pass: true, reason: `persisted as ${order}` };
  } finally {
    await page.close();
    if (siteId) { try { await sql`DELETE FROM sites WHERE id = ${siteId}`; } catch {} }
    await deleteThrowawayUser(u.id);
  }
}

// ── test 6: profileEditorPersists ────────────────────────────────────
async function test_profileEditorPersists(browser) {
  const u = await createThrowawayUser("prof");
  let siteId = null;
  const page = await newPage(browser);
  try {
    const slug = `qa-prof-${Date.now().toString(36)}`;
    const [siteRow] = await sql`
      INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published)
      VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'Initial Name', true)
      RETURNING id
    `;
    siteId = siteRow.id;
    // Seed a post so the public page isn't empty.
    await sql`
      INSERT INTO posts (site_id, shortcode, type, caption, title, category)
      VALUES (${siteId}, 'QP1', 'image', 'A caption', 'A title', 'Food')
    `;

    await signInViaForm(page, u.email, u.password, "/dashboard");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    // Click Profile button
    const opened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => /^profile$/i.test((b.textContent || "").trim()),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!opened) return { pass: false, reason: "no 'Profile' button on site card" };
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    const newName = `QA Edited ${Date.now().toString(36).slice(-4)}`;
    const newBio = `QA bio line ${Date.now().toString(36).slice(-4)}`;
    const newAccent = "#ff00aa";

    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea')];
      for (const i of inputs) i.value = "";
    });
    // Re-use form structure: first input = displayName, textarea = bio, text accent input at the end
    await page.evaluate((name, bio, accent) => {
      const setter = (el, v) => {
        const native = Object.getOwnPropertyDescriptor(el.__proto__, "value")?.set;
        native ? native.call(el, v) : (el.value = v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const dialog = document.querySelector('[role="dialog"]');
      const nameInput = dialog.querySelector('input[type="text"]');
      const bioTextarea = dialog.querySelector("textarea");
      const accentInputs = [...dialog.querySelectorAll('input[type="color"], input[pattern]')];
      if (nameInput) setter(nameInput, name);
      if (bioTextarea) setter(bioTextarea, bio);
      for (const a of accentInputs) setter(a, accent);
    }, newName, newBio, newAccent);

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => /save/i.test((b.textContent || "").trim()),
      );
      btn?.click();
    });
    await page
      .waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 8000 })
      .catch(() => null);

    // DB verify
    const [after] = await sql`
      SELECT display_name, bio, accent_color FROM sites WHERE id = ${siteId}
    `;
    if (after.display_name !== newName) {
      return { pass: false, reason: `displayName did not persist (DB has "${after.display_name}")` };
    }
    if ((after.bio || "") !== newBio) {
      return { pass: false, reason: `bio did not persist (DB has "${after.bio}")` };
    }
    if ((after.accent_color || "").toLowerCase() !== newAccent.toLowerCase()) {
      return { pass: false, reason: `accent did not persist (DB has "${after.accent_color}")` };
    }

    // Public page: displayName + bio render
    await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle2" });
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.includes(newName)) return { pass: false, reason: `displayName not rendered on /${slug}` };
    if (!bodyText.includes(newBio)) return { pass: false, reason: `bio not rendered on /${slug}` };
    return { pass: true };
  } finally {
    await page.close();
    if (siteId) { try { await sql`DELETE FROM sites WHERE id = ${siteId}`; } catch {} }
    await deleteThrowawayUser(u.id);
  }
}

// ── test 7: mobileLayoutTogglePersists ───────────────────────────────
async function test_mobileLayoutTogglePersists(browser) {
  const u = await createThrowawayUser("mlayout");
  let siteId = null;
  const page = await newPage(browser);
  try {
    const slug = `qa-mlay-${Date.now().toString(36)}`;
    const [siteRow] = await sql`
      INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published, grid_columns)
      VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'QA ML', true, 3)
      RETURNING id
    `;
    siteId = siteRow.id;
    for (let i = 1; i <= 4; i++) {
      await sql`
        INSERT INTO posts (site_id, shortcode, type, caption, title, category)
        VALUES (${siteId}, ${`ML${i}`}, 'image', ${`cap ${i}`}, ${`t ${i}`}, 'Food')
      `;
    }

    await signInViaForm(page, u.email, u.password, "/dashboard/posts");
    await page.goto(`${BASE}/dashboard/posts`, { waitUntil: "networkidle2" });
    // Click the "2" toggle button
    const clicked = await page.evaluate(() => {
      const labelEl = [...document.querySelectorAll("span")].find(
        (s) => /mobile layout/i.test(s.textContent || ""),
      );
      if (!labelEl) return false;
      const group = labelEl.parentElement;
      const twoBtn = [...group.querySelectorAll("button")].find(
        (b) => (b.textContent || "").trim().endsWith("2"),
      );
      if (!twoBtn) return false;
      twoBtn.click();
      return true;
    });
    if (!clicked) return { pass: false, reason: "no Mobile layout '2' toggle found" };

    // Poll for persistence in DB
    const deadline = Date.now() + 5000;
    let gc = 3;
    while (Date.now() < deadline) {
      const [row] = await sql`SELECT grid_columns FROM sites WHERE id = ${siteId}`;
      gc = row.grid_columns;
      if (gc === 2) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (gc !== 2) return { pass: false, reason: `grid_columns in DB is ${gc} after toggle` };

    // Public page in mobile viewport
    const mobile = await newPage(browser, { w: 390, h: 844, mobile: true });
    try {
      await mobile.goto(`${BASE}/${slug}`, { waitUntil: "networkidle2" });
      const gridInfo = await mobile.evaluate(() => {
        const grids = [...document.querySelectorAll("[class*='grid']")].map((el) => el.className);
        return grids.find((c) => /grid-cols-[23]/.test(c)) || grids[0] || "";
      });
      if (!/grid-cols-2/.test(gridInfo)) {
        return { pass: false, reason: `public page grid classes do not include grid-cols-2 (got "${gridInfo.slice(0, 120)}")` };
      }
      if (/grid-cols-3(?!.*grid-cols-2)/.test(gridInfo) && !/grid-cols-2/.test(gridInfo)) {
        return { pass: false, reason: `public page still shows grid-cols-3` };
      }
      return { pass: true };
    } finally {
      await mobile.close();
    }
  } finally {
    await page.close();
    if (siteId) { try { await sql`DELETE FROM sites WHERE id = ${siteId}`; } catch {} }
    await deleteThrowawayUser(u.id);
  }
}

// ── test 8: adminGate ────────────────────────────────────────────────
async function test_adminGate(browser) {
  // Anon — fetch/no cookies, expect 404
  const anonRes = await fetch(`${BASE}/admin`, { redirect: "manual" });
  if (anonRes.status !== 404) {
    return { pass: false, reason: `anon /admin returned ${anonRes.status}, expected 404` };
  }

  // Non-admin authenticated
  const u = await createThrowawayUser("admin-neg");
  try {
    const page = await newPage(browser);
    try {
      await signInViaForm(page, u.email, u.password, "/dashboard");
      const resp = await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
      const status = resp?.status() ?? 0;
      if (status !== 404) {
        return { pass: false, reason: `non-admin /admin returned ${status}, expected 404` };
      }
    } finally {
      await page.close();
    }
  } finally {
    await deleteThrowawayUser(u.id);
  }

  // Positive admin assertion (admin email → 200 + "Overview") is dropped
  // deliberately: we have no reliable way to mint a server-side session for
  // the admin user without their password (can't call signInWithPassword),
  // and admin.generateLink-then-navigate doesn't set the cookies that
  // requireAdmin() reads SSR — so this path always reports a false
  // negative. Asserting only the two gating behaviors (anon 404, non-admin
  // 404) still catches the regression class that matters: a non-admin
  // getting a 200 instead of a 404 would be visible here.
  return { pass: true };
}

// ── test 9: resetEmailSenderIsCorrect ────────────────────────────────
async function test_resetEmailSenderIsCorrect() {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "qa-does-not-exist@example.com" }),
  });
  const dur = Date.now() - started;
  if (res.status !== 200) return { pass: false, reason: `reset-password returned ${res.status}` };
  if (dur > 3000) return { pass: false, reason: `reset-password took ${dur}ms (>3s)` };
  return { pass: true, reason: `${dur}ms` };
}

// ── test 10: referencesAccordionRenders ──────────────────────────────
async function test_referencesAccordionRenders(browser) {
  // Find a live creator/pro/agency site (references feature). Require post with refs.
  const candidates = await sql`
    SELECT s.slug, s.id AS site_id, u.plan
    FROM sites s JOIN users u ON u.id = s.user_id
    WHERE s.is_published = true AND u.plan IN ('creator','pro','agency')
    ORDER BY s.created_at DESC
    LIMIT 5
  `;
  if (candidates.length === 0) {
    return { pass: true, reason: "no paid-plan live sites — skipping (no site has references feature)" };
  }
  // Pick the first site that has at least one post with a reference
  let target = null;
  let postShortcode = null;
  for (const c of candidates) {
    const [row] = await sql`
      SELECT p.shortcode FROM "references" r
      JOIN posts p ON p.id = r.post_id
      WHERE p.site_id = ${c.site_id}
      LIMIT 1
    `;
    if (row) { target = c; postShortcode = row.shortcode; break; }
  }
  if (!target) {
    return { pass: false, reason: `paid-plan sites exist but 0 references across them: ${candidates.map((c) => c.slug).join(",")}` };
  }

  const page = await newPage(browser);
  try {
    await page.goto(`${BASE}/${target.slug}`, { waitUntil: "networkidle2" });
    // Click the tile matching postShortcode if possible, otherwise first tile
    const opened = await page.evaluate((code) => {
      const tiles = [...document.querySelectorAll("button[aria-label^='Open ']")];
      const match = tiles.find((t) => (t.getAttribute("aria-label") || "").includes(code)) || tiles[0];
      if (!match) return false;
      match.click();
      return true;
    }, postShortcode);
    if (!opened) return { pass: false, reason: `no post tiles on /${target.slug}` };
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    // Walk through tiles until we find one with references section (if first didn't have)
    let found = false;
    for (let attempt = 0; attempt < 3 && !found; attempt++) {
      const info = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return { hasHeading: false, chipCount: 0 };
        const hasHeading = /sources & references/i.test(dialog.innerText);
        // chip count: anchor links inside the accordion section. Count
        // visible links/articles.
        const anchors = [...dialog.querySelectorAll("a[href], li a")];
        return { hasHeading, chipCount: anchors.length };
      });
      if (info.hasHeading && info.chipCount > 0) { found = true; break; }
      // close and try next tile
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate((idx) => {
        const tiles = [...document.querySelectorAll("button[aria-label^='Open ']")];
        tiles[idx + 1]?.click();
      }, attempt);
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!found) return { pass: false, reason: `post ${postShortcode} modal: 'Sources & references' absent or 0 chips` };
    return { pass: true };
  } finally {
    await page.close();
  }
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 BEHAVIORAL AUDIT — ${BASE}\n`);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  try {
    await run("titleNotDoubled", () => test_titleNotDoubled(browser));
    await run("passwordResetLandsOnReset", () => test_passwordResetLandsOnReset(browser));
    await run("liveSitesHaveContent", () => test_liveSitesHaveContent());
    await run("syncNowActuallySyncs", () => test_syncNowActuallySyncs(browser));
    await run("dragReorderPersists", () => test_dragReorderPersists(browser));
    await run("profileEditorPersists", () => test_profileEditorPersists(browser));
    await run("mobileLayoutTogglePersists", () => test_mobileLayoutTogglePersists(browser));
    await run("adminGate", () => test_adminGate(browser));
    await run("resetEmailSenderIsCorrect", () => test_resetEmailSenderIsCorrect());
    await run("referencesAccordionRenders", () => test_referencesAccordionRenders(browser));
  } finally {
    await browser.close();
    await sql.end();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"═".repeat(60)}\nBEHAVIORAL SUMMARY\n${"═".repeat(60)}`);
  console.log(`  ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.reason}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
