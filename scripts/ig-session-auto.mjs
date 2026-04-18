/**
 * Automated Instagram login from the Mac's residential IP.
 * Headed Puppeteer → types creds → clicks through the predictable
 * post-login prompts → extracts cookies → exits.
 *
 * If IG throws 2FA / email / captcha, the script bails loudly; in
 * that case you'd run ig-session-capture.mjs interactively instead.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import os from "os";

const CREDS = JSON.parse(fs.readFileSync("/tmp/ig-creds.json", "utf8"));
const USER_DATA_DIR = path.join(os.homedir(), ".ig-session-capture");
const OUT_FILE = "/tmp/ig-cookies.json";

const CHALLENGE_PATTERNS = [
  /^(allow all|allow essential|accept all|accept)$/i,
  /^not now$/i,
  /^(this was me|yes,? it was me|it was me)$/i,
  /^continue$/i,
  /^(skip|maybe later)$/i,
];

async function clickChallenges(page, maxRounds = 5) {
  for (let round = 0; round < maxRounds; round++) {
    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/enter the code|6-digit|security code|two[- ]factor|verification code/i.test(bodyText)) {
      return { fatal: "2fa_required" };
    }
    if (/captcha|verify you('re| are) human/i.test(bodyText)) {
      return { fatal: "captcha_required" };
    }
    const buttons = await page.$$('button, [role="button"]');
    let clicked = false;
    for (const btn of buttons) {
      const txt = (await page.evaluate((el) => (el.textContent || "").trim(), btn).catch(() => "")) || "";
      if (!txt || txt.length > 40) continue;
      for (const p of CHALLENGE_PATTERNS) {
        if (p.test(txt)) {
          console.log(`  → clicking "${txt}"`);
          try { await btn.click(); await new Promise(r => setTimeout(r, 2500)); clicked = true; } catch {}
          break;
        }
      }
      if (clicked) break;
    }
    if (!clicked) return { done: true };
  }
  return { done: true };
}

const browser = await puppeteer.launch({
  headless: false, // headed = much harder for IG to fingerprint as a bot
  defaultViewport: null,
  userDataDir: USER_DATA_DIR,
  args: [
    "--no-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1280,900",
  ],
});

try {
  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  // Minimal stealth: these are the three properties IG checks most
  // aggressively for "is this a headless bot" heuristics.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en", "en-US"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  );

  console.log("[1/4] Navigating to login page…");
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await new Promise(r => setTimeout(r, 4000));

  // Cookie banner may be covering the form
  await clickChallenges(page);

  const client = await page.createCDPSession();
  const preCookies = (await client.send("Storage.getCookies")).cookies;
  const alreadyLoggedIn = preCookies.some(c => c.name === "sessionid");

  if (alreadyLoggedIn) {
    console.log("[2/4] Already have sessionid in persistent profile — skipping login");
  } else {
    console.log("[2/4] Filling credentials…");
    let userInput = await page.$('input[name="username"]');
    if (!userInput) {
      // IG sometimes renders the field without name=, using aria-label. Try harder.
      userInput = await page.$('input[aria-label*="username" i], input[aria-label*="email" i], input[type="text"]');
    }
    if (!userInput) {
      const title = await page.title().catch(() => "");
      const snippet = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).slice(0, 400);
      console.error("❌ Login inputs not found");
      console.error("   URL:", page.url());
      console.error("   Title:", title);
      console.error("   Body snippet:", snippet);
      process.exit(5);
    }
    const passInput =
      (await page.$('input[name="password"]')) ||
      (await page.$('input[type="password"]'));

    await userInput.click({ clickCount: 3 });
    await userInput.type(CREDS.username, { delay: 80 });
    await passInput.click({ clickCount: 3 });
    await passInput.type(CREDS.password, { delay: 80 });
    await new Promise(r => setTimeout(r, 800));
    await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 10_000));

    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/(password was incorrect|incorrect password|wrong password)/i.test(bodyText)) {
      console.error("❌ IG rejected the password");
      process.exit(2);
    }
  }

  console.log("[3/4] Clicking through any post-login prompts…");
  const challengeResult = await clickChallenges(page);
  if (challengeResult.fatal) {
    console.error(`❌ Challenge requires a human: ${challengeResult.fatal}`);
    console.error("   Run ig-session-capture.mjs interactively instead.");
    process.exit(3);
  }

  // Sometimes IG goes straight to the home feed under instagram.com/?…
  // Give the page a moment to settle, then navigate to confirm session.
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  await clickChallenges(page);

  console.log("[4/4] Extracting cookies…");
  const { cookies } = await client.send("Storage.getCookies");
  const sessionCookie = cookies.find((c) => c.name === "sessionid");
  if (!sessionCookie) {
    console.error("❌ No sessionid cookie after login — IG probably showed a challenge we can't resolve");
    const finalUrl = page.url();
    const finalBody = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).slice(0, 400);
    console.error("   Final URL:", finalUrl);
    console.error("   Final body (first 400 chars):", finalBody);
    process.exit(4);
  }

  const normalized = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    expires: c.expires || -1,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite:
      c.sameSite === "no_restriction" ? "None"
      : c.sameSite === "lax" ? "Lax"
      : c.sameSite === "strict" ? "Strict"
      : c.sameSite || "Lax",
  }));

  fs.writeFileSync(OUT_FILE, JSON.stringify(normalized, null, 2));
  const dsUser = cookies.find((c) => c.name === "ds_user_id");
  console.log(`\n✅ Saved ${normalized.length} cookies → ${OUT_FILE}`);
  console.log(`   sessionid: ${sessionCookie.value.slice(0, 24)}…`);
  if (dsUser) console.log(`   ds_user_id: ${dsUser.value}`);
} finally {
  await browser.close();
}
