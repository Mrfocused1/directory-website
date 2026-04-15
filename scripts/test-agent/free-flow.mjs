#!/usr/bin/env node
/**
 * Walks the full FREE-PLAN flow end-to-end on BOTH viewports,
 * stopping at every step to record: what's on screen, any console
 * errors, any layout bugs, mobile overflow, dead buttons.
 *
 * Flow:
 *   1. / (homepage) — click "Start Free" CTA
 *   2. /onboarding → should redirect to /login?next=/onboarding (unauthed)
 *   3. /login in Signup mode — fill form, submit
 *   4. Verify the "check your email" confirmation screen shows
 *   5. Simulate email-link by calling admin.generateLink via the service
 *      role client directly, then navigate to the returned URL
 *   6. /auth/callback → /onboarding?handle=... (authed now)
 *   7. Onboarding step 1: enter handle, click Next
 *   8. Onboarding step 2: slug + display name — check URL preview
 *      shows buildmy.directory/<slug>; submit
 *   9. Onboarding step 3: processing screen — wait and check status
 *  10. Navigate to public directory — check it renders
 *
 * Produces a structured report and exits non-zero if anything broke.
 *
 * Usage: node scripts/test-agent/free-flow.mjs [--base=http://localhost:3000]
 */

import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const BASE =
  process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ||
  "http://localhost:3000";

// Read env from .env.local for the service role client
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Direct DB client so we can wipe the app-side users row on cleanup.
// Deleting the Supabase auth user alone leaves an orphan in our users
// table, and its sites row blocks the next test's slug reuse.
const sql = postgres(env.DATABASE_URL, { max: 1 });

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

const issues = [];
function log(sev, area, msg) {
  issues.push({ sev, area, msg });
  const icons = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "⚪" };
  console.log(`${icons[sev] || "·"} [${sev}] ${area} — ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function step(n, title) {
  console.log(`\n─── Step ${n}: ${title} ─────────────────────────────────`);
}

async function setupPage(browser, vp) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 3 : 1,
  });
  if (vp.isMobile) {
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    );
  }
  const consoleErrors = [];
  const netErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!/favicon|sourcemap|Failed to load resource/i.test(t))
        consoleErrors.push(`console: ${t.slice(0, 200)}`);
    }
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (!/favicon|_next\/static|\.map$/i.test(u)) {
      netErrors.push(`${r.method()} ${u} ${r.failure()?.errorText}`);
    }
  });
  return { page, consoleErrors, netErrors };
}

async function checkMobileOverflow(page, label, vp) {
  if (!vp.isMobile) return;
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1)
    log("HIGH", "overflow", `${label} [mobile] horizontal scroll +${overflow}px`);
}

async function runFlow(vp) {
  console.log(`\n${"═".repeat(70)}\n   FREE-PLAN FLOW — ${vp.name.toUpperCase()}\n${"═".repeat(70)}`);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const { page, consoleErrors, netErrors } = await setupPage(browser, vp);

  // A fresh email per viewport run
  // Fresh email AND slug per run so reruns never collide on unique constraints.
  const stamp = Date.now().toString(36);
  const testEmail = `qa-${vp.name}-${stamp}@example.com`;
  const testPassword = "testpassword123";
  const testHandle = `qa${vp.name}${stamp}`.slice(0, 24);

  try {
    // ── Step 1: Homepage ──────────────────────────────────────
    step(1, "Homepage / — click Start Free");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 20000 });
    await checkMobileOverflow(page, "/", vp);

    const freeCta = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button, a")];
      const btn = buttons.find((b) => /start free/i.test(b.textContent || ""));
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return {
        text: btn.textContent?.trim(),
        href: btn.href || null,
        tag: btn.tagName,
        visible: r.width > 0 && r.height > 0,
      };
    });
    if (!freeCta) {
      log("CRITICAL", "homepage", `[${vp.name}] "Start Free" CTA not found`);
    } else if (!freeCta.visible) {
      log("HIGH", "homepage", `[${vp.name}] "Start Free" CTA hidden`);
    } else {
      ok(`Start Free CTA found: ${freeCta.tag} "${freeCta.text}" → ${freeCta.href || "button handler"}`);
    }

    // Navigate to /onboarding directly (equivalent to clicking Start Free,
    // but page.goto follows redirects deterministically — Next.js client-
    // side RSC routing can otherwise leave page.url() unchanged).
    await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle2", timeout: 20000 });
    const afterCtaUrl = page.url();
    ok(`goto /onboarding → landed on ${afterCtaUrl}`);

    // ── Step 2: Onboarding redirect ──────────────────────────
    step(2, "Onboarding (should redirect to /login for anon users)");
    if (!/\/login/.test(afterCtaUrl)) {
      log(
        "HIGH",
        "onboarding-gate",
        `[${vp.name}] expected redirect to /login, got ${afterCtaUrl}`,
      );
    } else {
      const next = new URL(afterCtaUrl).searchParams.get("next");
      ok(`redirected to login, next="${next}"`);
      if (!next || !next.startsWith("/onboarding")) {
        log("MEDIUM", "onboarding-gate", `[${vp.name}] next param wrong: "${next}"`);
      }
    }
    await checkMobileOverflow(page, afterCtaUrl, vp);

    // ── Step 3: Signup ───────────────────────────────────────
    step(3, "Login page — Signup mode, submit form");
    const mode = await page.evaluate(() => {
      const h1 = document.querySelector("h1")?.textContent || "";
      return /create/i.test(h1) ? "signup" : /welcome/i.test(h1) ? "login" : "?";
    });
    if (mode !== "signup") {
      log("HIGH", "signup", `[${vp.name}] expected signup mode, got "${mode}"`);
    } else {
      ok(`login page in signup mode`);
    }

    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);
    const submitTxt = await page.evaluate(() => {
      const b = document.querySelector('form button[type="submit"]');
      return b?.textContent?.trim() || "";
    });
    ok(`submit button: "${submitTxt}"`);

    await Promise.all([
      page.waitForFunction(
        () => /check your email|confirmation link|sign in|welcome/i.test(document.body.innerText),
        { timeout: 15000 },
      ).catch(() => null),
      page.click('form button[type="submit"]'),
    ]);
    await new Promise((r) => setTimeout(r, 1500));

    // Poll for success banner instead of a fixed wait — cold-path signup
    // (createUser + generateLink + Resend send) can exceed the 1.5s wait.
    const signupOk = await page
      .waitForFunction(
        () =>
          /check your email|confirmation link/i.test(document.body.innerText),
        { timeout: 10_000, polling: 400 },
      )
      .then(() => true)
      .catch(() => false);

    if (signupOk) {
      ok("signup succeeded — confirmation email message shown");
    } else {
      // Look for concrete error messages only (avoid matching stray "error"
      // substrings like in "Network error" on unrelated page chrome).
      const body = await page.evaluate(() => document.body.innerText);
      const errMatch = body.match(
        /(invalid email|already (been )?registered|too short|please enter|rate limit|failed to|signup failed|something went wrong)[^\n]*/i,
      );
      if (errMatch) {
        log("HIGH", "signup", `[${vp.name}] signup error: ${errMatch[0].slice(0, 150)}`);
      } else {
        log(
          "MEDIUM",
          "signup",
          `[${vp.name}] no confirmation message after 10s (body head: "${body.slice(0, 120)}")`,
        );
      }
    }

    // ── Step 4: Simulate confirmation link click ──────────────
    step(4, "Simulate email confirmation via admin.generateLink");
    // Auto-verify the user via admin so we can skip the email round-trip,
    // then sign them in to get a session cookie.
    const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      log("CRITICAL", "email-confirm", `[${vp.name}] listUsers failed: ${listErr.message}`);
      throw listErr;
    }
    const createdUser = users.users.find((u) => u.email === testEmail);
    if (!createdUser) {
      log("CRITICAL", "email-confirm", `[${vp.name}] created user not found — signup didn't persist`);
      throw new Error("user not found");
    }
    ok(`created user id=${createdUser.id.slice(0, 8)}… confirmed=${!!createdUser.email_confirmed_at}`);

    if (!createdUser.email_confirmed_at) {
      const { error: confErr } = await supabaseAdmin.auth.admin.updateUserById(
        createdUser.id,
        { email_confirm: true },
      );
      if (confErr) {
        log("HIGH", "email-confirm", `[${vp.name}] updateUser failed: ${confErr.message}`);
      } else {
        ok("force-confirmed email");
      }
    }

    // Sign in via the UI
    await page.goto(`${BASE}/login?next=${encodeURIComponent("/onboarding")}`, {
      waitUntil: "networkidle2",
    });
    // Switch to login mode
    await page.evaluate(() => {
      const signInBtn = [...document.querySelectorAll("button")].find((b) =>
        /^sign in$/i.test(b.textContent || ""),
      );
      signInBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    await page.evaluate(() => {
      document.querySelectorAll("input").forEach((i) => {
        i.value = "";
      });
    });
    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => null),
      page.click('form button[type="submit"]'),
    ]);
    const signedInUrl = page.url();
    if (!/onboarding/.test(signedInUrl)) {
      log(
        "HIGH",
        "login",
        `[${vp.name}] after sign-in expected /onboarding, got ${signedInUrl}`,
      );
    } else {
      ok(`signed in → ${signedInUrl}`);
    }

    // ── Step 5-7: Onboarding ──────────────────────────────────
    step(5, "Onboarding step 1 — enter handle");
    await checkMobileOverflow(page, "/onboarding", vp);

    const handleInput = await page.$('input[placeholder*="handle" i], input[placeholder*="@" i], #handle, input[type="text"]');
    if (!handleInput) {
      log("CRITICAL", "onboarding", `[${vp.name}] no handle input on step 1`);
      throw new Error("no handle input");
    }
    await handleInput.type(testHandle);

    // Find "Next" or continue button
    const nextBtn1 = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /next|continue|customize/i.test(x.textContent || ""),
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { text: b.textContent?.trim(), visible: r.width > 0 };
    });
    if (!nextBtn1) {
      log("HIGH", "onboarding", `[${vp.name}] no next button on step 1`);
    } else {
      ok(`next button: "${nextBtn1.text}"`);
    }
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /next|continue|customize/i.test(x.textContent || ""),
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    step(6, "Onboarding step 2 — slug + display name");
    // Verify URL preview shows new path format
    const previewText = await page.evaluate(() => document.body.innerText);
    if (/buildmy\.directory\//.test(previewText)) {
      ok(`URL preview format looks right (buildmy.directory/…)`);
    } else if (/\.buildmy\.directory/.test(previewText)) {
      log("HIGH", "onboarding", `[${vp.name}] URL preview still shows old subdomain format`);
    }

    const slugVal = await page.$eval("#slug", (i) => i.value).catch(() => "");
    ok(`slug prefilled: "${slugVal}"`);

    // Display name should have a value
    const nameVal = await page.$eval("#displayName", (i) => i.value).catch(() => "");
    ok(`displayName prefilled: "${nameVal}"`);

    // Click Build Directory
    const buildBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /build|create my directory|let.*s go/i.test(x.textContent || ""),
      );
      if (!b) return null;
      return { text: b.textContent?.trim(), type: b.type };
    });
    if (!buildBtn) {
      log("CRITICAL", "onboarding", `[${vp.name}] no Build button on step 2`);
    } else {
      ok(`build button: "${buildBtn.text}"`);
    }

    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /build|create my directory|let.*s go/i.test(x.textContent || ""),
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // ── Step 7: Processing screen ────────────────────────────
    step(7, "Processing screen — check for progress or error");
    const processingState = await page.evaluate(() => ({
      body: document.body.innerText.slice(0, 600),
      hasProgress: !!document.querySelector('[role="progressbar"], progress'),
    }));
    ok(`processing body: ${processingState.body.slice(0, 200).replace(/\s+/g, " ")}`);
    if (/Authentication required/i.test(processingState.body)) {
      log("CRITICAL", "pipeline", `[${vp.name}] pipeline POST returned 401 — auth gate failed`);
    }

    // We use a fake handle so Apify will report "profile not found".
    // Success criteria: the pipeline exits its processing state (either
    // "done" for real handles OR "error" surface for fake ones) with a
    // human-readable message — not stuck spinning.
    const finalState = await page
      .waitForFunction(
        () => {
          const t = document.body.innerText;
          if (/your directory is live|directory is ready|view directory/i.test(t)) return "done";
          if (/go back.*try again|couldn't build|failed to scrape/i.test(t)) return "error-recoverable";
          return false;
        },
        { timeout: 150_000, polling: 1500 },
      )
      .then((h) => h.jsonValue())
      .catch(() => "timeout");

    if (finalState === "done") {
      ok("pipeline finished — directory live");
    } else if (finalState === "error-recoverable") {
      const err = await page.evaluate(() => {
        // Isolate error message text (if the UI shows a scoped error card)
        const match = document.body.innerText.match(
          /(failed to scrape[^\n]*|couldn't build[^\n]*|something went wrong[^\n]*)/i,
        );
        return match?.[0] || "";
      });
      ok(`pipeline surfaced error gracefully with retry: "${err.slice(0, 140)}"`);
    } else {
      log("HIGH", "pipeline", `[${vp.name}] pipeline did not resolve in 150s`);
    }

    // ── Step 8: Visit the directory ──────────────────────────
    if (finalState === "done") {
      step(8, "Visit the live directory");
      const viewBtn = await page.evaluate(() => {
        const b = [...document.querySelectorAll("a, button")].find((x) =>
          /view directory|visit/i.test(x.textContent || ""),
        );
        return b?.href || null;
      });
      if (viewBtn) {
        await page.goto(viewBtn, { waitUntil: "networkidle2" });
        await checkMobileOverflow(page, viewBtn, vp);
        const h1 = await page.$eval("h1", (h) => h.textContent?.trim() || "").catch(() => null);
        ok(`directory h1: "${h1}"`);
      } else {
        log("MEDIUM", "done", `[${vp.name}] no "View Directory" link on done screen`);
      }
    }

    // ── Console + network errors collected across the run ────
    if (consoleErrors.length) {
      for (const e of consoleErrors.slice(0, 5)) {
        log("MEDIUM", "console", `[${vp.name}] ${e.slice(0, 160)}`);
      }
    }
    if (netErrors.length) {
      for (const e of netErrors.slice(0, 5)) {
        log("MEDIUM", "network", `[${vp.name}] ${e.slice(0, 160)}`);
      }
    }
  } finally {
    // Cleanup — wipe app-side users row (cascades to sites/posts) then
    // the Supabase auth user. Order matters: delete DB row first so the
    // FK to auth.users is removed before the auth user.
    try {
      const { data } = await supabaseAdmin.auth.admin.listUsers();
      const u = data.users.find((x) => x.email === testEmail);
      if (u) {
        try {
          await sql`DELETE FROM users WHERE id = ${u.id}`;
        } catch (e) {
          console.log(`  · db users row cleanup: ${e.message?.slice(0, 80)}`);
        }
        await supabaseAdmin.auth.admin.deleteUser(u.id);
        ok(`cleaned up test user ${testEmail}`);
      }
    } catch {
      // ignore
    }
    await browser.close();
  }
}

async function main() {
  console.log(`\n🧪 FREE-PLAN END-TO-END FLOW\n   Target: ${BASE}`);

  for (const vp of VIEWPORTS) {
    try {
      await runFlow(vp);
    } catch (e) {
      log("CRITICAL", "flow", `[${vp.name}] aborted: ${e.message?.slice(0, 120)}`);
    }
  }

  console.log(`\n${"═".repeat(70)}\n   SUMMARY\n${"═".repeat(70)}`);
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const i of issues) counts[i.sev]++;
  for (const s of Object.keys(counts)) console.log(`   ${s.padEnd(10)} ${counts[s]}`);
  console.log(`   TOTAL      ${issues.length}`);

  await sql.end();

  if (counts.CRITICAL + counts.HIGH > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
