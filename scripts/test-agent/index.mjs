#!/usr/bin/env node
/**
 * BuildMy.Directory — Comprehensive Test Agent
 *
 * Runs end-to-end checks across the production site:
 *  1. Page health (HTTP status, no console errors, no 500s)
 *  2. Multi-viewport layout (mobile 375 + desktop 1280) — overflow, touch targets
 *  3. API endpoint contract checks (auth-gated returns 401, public returns 200/204)
 *  4. User flow: dashboard redirect when unauthed, login form interactivity
 *  5. Accessibility: axe-core scan
 *  6. Performance + SEO: Lighthouse scores
 *
 * Usage:  node scripts/test-agent/index.mjs [--base=URL]
 */

import puppeteer from "puppeteer";
import { AxePuppeteer } from "@axe-core/puppeteer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import lighthouse from "lighthouse";
import * as ChromeLauncher from "chrome-launcher";

// Resolve axe-core script source manually (works around path-with-spaces require issues)
const __dirname = dirname(fileURLToPath(import.meta.url));
const axeSource = readFileSync(
  join(__dirname, "../../node_modules/axe-core/axe.min.js"),
  "utf8",
);

const BASE = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] || "https://buildmy.directory";
const issues = [];

function log(severity, area, msg) {
  issues.push({ severity, area, msg });
  const icons = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "⚪", INFO: "ℹ️" };
  console.log(`${icons[severity] || "·"} [${severity}] ${area} — ${msg}`);
}

function section(title) {
  console.log(`\n${"═".repeat(70)}\n${title}\n${"═".repeat(70)}`);
}

// ─────────────────────────────────────────────────────────────────
// SUITE 1: Page health
// ─────────────────────────────────────────────────────────────────
async function suiteHealth(browser, pages) {
  section("1. Page health (HTTP status + console errors)");

  for (const path of pages) {
    const page = await browser.newPage();
    const consoleErrs = [];
    const netErrs = [];

    page.on("console", (m) => {
      if (m.type() === "error") {
        const text = m.text();
        // Ignore favicon and analytics noise
        if (!/favicon|analytics|sourcemap/i.test(text)) consoleErrs.push(text);
      }
    });
    page.on("requestfailed", (r) => {
      const u = r.url();
      // Ignore: favicon, analytics, and Next.js RSC prefetch aborts (expected when
      // a Link prefetches a route that server-side redirects)
      if (!/favicon|analytics/i.test(u) && !u.includes("?_rsc=")) {
        netErrs.push(`${r.method()} ${u} — ${r.failure()?.errorText}`);
      }
    });

    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 25000 });
      const status = res?.status() || 0;
      if (status >= 500) log("CRITICAL", "health", `${path}: HTTP ${status}`);
      else if (status >= 400) {
        // 401/403 may be expected for protected routes (e.g. /dashboard)
        log("INFO", "health", `${path}: HTTP ${status}`);
      }
      for (const e of consoleErrs.slice(0, 3)) log("HIGH", "health", `${path}: console error: ${e.slice(0, 140)}`);
      for (const e of netErrs.slice(0, 3)) log("HIGH", "health", `${path}: ${e.slice(0, 140)}`);
      if (status < 400 && consoleErrs.length === 0 && netErrs.length === 0) {
        console.log(`  ✓ ${path}`);
      }
    } catch (err) {
      log("CRITICAL", "health", `${path}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SUITE 2: Multi-viewport layout
// ─────────────────────────────────────────────────────────────────
async function suiteViewports(browser, pages) {
  section("2. Multi-viewport layout (mobile 375 + desktop 1280)");

  const viewports = {
    mobile: { width: 375, height: 812, isMobile: true, hasTouch: true },
    desktop: { width: 1280, height: 800, isMobile: false, hasTouch: false },
  };

  for (const path of pages) {
    for (const [name, vp] of Object.entries(viewports)) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 25000 });
        await new Promise((r) => setTimeout(r, 800));

        // Document-level horizontal scroll = layout broken
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 4) {
          log("HIGH", "layout", `${path} [${name}]: horizontal overflow ${overflow}px`);
        }

        // Mobile only — small touch targets
        if (vp.isMobile) {
          const small = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll("a, button, input, select, [role='button']")) {
              // Skip screen-reader-only elements (skip-to-content link pattern,
              // visually hidden but in tab order). They are <=1px by design.
              const style = getComputedStyle(el);
              if (el.classList.contains("sr-only") || style.clipPath?.includes("inset(50%)") || el.className?.includes?.("sr-only")) {
                continue;
              }
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && r.width < 32 && r.height < 32) {
                const text = el.textContent?.trim()?.slice(0, 30) || el.getAttribute("aria-label") || "";
                out.push(`<${el.tagName.toLowerCase()}> "${text}" ${Math.round(r.width)}×${Math.round(r.height)}px`);
              }
            }
            return out.slice(0, 3);
          });
          for (const s of small) log("MEDIUM", "layout", `${path} [${name}]: small touch target ${s}`);
        }

        // Broken images
        const broken = await page.evaluate(() => {
          const out = [];
          for (const img of document.querySelectorAll("img")) {
            if (img.complete && img.naturalWidth === 0) out.push(img.src?.slice(0, 80));
          }
          return out;
        });
        for (const b of broken) log("MEDIUM", "layout", `${path} [${name}]: broken image ${b}`);

        if (overflow <= 4) console.log(`  ✓ ${path} [${name}]`);
      } catch (err) {
        log("HIGH", "layout", `${path} [${name}]: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SUITE 3: API contract
// ─────────────────────────────────────────────────────────────────
async function suiteAPI(browser) {
  section("3. API endpoint contract");

  const tests = [
    // [path, expected status range]
    ["/api/sites", [401, 401]],
    ["/api/pipeline?siteId=xxx", [400, 400]],
    ["/api/subscribe?siteId=demo", [200, 200]],
    ["/api/platforms?siteId=demo", [401, 401]],
    ["/api/analytics/summary?siteId=demo&days=30", [401, 401]],
    ["/api/newsletter?siteId=demo", [401, 401]],
    ["/api/inngest", [200, 200]],
  ];

  const page = await browser.newPage();
  for (const [path, [min, max]] of tests) {
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 15000 });
      const status = res?.status() || 0;
      if (status >= min && status <= max) {
        console.log(`  ✓ ${path} → ${status}`);
      } else {
        log("HIGH", "api", `${path}: expected ${min}-${max}, got ${status}`);
      }
    } catch (err) {
      log("HIGH", "api", `${path}: ${err.message}`);
    }
  }
  await page.close();

  // POST /api/contact with missing body → 400
  try {
    const bad = await fetch(`${BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    if (bad.status === 400) console.log(`  ✓ POST /api/contact (invalid) → 400`);
    else log("HIGH", "api", `POST /api/contact (invalid) → ${bad.status}, expected 400`);
  } catch (err) {
    log("HIGH", "api", `POST /api/contact: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// SUITE 4: User flows
// ─────────────────────────────────────────────────────────────────
async function suiteFlows(browser) {
  section("4. User flows");

  // Flow 1: Dashboard redirects to /login when not authed
  const p1 = await browser.newPage();
  try {
    await p1.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2", timeout: 20000 });
    if (p1.url().includes("/login")) console.log("  ✓ Unauthed /dashboard → /login");
    else log("HIGH", "flow", `Unauthed /dashboard did NOT redirect to /login (got ${p1.url()})`);
  } catch (err) {
    log("HIGH", "flow", `Dashboard redirect: ${err.message}`);
  }
  await p1.close();

  // Flow 2: Login form interactivity (submit invalid creds → error)
  const p2 = await browser.newPage();
  try {
    await p2.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 20000 });
    const hasEmail = await p2.$('input[type="email"]');
    const hasPassword = await p2.$('input[type="password"]');
    const hasSubmit = await p2.$('button[type="submit"]');
    if (!hasEmail || !hasPassword || !hasSubmit) {
      log("CRITICAL", "flow", "Login form missing required fields");
    } else {
      await p2.type('input[type="email"]', "nope@nowhere.invalid");
      await p2.type('input[type="password"]', "wrongwrongwrong");
      await p2.click('button[type="submit"]');
      await new Promise((r) => setTimeout(r, 3500));
      const errVisible = await p2.evaluate(() => {
        const el = document.querySelector(".bg-red-50");
        return el?.textContent && el.textContent.length > 5;
      });
      if (errVisible) console.log("  ✓ Login shows error on bad credentials");
      else log("MEDIUM", "flow", "Login form accepted bad credentials silently");
    }
  } catch (err) {
    log("HIGH", "flow", `Login form: ${err.message}`);
  }
  await p2.close();

  // Flow 3: Demo directory loads with content
  const p3 = await browser.newPage();
  try {
    await p3.goto(`${BASE}/demo`, { waitUntil: "networkidle2", timeout: 20000 });
    const hasContent = await p3.evaluate(() => {
      return document.querySelector("h1") !== null && document.body.textContent.length > 200;
    });
    if (hasContent) console.log("  ✓ /demo renders content");
    else log("HIGH", "flow", "/demo missing content");
  } catch (err) {
    log("HIGH", "flow", `Demo directory: ${err.message}`);
  }
  await p3.close();
}

// ─────────────────────────────────────────────────────────────────
// SUITE 5: Accessibility (axe-core)
// ─────────────────────────────────────────────────────────────────
async function suiteA11y(browser, pages) {
  section("5. Accessibility (axe-core, WCAG 2.1 AA)");

  for (const path of pages) {
    const page = await browser.newPage();
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 25000 });
      await new Promise((r) => setTimeout(r, 800));
      const results = await new AxePuppeteer(page, axeSource)
        .options({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })
        .analyze();
      const violations = results.violations;
      if (violations.length === 0) {
        console.log(`  ✓ ${path}: 0 violations`);
      } else {
        for (const v of violations.slice(0, 4)) {
          const sev = v.impact === "critical" ? "HIGH" : v.impact === "serious" ? "MEDIUM" : "LOW";
          log(sev, "a11y", `${path}: ${v.id} (${v.impact}) — ${v.help} [${v.nodes.length} nodes]`);
        }
      }
    } catch (err) {
      log("MEDIUM", "a11y", `${path}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// SUITE 6: Lighthouse (perf + SEO + best practices)
// ─────────────────────────────────────────────────────────────────
async function suiteLighthouse(pages) {
  section("6. Lighthouse (performance, SEO, best practices)");

  // Lighthouse needs its own Chrome instance
  const chrome = await ChromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
  try {
    for (const path of pages) {
      try {
        const result = await lighthouse(`${BASE}${path}`, {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        });
        const cats = result.lhr.categories;
        const scores = {
          perf: Math.round(cats.performance.score * 100),
          a11y: Math.round(cats.accessibility.score * 100),
          bp: Math.round(cats["best-practices"].score * 100),
          seo: Math.round(cats.seo.score * 100),
        };
        const overall = `Perf:${scores.perf} A11y:${scores.a11y} BP:${scores.bp} SEO:${scores.seo}`;
        console.log(`  ${path}: ${overall}`);
        if (scores.perf < 70) log("MEDIUM", "lighthouse", `${path}: perf ${scores.perf} < 70`);
        if (scores.a11y < 90) log("MEDIUM", "lighthouse", `${path}: a11y ${scores.a11y} < 90`);
        if (scores.bp < 90) log("LOW", "lighthouse", `${path}: best-practices ${scores.bp} < 90`);
        if (scores.seo < 90) log("LOW", "lighthouse", `${path}: SEO ${scores.seo} < 90`);
      } catch (err) {
        log("MEDIUM", "lighthouse", `${path}: ${err.message?.slice(0, 100)}`);
      }
    }
  } finally {
    await chrome.kill();
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 BuildMy.Directory Test Agent`);
  console.log(`   Target: ${BASE}\n`);

  const pages = ["/", "/login", "/onboarding", "/demo", "/privacy", "/terms"];

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    await suiteHealth(browser, [...pages, "/dashboard", "/demo/requests"]);
    await suiteViewports(browser, pages);
    await suiteAPI(browser);
    await suiteFlows(browser);
    await suiteA11y(browser, pages);
  } finally {
    await browser.close();
  }

  // Lighthouse uses its own Chrome
  await suiteLighthouse(pages);

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n${"═".repeat(70)}\nSUMMARY\n${"═".repeat(70)}`);
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const i of issues) counts[i.severity]++;
  for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]) {
    console.log(`  ${sev.padEnd(10)} ${counts[sev]}`);
  }
  console.log(`  ${"TOTAL".padEnd(10)} ${issues.length}`);

  // Exit non-zero if critical or high issues
  if (counts.CRITICAL + counts.HIGH > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
