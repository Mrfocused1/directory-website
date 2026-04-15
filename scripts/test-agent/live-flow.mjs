#!/usr/bin/env node
/**
 * LIVE end-to-end test against production https://buildmy.directory
 * with a REAL Instagram handle. Unlike free-flow.mjs which targets
 * localhost with fake handles (and leans on the empty-scrape path),
 * this one proves the production pipeline actually scrapes real posts.
 *
 *   node scripts/test-agent/live-flow.mjs [--base=URL] [--handle=garyvee]
 *
 * Creates a throwaway user via the production /api/auth/signup endpoint,
 * force-confirms via Supabase admin API (skipping the email), signs in
 * through the real login form, walks onboarding with a real public IG
 * handle, polls the build page, and verifies posts landed in the DB +
 * rendered on the public tenant page.
 */

import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

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
const HANDLE =
  process.argv.find((a) => a.startsWith("--handle="))?.split("=")[1] ||
  "garyvee";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(env.DATABASE_URL, { max: 1 });

const issues = [];
function log(sev, area, msg) {
  issues.push({ sev, area, msg });
  const icons = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "⚪" };
  console.log(`${icons[sev] || "·"} [${sev}] ${area} — ${msg}`);
}
const ok = (m) => console.log(`  ✓ ${m}`);
const step = (n, t) =>
  console.log(`\n─── ${n}: ${t} ─────────────────────────────────`);

async function main() {
  console.log(`\n🧪 LIVE FLOW — ${BASE} with @${HANDLE}\n`);

  const stamp = Date.now().toString(36);
  const email = `qa-live-${stamp}@example.com`;
  const password = "testpassword123";
  const slug = `live-${HANDLE.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${stamp}`.slice(0, 60);
  let createdUserId = null;
  let createdSiteId = null;

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

  try {
    step("1", "signup via /api/auth/signup (prod)");
    const signupRes = await fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, next: "/onboarding" }),
    });
    if (!signupRes.ok) {
      const body = await signupRes.text();
      log("CRITICAL", "signup", `${signupRes.status}: ${body.slice(0, 200)}`);
      return;
    }
    ok(`signup 200`);

    // Pick the user up from Supabase + force-confirm
    const { data: list } = await admin.auth.admin.listUsers();
    const u = list.users.find((x) => x.email === email);
    if (!u) {
      log("CRITICAL", "signup", "Supabase user missing after signup");
      return;
    }
    createdUserId = u.id;
    if (!u.email_confirmed_at) {
      await admin.auth.admin.updateUserById(u.id, { email_confirm: true });
    }
    ok(`user force-confirmed (${u.id.slice(0, 8)})`);

    step("2", "sign in through the real login form");
    await page.goto(`${BASE}/login?next=${encodeURIComponent("/onboarding")}`, {
      waitUntil: "networkidle2",
    });
    // The login page defaults to Signup mode when coming from /onboarding
    // (so new users don't have to click "Sign up" first). We just created
    // the user via /api/auth/signup, so click "Sign in" to flip to the
    // sign-in form.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => /^sign in$/i.test((x.textContent || "").trim()),
      );
      b?.click();
    });
    await page.waitForFunction(
      () => /welcome back/i.test(document.querySelector("h1")?.textContent || ""),
      { timeout: 5000 },
    );
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await page.click('form button[type="submit"]');

    // Router.push is client-side. Poll for the pathname to change away
    // from /login, rather than relying on waitForNavigation (which can miss
    // Next.js App Router client transitions).
    const signedIn = await page
      .waitForFunction(
        () => !window.location.pathname.startsWith("/login"),
        { timeout: 30000, polling: 500 },
      )
      .then(() => true)
      .catch(() => false);

    const signedInUrl = page.url();
    if (!signedIn || !/onboarding/.test(new URL(signedInUrl).pathname)) {
      const bodyErr = await page.evaluate(() => {
        const el = document.querySelector('[class*="bg-red-50"], [role="alert"]');
        return el ? el.textContent?.trim() : null;
      });
      log(
        "HIGH",
        "signin",
        `stuck on ${signedInUrl} ${bodyErr ? `· err="${bodyErr.slice(0, 120)}"` : ""}`,
      );
      return;
    }
    ok(`signed in → ${signedInUrl}`);

    step("3", "onboarding: enter real handle");
    // Step 1 is "enter your handle"
    await page.waitForSelector('input[type="text"], input[id="handle"]', { timeout: 20000 });
    const handleInput = await page.$('input[id="handle"], input[type="text"]');
    await handleInput.focus();
    await page.keyboard.type(HANDLE);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /next|continue|customize/i.test(x.textContent || ""),
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    ok(`handle submitted: @${HANDLE}`);

    step("4", "onboarding: customize — override slug to avoid collision");
    // Overwrite slug with our timestamped one so reruns don't clash
    const slugInput = await page.$("#slug");
    await slugInput.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.keyboard.type(slug);
    ok(`slug: ${slug}`);

    // Click Build
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /build my directory|build|create/i.test(x.textContent || ""),
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    ok("clicked Build My Directory");

    step("5", "wait for pipeline to complete (up to 4 min)");
    // Poll DB directly — the production UI polls every few seconds too
    // but a DB poll avoids brittle UI state reads.
    let finalStatus = null;
    let finalError = null;
    for (let i = 0; i < 48; i++) {
      // Up to 48 * 5s = 4 min
      await new Promise((r) => setTimeout(r, 5000));
      const siteRow = await sql`
        SELECT id, is_published FROM sites WHERE user_id = ${createdUserId} AND slug = ${slug}
      `;
      if (siteRow.length === 0) continue; // Site not yet created
      createdSiteId = siteRow[0].id;
      const jobs = await sql`
        SELECT step, status, error, message FROM pipeline_jobs
        WHERE site_id = ${createdSiteId}
        ORDER BY created_at DESC
      `;
      const failed = jobs.find((j) => j.status === "failed");
      const allDone = jobs.length > 0 && jobs.every((j) => j.status === "completed");
      const current = jobs[0]?.step;
      console.log(
        `  [${i * 5}s] site=${siteRow[0].is_published ? "LIVE" : "draft"} current=${current} status=${jobs[0]?.status}`,
      );
      if (siteRow[0].is_published || allDone) {
        finalStatus = "done";
        break;
      }
      if (failed) {
        finalStatus = "failed";
        finalError = failed.error || failed.message || "unknown";
        break;
      }
    }

    if (finalStatus === "done") {
      const [countRow] = await sql`SELECT COUNT(*)::int AS c FROM posts WHERE site_id = ${createdSiteId}`;
      ok(`pipeline completed — ${countRow.c} posts inserted`);
      if (countRow.c === 0) {
        log("HIGH", "pipeline", "finished but zero posts — scrape returned empty");
      }
    } else if (finalStatus === "failed") {
      log("HIGH", "pipeline", `failed: ${String(finalError).slice(0, 180)}`);
    } else {
      log("HIGH", "pipeline", "did not finish in 4 min");
    }

    step("6", "render the live directory");
    await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle2", timeout: 30000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (/404|not found/i.test(bodyText.slice(0, 100))) {
      log("HIGH", "directory", `/${slug} returned 404`);
    } else {
      const h1 = await page
        .$eval("h1", (h) => h.textContent?.trim() || "")
        .catch(() => "");
      const tileCount = await page.$$eval(
        "button[aria-label^='Open ']",
        (ts) => ts.length,
      );
      ok(`directory rendered — h1="${h1}", tiles=${tileCount}`);
    }
  } catch (e) {
    log("CRITICAL", "flow", `aborted: ${e.message?.slice(0, 200)}`);
  } finally {
    await browser.close();

    // Cleanup — delete site (cascade removes posts) + auth user + app-side row
    if (createdSiteId) {
      try {
        await sql`DELETE FROM sites WHERE id = ${createdSiteId}`;
        console.log(`  · cleaned site ${createdSiteId.slice(0, 8)}`);
      } catch (e) {
        console.log(`  · site cleanup failed: ${e.message}`);
      }
    }
    if (createdUserId) {
      try {
        await sql`DELETE FROM users WHERE id = ${createdUserId}`;
        await admin.auth.admin.deleteUser(createdUserId);
        console.log(`  · cleaned user ${createdUserId.slice(0, 8)}`);
      } catch {
        // ignore
      }
    }
    await sql.end();
  }

  console.log(`\n${"═".repeat(60)}\n   SUMMARY\n${"═".repeat(60)}`);
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const i of issues) counts[i.sev]++;
  for (const s of Object.keys(counts)) console.log(`   ${s.padEnd(10)} ${counts[s]}`);
  console.log(`   TOTAL      ${issues.length}`);
  if (counts.CRITICAL + counts.HIGH > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
