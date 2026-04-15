#!/usr/bin/env node
/**
 * Puppeteer visual check — screenshots every page where the logo
 * appears, measures the rendered logo's pixel dimensions, and asserts
 * it's within a sane range (not 0×0, not absurdly large, aspect ratio
 * close to the source 250:131).
 *
 * Run: node scripts/verify-logo.mjs
 * Requires the dev server up on :3000.
 */
import puppeteer from "puppeteer";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/logo-verify";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { url: "/",                 label: "landing",        expectVariant: "white", context: "MarketingNav" },
  { url: "/privacy",          label: "privacy",        expectVariant: "white", context: "MarketingNav" },
  { url: "/terms",            label: "terms",          expectVariant: "white", context: "MarketingNav" },
  { url: "/login",            label: "login",          expectVariant: "dark",  context: "LoginPage nav" },
  { url: "/forgot-password",  label: "forgot-password",expectVariant: "dark",  context: "ForgotPassword nav" },
  { url: "/onboarding",       label: "onboarding",     expectVariant: "dark",  context: "Onboarding nav (may redirect to login for anon)" },
  { url: "/dashboard",        label: "dashboard",      expectVariant: "dark",  context: "DashboardNav (may redirect to login for anon)" },
  { url: "/admin",            label: "admin",          expectVariant: "dark",  context: "Admin layout (expect 404 for anon)" },
];

const RATIO_SOURCE = 250 / 131; // ≈ 1.908
const RATIO_TOLERANCE = 0.05;

const findings = [];

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

  for (const p of PAGES) {
    try {
      const resp = await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle2", timeout: 20000 });
      await new Promise((r) => setTimeout(r, 500));
      const finalUrl = page.url();
      const status = resp?.status() ?? 0;

      const logoInfo = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img[alt="BuildMy.Directory"]')];
        return imgs.map((img) => {
          const r = img.getBoundingClientRect();
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt"),
            width: Math.round(r.width),
            height: Math.round(r.height),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            x: Math.round(r.x),
            y: Math.round(r.y),
          };
        });
      });

      const screenshot = `${OUT}/${p.label}.png`;
      await page.screenshot({ path: screenshot, fullPage: false });

      const f = { page: p, finalUrl, status, logos: logoInfo, screenshot };
      findings.push(f);
      const summary = logoInfo.length === 0 ? "NO LOGO" : logoInfo.map((l) => `${l.width}×${l.height} src=${l.src}`).join(" | ");
      console.log(`[${p.label}] status=${status} → ${summary}`);
    } catch (err) {
      console.log(`[${p.label}] ERROR: ${err.message?.slice(0, 120)}`);
      findings.push({ page: p, error: err.message });
    }
  }

  await browser.close();

  // Analysis
  console.log("\n" + "═".repeat(60));
  console.log("ANALYSIS");
  console.log("═".repeat(60));

  const problems = [];
  for (const f of findings) {
    if (f.error) { problems.push(`${f.page.label}: page error — ${f.error}`); continue; }
    for (const logo of f.logos || []) {
      if (logo.width < 10 || logo.height < 10) {
        problems.push(`${f.page.label}: logo too small (${logo.width}×${logo.height})`);
      }
      if (logo.width > 400 || logo.height > 200) {
        problems.push(`${f.page.label}: logo too large (${logo.width}×${logo.height})`);
      }
      const ratio = logo.width / logo.height;
      if (Math.abs(ratio - RATIO_SOURCE) > RATIO_TOLERANCE) {
        problems.push(`${f.page.label}: aspect ratio off — rendered ${ratio.toFixed(2)} vs source ${RATIO_SOURCE.toFixed(2)}`);
      }
      // Variant check — if final URL is a page we expected to have the logo on
      const landed = new URL(f.finalUrl).pathname;
      if (landed === f.page.url) {
        const isWhiteVariant = logo.src.includes("logo-white.svg");
        if (f.page.expectVariant === "white" && !isWhiteVariant) {
          problems.push(`${f.page.label}: expected white logo variant, got ${logo.src}`);
        }
        if (f.page.expectVariant === "dark" && isWhiteVariant) {
          problems.push(`${f.page.label}: expected dark logo variant, got ${logo.src}`);
        }
      }
    }
  }

  if (problems.length === 0) {
    console.log("\n✅ All logos render at sensible sizes, correct variants, correct aspect ratio.");
  } else {
    console.log(`\n✗ ${problems.length} issues:`);
    for (const p of problems) console.log("  - " + p);
  }
  console.log(`\nScreenshots saved to ${OUT}/`);
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
