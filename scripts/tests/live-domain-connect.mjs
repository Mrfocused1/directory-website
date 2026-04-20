#!/usr/bin/env node
/**
 * End-to-end test of POST /api/domains against the live production site.
 *
 * Mints a Supabase magic-link for the test account via the service-role
 * admin API, drives Puppeteer through the callback to capture the sb-*
 * auth cookie, then POSTs a test domain to /api/domains and prints the
 * full response — so we can see whether the connect flow now works AND
 * what the real server error is if it doesn't.
 *
 * Uses a throw-away *.example.com hostname so nothing real is ever
 * registered — the per-user no-real-money rule stays intact.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const BASE = "https://buildmy.directory";
const TEST_EMAIL = "ahkicafe@gmail.com";
const TEST_SITE_ID = "799c85d5-15e2-4ec3-b886-c092f2d51bc5";
const TEST_DOMAIN = `diag-${randomBytes(3).toString("hex")}.example.com`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Step 1 — mint a magic link for the test account via admin API.
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
console.log(`[1] Minting magic link for ${TEST_EMAIL}…`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TEST_EMAIL,
  options: { redirectTo: `${BASE}/auth/callback?next=/dashboard/domains` },
});
if (linkErr) {
  console.error("generateLink failed:", linkErr.message);
  process.exit(1);
}
const actionLink = linkData?.properties?.action_link;
if (!actionLink) {
  console.error("No action_link returned");
  process.exit(1);
}
console.log(`    action_link obtained (host: ${new URL(actionLink).host})`);

// Step 2 — Puppeteer: follow the magic link, which sets the sb-* cookie.
console.log(`[2] Launching headless Chrome and consuming the magic link…`);
const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();

page.on("console", (msg) => console.log(`  [browser:${msg.type()}]`, msg.text().slice(0, 200)));
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) console.log(`  [nav]`, f.url().slice(0, 160));
});
page.on("response", async (res) => {
  const u = res.url();
  if (u.includes("/api/domains") || u.includes("/auth/v1/")) {
    console.log(`  [net] ${res.status()} ${u.slice(0, 160)}`);
  }
});

// Follow the magic link; Supabase 303s to /auth/callback#access_token=…
// We intercept BEFORE the callback page's useEffect gets a chance to
// redirect to /login — so grab the URL immediately on first frame
// navigation, before domcontentloaded triggers the handler race.
let hashUrl = null;
page.on("framenavigated", (f) => {
  if (f === page.mainFrame() && f.url().includes("#access_token=")) {
    hashUrl = f.url();
  }
});
await page.goto(actionLink, { waitUntil: "load", timeout: 60_000 }).catch(() => {});
const finalUrl = hashUrl || page.url();
const hashIdx = finalUrl.indexOf("#");
const hash = hashIdx >= 0 ? finalUrl.slice(hashIdx + 1) : "";
const hashParams = new URLSearchParams(hash);
const accessToken = hashParams.get("access_token");
const refreshToken = hashParams.get("refresh_token");
if (!accessToken || !refreshToken) {
  console.error("    could not extract tokens from hash; url =", finalUrl.slice(0, 200));
  await browser.close();
  process.exit(1);
}
console.log(`    tokens captured (access_token len=${accessToken.length})`);

// Navigate to the app root so we're on the right origin, then inject
// a Supabase browser client and setSession — this writes the sb-*
// cookies in the exact format the server expects.
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
const setResult = await page.evaluate(
  async (supaUrl, anonKey, at, rt) => {
    const mod = await import("https://esm.sh/@supabase/ssr@0.5.2");
    const client = mod.createBrowserClient(supaUrl, anonKey);
    const { data, error } = await client.auth.setSession({ access_token: at, refresh_token: rt });
    return { ok: !error, user: data?.user?.email ?? null, error: error?.message ?? null };
  },
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  accessToken,
  refreshToken,
);
console.log(`    setSession →`, setResult);
if (!setResult.ok) {
  console.error("    setSession failed. Aborting.");
  await browser.close();
  process.exit(1);
}

// Step 3 — POST the connect request using page.evaluate so it inherits cookies.
console.log(`[3] POST /api/domains connect  domain=${TEST_DOMAIN}`);
const result = await page.evaluate(async (domain, siteId) => {
  const res = await fetch("/api/domains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "connect", siteId, domain }),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}, TEST_DOMAIN, TEST_SITE_ID);

console.log("");
console.log("=== RESULT ===");
console.log(`status: ${result.status}`);
console.log("body:", JSON.stringify(result.body, null, 2));

// Step 4 — if the connect succeeded, tear down the test domain so we don't
// leave dangling rows in custom_domains or stray attachments on Vercel.
if (result.status === 201 || result.status === 200) {
  console.log("");
  console.log("[4] Cleaning up test domain…");
  const del = await page.evaluate(async (domain, siteId) => {
    const res = await fetch(`/api/domains?domain=${encodeURIComponent(domain)}&siteId=${siteId}`, {
      method: "DELETE",
      credentials: "include",
    });
    return { status: res.status, body: await res.text() };
  }, TEST_DOMAIN, TEST_SITE_ID);
  console.log(`    DELETE status=${del.status}`);
}

await browser.close();
process.exit(result.status === 201 || result.status === 200 ? 0 : 1);
