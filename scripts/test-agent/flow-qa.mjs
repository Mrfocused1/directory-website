#!/usr/bin/env node
/**
 * Deep flow QA — exercises every route and form on the site
 * at desktop + mobile. Finds real bugs: 404s, 500s, broken buttons,
 * mobile overflow, console errors, dead handlers.
 *
 * Usage: node scripts/test-agent/flow-qa.mjs [--base=URL]
 */

import puppeteer from "puppeteer";

const BASE =
  process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ||
  "http://localhost:3000";

const issues = [];
function log(sev, area, msg) {
  issues.push({ sev, area, msg });
  const icons = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "⚪", INFO: "ℹ️" };
  console.log(`${icons[sev] || "·"} [${sev}] ${area} — ${msg}`);
}
function section(t) {
  console.log(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);
}

// Pages to smoke-test at both viewports
const PUBLIC_PAGES = [
  "/",
  "/login",
  "/forgot-password",
  "/auth/reset",
  "/onboarding",
  "/privacy",
  "/terms",
  "/demo",
  "/demo/requests",
  "/demo/collections",
  "/demo/preferences?token=bogus",
  "/demo/unsubscribe?token=bogus",
  "/embed/demo",
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

async function newPage(browser, vp) {
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
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
  }
  return page;
}

async function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!/favicon|sourcemap|analytics|Failed to load resource/i.test(t)) errors.push(`console: ${t}`);
    }
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (!/favicon|_next\/static|\.map$/i.test(u)) errors.push(`net: ${r.method()} ${u} ${r.failure()?.errorText}`);
  });
  return errors;
}

async function suitePages(browser) {
  section("Public routes — HTTP + console + mobile overflow");
  for (const vp of VIEWPORTS) {
    for (const path of PUBLIC_PAGES) {
      const page = await newPage(browser, vp);
      const errs = await collectPageErrors(page);
      let status = 0;
      try {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 20000 });
        status = resp?.status() ?? 0;
      } catch (e) {
        log("HIGH", "route", `${path} [${vp.name}] failed to load: ${e.message?.slice(0, 80)}`);
        await page.close();
        continue;
      }
      if (status >= 500) {
        log("CRITICAL", "route", `${path} [${vp.name}] HTTP ${status}`);
      } else if (status >= 400 && status !== 404) {
        log("HIGH", "route", `${path} [${vp.name}] HTTP ${status}`);
      }
      // Overflow check
      if (vp.isMobile) {
        const overflow = await page.evaluate(() => {
          const over = document.documentElement.scrollWidth - window.innerWidth;
          return over > 1 ? over : 0;
        });
        if (overflow > 0) {
          log("HIGH", "overflow", `${path} [mobile] horizontal scroll +${overflow}px`);
        }
      }
      // Console errors
      await new Promise((r) => setTimeout(r, 400));
      for (const e of errs) {
        log("MEDIUM", "console", `${path} [${vp.name}] ${e.slice(0, 140)}`);
      }
      console.log(`  ✓ ${path} [${vp.name}] ${status}`);
      await page.close();
    }
  }
}

async function suiteSitemapRSS() {
  section("Sitemap + RSS + robots");
  const checks = [
    { path: "/robots.txt", want: /User-Agent|Allow|Disallow/i, type: /text\/plain/i },
    { path: "/sitemap.xml", want: /<urlset|<sitemapindex/i, type: /xml/i },
    { path: "/demo/feed.xml", want: /<rss|<feed/i, type: /xml/i },
    { path: "/demo/opengraph-image", want: null, type: /image\/png/i },
  ];
  for (const c of checks) {
    try {
      const r = await fetch(`${BASE}${c.path}`);
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) {
        log("HIGH", "static", `${c.path} HTTP ${r.status}`);
        continue;
      }
      if (!c.type.test(ct)) {
        log("MEDIUM", "static", `${c.path} content-type ${ct} does not match ${c.type}`);
      }
      if (c.want) {
        const body = await r.text();
        if (!c.want.test(body)) {
          log("HIGH", "static", `${c.path} body does not match expected shape`);
        } else {
          console.log(`  ✓ ${c.path} (${ct.split(";")[0]})`);
        }
      } else {
        console.log(`  ✓ ${c.path} (${ct.split(";")[0]})`);
      }
    } catch (e) {
      log("HIGH", "static", `${c.path} fetch failed: ${e.message}`);
    }
  }
}

async function suiteHomepageInteractions(browser) {
  section("Homepage — pricing + contact + footer + smooth scroll");
  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp);
    const errs = await collectPageErrors(page);
    try {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 20000 });
    } catch (e) {
      log("HIGH", "home", `[${vp.name}] failed to load: ${e.message?.slice(0, 80)}`);
      await page.close();
      continue;
    }

    // Pricing CTAs — every plan button should be wired
    const planBtns = await page.$$eval(
      'button, a',
      (els) =>
        els
          .filter((e) => /get started|choose|subscribe|upgrade/i.test(e.textContent || ""))
          .map((e) => ({
            tag: e.tagName,
            text: (e.textContent || "").trim().slice(0, 40),
            href: (e).href || null,
            disabled: (e).disabled ?? false,
          })),
    );
    if (planBtns.length === 0) {
      log("MEDIUM", "home", `[${vp.name}] no pricing CTAs found`);
    } else {
      console.log(`  ✓ [${vp.name}] ${planBtns.length} CTAs found on homepage`);
    }

    // Contact form: fill fake and submit
    const contactForm = await page.$("form");
    if (contactForm) {
      try {
        const nameInput = await page.$('input[name="name"], #contact-name');
        const emailInput = await page.$('input[type="email"]');
        const msgInput = await page.$("textarea");
        if (nameInput && emailInput && msgInput) {
          await nameInput.type("QA Tester");
          await emailInput.type("qa@example.com");
          await msgInput.type("This is an automated QA message. Please ignore.");
          // Find the submit button within form
          const submit = await page.$('form button[type="submit"], form input[type="submit"]');
          if (submit) {
            // Don't actually submit real contact form — spammy. Skip.
            console.log(`  ✓ [${vp.name}] contact form fillable (submit skipped to avoid spam)`);
          } else {
            log("MEDIUM", "contact", `[${vp.name}] contact form has no submit button`);
          }
        } else {
          log("LOW", "contact", `[${vp.name}] contact form missing expected fields`);
        }
      } catch (e) {
        log("MEDIUM", "contact", `[${vp.name}] contact interaction failed: ${e.message?.slice(0, 80)}`);
      }
    }

    // Footer links — resolve every <a href> in footer
    const footerLinks = await page.$$eval('footer a, [class*="footer"] a', (as) =>
      as
        .map((a) => a.href)
        .filter((h) => h && !h.startsWith("mailto:") && !h.startsWith("tel:") && !h.startsWith("#"))
        .filter((h, i, arr) => arr.indexOf(h) === i),
    );
    for (const href of footerLinks) {
      // Only check same-origin
      if (!href.startsWith(BASE)) continue;
      try {
        const r = await fetch(href, { redirect: "manual" });
        if (r.status >= 400 && r.status !== 404 && r.status < 500) {
          log("MEDIUM", "footer", `${href} → HTTP ${r.status}`);
        } else if (r.status >= 500) {
          log("HIGH", "footer", `${href} → HTTP ${r.status}`);
        } else if (r.status === 404) {
          log("HIGH", "footer", `${href} → 404`);
        } else {
          // OK
        }
      } catch (e) {
        log("LOW", "footer", `${href} fetch failed: ${e.message?.slice(0, 60)}`);
      }
    }
    console.log(`  ✓ [${vp.name}] ${footerLinks.length} same-origin footer links checked`);

    for (const e of errs) log("MEDIUM", "console", `/ [${vp.name}] ${e.slice(0, 120)}`);
    await page.close();
  }
}

async function suiteLoginFlow(browser) {
  section("Login flow — signup toggle + forgot-password link");
  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp);
    const errs = await collectPageErrors(page);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    // Toggle to signup
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const signup = btns.find((b) => /sign up/i.test(b.textContent || ""));
      if (signup) {
        signup.click();
        return true;
      }
      return false;
    });
    if (!clicked) log("MEDIUM", "login", `[${vp.name}] no "Sign up" toggle found`);
    await new Promise((r) => setTimeout(r, 200));
    const heading = await page.$eval("h1", (h) => h.textContent || "");
    if (!/create|sign\s?up/i.test(heading)) {
      log("MEDIUM", "login", `[${vp.name}] signup toggle didn't change heading (got: "${heading}")`);
    } else {
      console.log(`  ✓ [${vp.name}] signup toggle works`);
    }
    // Navigate to forgot-password from login
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    const fpResp = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a")).find((x) =>
        /forgot your password/i.test(x.textContent || ""),
      );
      return a?.href || null;
    });
    if (!fpResp || !/forgot-password/.test(fpResp)) {
      log("HIGH", "login", `[${vp.name}] forgot-password link not found`);
    } else {
      console.log(`  ✓ [${vp.name}] forgot-password link present`);
    }
    for (const e of errs) log("MEDIUM", "console", `/login [${vp.name}] ${e.slice(0, 120)}`);
    await page.close();
  }
}

async function suiteDirectoryFlow(browser) {
  section("Directory /demo — search + post modal + subscribe banner");
  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp);
    const errs = await collectPageErrors(page);
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle2" });

    // Search input exists
    const search = await page.$('input[type="search"], input[placeholder*="earch" i]');
    if (!search) {
      log("MEDIUM", "directory", `[${vp.name}] no search input`);
    } else {
      await search.type("a");
      await new Promise((r) => setTimeout(r, 300));
      console.log(`  ✓ [${vp.name}] search accepts input`);
    }

    // Post grid
    const tiles = await page.$$("button[aria-label^='Open ']");
    if (tiles.length === 0) {
      log("MEDIUM", "directory", `[${vp.name}] no post tiles rendered`);
    } else {
      console.log(`  ✓ [${vp.name}] ${tiles.length} post tiles rendered`);
      // Open modal
      try {
        await tiles[0].click();
        await new Promise((r) => setTimeout(r, 500));
        const dialog = await page.$('[role="dialog"]');
        if (!dialog) {
          log("HIGH", "directory", `[${vp.name}] clicking post did not open modal`);
        } else {
          // Close with ESC — AnimatePresence exit animation keeps the node in DOM
          // briefly, so poll for disappearance with a short budget.
          await page.keyboard.press("Escape");
          let closed = false;
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 150));
            const stillOpen = await page.$('[role="dialog"]');
            if (!stillOpen) {
              closed = true;
              break;
            }
          }
          if (!closed) {
            log("MEDIUM", "directory", `[${vp.name}] ESC did not close post modal`);
          } else {
            console.log(`  ✓ [${vp.name}] post modal opens + ESC closes`);
          }
        }
      } catch (e) {
        log("MEDIUM", "directory", `[${vp.name}] post click failed: ${e.message?.slice(0, 80)}`);
      }
    }

    // Featured badge visibility check (some posts should be featured eventually)
    const featured = await page.$$('span:has-text("Featured")').catch(() => []);
    // Fine if empty — demo may not have featured posts yet

    for (const e of errs) log("MEDIUM", "console", `/demo [${vp.name}] ${e.slice(0, 120)}`);
    await page.close();
  }
}

async function suiteDashboardRedirect(browser) {
  section("Dashboard routes — unauth redirect + no 500s");
  const routes = [
    "/dashboard",
    "/dashboard/posts",
    "/dashboard/categories",
    "/dashboard/platforms",
    "/dashboard/analytics",
    "/dashboard/domains",
    "/dashboard/requests",
    "/dashboard/newsletter",
    "/dashboard/api",
    "/dashboard/share",
    "/dashboard/account",
  ];
  const page = await newPage(browser, VIEWPORTS[0]);
  const errs = await collectPageErrors(page);
  for (const r of routes) {
    try {
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: "networkidle2", timeout: 15000 });
      const status = resp?.status() ?? 0;
      const finalUrl = page.url();
      if (status >= 500) {
        log("CRITICAL", "dashboard", `${r} HTTP ${status}`);
      } else if (!/login/.test(finalUrl) && !/dashboard/.test(finalUrl)) {
        log("MEDIUM", "dashboard", `${r} unexpected redirect to ${finalUrl}`);
      } else {
        console.log(`  ✓ ${r} → ${status} (${finalUrl.includes("login") ? "login gate" : "dashboard shell"})`);
      }
    } catch (e) {
      log("HIGH", "dashboard", `${r} navigation failed: ${e.message?.slice(0, 80)}`);
    }
  }
  for (const e of errs) log("MEDIUM", "console", `dashboard-nav ${e.slice(0, 120)}`);
  await page.close();
}

async function suiteForgotPassword(browser) {
  section("Forgot password — form submit + success state");
  const page = await newPage(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle2" });
  const email = await page.$('input[type="email"]');
  if (!email) {
    log("HIGH", "forgot-password", "no email input");
    await page.close();
    return;
  }
  await email.type("test@example.com");
  await page.click('button[type="submit"]');
  // Supabase resetPasswordForEmail call can take a few seconds on cold infra.
  // Poll for the success copy instead of a fixed wait.
  let success = false;
  let bodyText = "";
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    bodyText = await page.evaluate(() => document.body.innerText);
    if (/reset link is on its way|check your inbox/i.test(bodyText)) {
      success = true;
      break;
    }
  }
  if (success) {
    console.log("  ✓ forgot-password success state renders");
  } else {
    log(
      "MEDIUM",
      "forgot-password",
      `no success message after 8s (body: "${bodyText.slice(0, 100)}")`,
    );
  }
  await page.close();
}

async function suitePreferences(browser) {
  section("Preferences page — invalid token shows error");
  const page = await newPage(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/demo/preferences?token=bogus`, { waitUntil: "networkidle2" });
  // Page fetches its own state on mount via /api/subscribe/preferences; poll
  // for the error phrasing instead of a fixed wait.
  let rejected = false;
  let bodyText = "";
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    bodyText = await page.evaluate(() => document.body.innerText);
    // API may return "Site not found" on a non-DB-backed demo tenant
    // (localhost fallback) or "Invalid token" / "Missing" in prod.
    if (/invalid|missing|not found/i.test(bodyText)) {
      rejected = true;
      break;
    }
  }
  if (rejected) {
    console.log("  ✓ preferences rejects bogus token");
  } else {
    log(
      "MEDIUM",
      "preferences",
      `no error state for bogus token after 6s (body: "${bodyText.slice(0, 120)}")`,
    );
  }
  await page.close();
}

async function suiteUnsubscribe(browser) {
  section("Unsubscribe page — renders confirm state, button click shows result");
  const page = await newPage(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/demo/unsubscribe?token=bogus`, { waitUntil: "networkidle2" });
  const btn = await page.$("button");
  if (!btn) {
    log("HIGH", "unsubscribe", "no button rendered");
    await page.close();
    return;
  }
  // Bogus token should result in silent success (DELETE is idempotent) or
  // error state. On a cold dev server the DELETE can take >1.5s because Next
  // lazy-compiles the /api/subscribe route and the Supabase pool does its
  // first TLS handshake. Poll up to ~6s for the UI to settle instead of using
  // a fixed wait.
  await btn.click();
  let settled = false;
  let finalText = "";
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    finalText = await page.evaluate(() => document.body.innerText);
    if (/unsubscribed|something went wrong/i.test(finalText)) {
      settled = true;
      break;
    }
  }
  if (settled) {
    console.log("  ✓ unsubscribe button produces a terminal state");
  } else {
    log(
      "MEDIUM",
      "unsubscribe",
      `button click did not produce done/error state after 6s (body: "${finalText.slice(0, 120)}")`,
    );
  }
  await page.close();
}

async function suiteEmbed(browser) {
  section("Embed — loads, has transparent bg, noindex");
  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp);
    const resp = await page.goto(`${BASE}/embed/demo`, { waitUntil: "networkidle2" });
    if (!resp || resp.status() >= 400) {
      log("HIGH", "embed", `[${vp.name}] HTTP ${resp?.status()}`);
      await page.close();
      continue;
    }
    const robots = await page.evaluate(
      () => document.querySelector('meta[name="robots"]')?.getAttribute("content") || "",
    );
    if (!/noindex/i.test(robots)) {
      log("MEDIUM", "embed", `[${vp.name}] meta robots missing noindex (got: "${robots}")`);
    } else {
      console.log(`  ✓ [${vp.name}] embed renders + noindex`);
    }
    await page.close();
  }
}

async function main() {
  console.log(`\n🧪 Deep Flow QA — ${BASE}\n`);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    await suitePages(browser);
    await suiteSitemapRSS();
    await suiteHomepageInteractions(browser);
    await suiteLoginFlow(browser);
    await suiteDirectoryFlow(browser);
    await suiteDashboardRedirect(browser);
    await suiteForgotPassword(browser);
    await suitePreferences(browser);
    await suiteUnsubscribe(browser);
    await suiteEmbed(browser);
  } finally {
    await browser.close();
  }

  console.log(`\n${"═".repeat(70)}\nFLOW QA SUMMARY\n${"═".repeat(70)}`);
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const i of issues) counts[i.sev]++;
  for (const s of Object.keys(counts)) console.log(`  ${s.padEnd(10)} ${counts[s]}`);
  console.log(`  TOTAL      ${issues.length}`);
  if (counts.CRITICAL + counts.HIGH > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
