/**
 * Instagram Session Capture — Path B experiment.
 *
 * Opens a real Chromium window on your Mac. You log into Instagram
 * normally (from your home residential IP, the one IG trusts). The
 * script then extracts all the cookies — including the HttpOnly
 * sessionid — and writes them to /tmp/ig-cookies.json in the exact
 * format the VPS scraper expects.
 *
 * The agent claude pushes /tmp/ig-cookies.json to the Hetzner VPS
 * as /opt/scraper/.ig-cookies.json. If IG accepts the session from
 * a different IP (Hetzner Germany vs your Hyperoptic London), we
 * can paginate through /feed/user/{id}/ and pull hundreds of posts
 * for free.
 *
 * Browser state is stored in ~/.ig-session-capture/ so you don't
 * have to log in again on subsequent runs.
 *
 * Usage:
 *   node scripts/ig-session-capture.mjs
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";

const USER_DATA_DIR = path.join(os.homedir(), ".ig-session-capture");
const OUT_FILE = "/tmp/ig-cookies.json";

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: null,
  userDataDir: USER_DATA_DIR,
  args: ["--window-size=1280,900"],
});

try {
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(" Log into Instagram in the Chromium window that just opened.");
  console.log(" If a 'Was this you?' prompt appears, click 'This was me'.");
  console.log(" Press ENTER here once you're looking at your feed/homepage.");
  console.log("────────────────────────────────────────────────────────────\n");

  await waitForEnter("Press ENTER when logged in: ");

  // Grab every cookie the browser has, not just the current page's —
  // IG uses a few distinct domains (.instagram.com, i.instagram.com).
  const client = await page.createCDPSession();
  const { cookies } = await client.send("Storage.getCookies");

  const sessionCookie = cookies.find((c) => c.name === "sessionid");
  if (!sessionCookie) {
    console.error("\n❌ No sessionid cookie found. You don't appear to be logged in.");
    console.error("   Log in and re-run this script.\n");
    process.exit(1);
  }

  // Puppeteer's CDP cookies include every field the VPS scraper needs,
  // but `sameSite` occasionally comes through as "None"/"Lax"/"Strict"
  // and some older cookies use "no_restriction" — normalize for safety.
  const normalized = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    expires: c.expires || -1,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite:
      c.sameSite === "no_restriction"
        ? "None"
        : c.sameSite === "lax"
          ? "Lax"
          : c.sameSite === "strict"
            ? "Strict"
            : c.sameSite || "Lax",
  }));

  fs.writeFileSync(OUT_FILE, JSON.stringify(normalized, null, 2));
  const dsUser = cookies.find((c) => c.name === "ds_user_id");
  console.log(`\n✅ Saved ${normalized.length} cookies → ${OUT_FILE}`);
  console.log(`   sessionid: ${sessionCookie.value.slice(0, 24)}…`);
  if (dsUser) console.log(`   ds_user_id: ${dsUser.value}`);
  console.log(`\n   Tell Claude "captured" and it will push to Hetzner + test.\n`);
} finally {
  await browser.close();
}
