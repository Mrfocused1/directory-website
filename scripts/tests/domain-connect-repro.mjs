#!/usr/bin/env node
/**
 * Puppeteer repro for the "Failed to connect domain" 400.
 *
 * Hits the live production endpoint as an authenticated user and
 * captures the FULL response body so we can see the real server
 * error (after the unmask-error commit is deployed). We grab the
 * Supabase session cookie from a real logged-in Safari session via
 * a one-time copy-paste prompt, so there's no credential storage.
 *
 * Usage:
 *   SB_COOKIE="sb-<project>-auth-token=...; sb-<project>-refresh-token=..." \
 *     node scripts/tests/domain-connect-repro.mjs <test-domain>
 *
 * Example: SB_COOKIE="..." node scripts/tests/domain-connect-repro.mjs diag-test-123.example
 *
 * The domain should be a throwaway — the script will attempt to
 * connect it and leave a DB row (that fails at the Vercel step).
 *
 * Why puppeteer and not curl: the site is SSR-rendered, Supabase
 * bounces unauthed fetches through middleware. Using a headless
 * browser reuses the real session flow.
 */
import { launch } from "puppeteer";

const SITE = process.env.SITE_ORIGIN || "https://buildmy.directory";
const testDomain = process.argv[2];
if (!testDomain) {
  console.error("Usage: node scripts/tests/domain-connect-repro.mjs <test-domain>");
  process.exit(1);
}
if (!process.env.SB_COOKIE) {
  console.error(
    "SB_COOKIE env var required. Open DevTools > Application > Cookies on buildmy.directory " +
    "and copy the full `sb-…-auth-token=…` string.",
  );
  process.exit(1);
}

const browser = await launch({ headless: true });
const page = await browser.newPage();

// Seed Supabase auth cookies
const pairs = process.env.SB_COOKIE.split(";").map((s) => s.trim()).filter(Boolean);
for (const p of pairs) {
  const eq = p.indexOf("=");
  if (eq === -1) continue;
  await page.setCookie({
    name: p.slice(0, eq).trim(),
    value: p.slice(eq + 1).trim(),
    domain: new URL(SITE).hostname,
    path: "/",
    httpOnly: false,
    secure: true,
  });
}

console.log(`→ loading dashboard at ${SITE}/dashboard/domains`);
await page.goto(`${SITE}/dashboard/domains`, { waitUntil: "networkidle2", timeout: 30000 });

// Pull the siteId out of the React state via the __NEXT_DATA__ or a client fetch.
// Fall back to asking the page's own API.
const siteId = await page.evaluate(async () => {
  const res = await fetch("/api/sites");
  if (!res.ok) return null;
  const data = await res.json();
  return data?.sites?.[0]?.id || data?.[0]?.id || null;
});

if (!siteId) {
  console.error("✗ Could not resolve a siteId from /api/sites — aborting.");
  await browser.close();
  process.exit(2);
}
console.log(`→ siteId: ${siteId}`);

// Send the exact payload the dashboard sends.
const result = await page.evaluate(
  async ({ siteId, domain }) => {
    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, domain, action: "connect" }),
    });
    const text = await res.text();
    return { status: res.status, body: text };
  },
  { siteId, domain: testDomain },
);

console.log(`\n← POST /api/domains\n  status: ${result.status}`);
console.log("  body:");
try {
  console.log(JSON.stringify(JSON.parse(result.body), null, 2));
} catch {
  console.log(result.body);
}

await browser.close();

if (result.status >= 200 && result.status < 300) {
  console.log("\n✓ Connect succeeded — dashboard should show DNS records.");
  process.exit(0);
}
process.exit(3);
