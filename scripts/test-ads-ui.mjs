/**
 * Phase 1/2 UI smoke test. Screenshots the directory + PostModal at
 * desktop + mobile viewports so we can sanity-check the banner,
 * sticky ribbon, and pre-roll overlay without manually browsing.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const OUT = "/tmp/ads-ui";
fs.mkdirSync(OUT, { recursive: true });

const SITE = "https://www.buildmy.directory/brickzwiththetipz";
const DASHBOARD = "https://buildmy.directory/dashboard/advertising";

const viewports = [
  { name: "desktop", width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }, // iPhone 14
];

const browser = await puppeteer.launch({ headless: "new" });

async function shoot(page, label) {
  const file = path.join(OUT, `${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${file}`);
}

async function run(vp) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: vp.isMobile,
    deviceScaleFactor: vp.deviceScaleFactor,
    hasTouch: vp.isMobile,
  });
  await page.setUserAgent(
    vp.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  );

  console.log(`\n=== ${vp.name} ===`);

  // 1. Directory page
  console.log("  → directory homepage");
  await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Wait for ads to fetch + render
  await new Promise((r) => setTimeout(r, 4000));
  await shoot(page, `${vp.name}-1-directory-with-banner-and-ribbon`);

  // Sanity-check: is the banner-top ad actually in the DOM?
  const bannerHeadline = await page.evaluate(() => {
    const t = document.body.innerText;
    return t.includes("Check out TestBrand");
  });
  const ribbonHeadline = await page.evaluate(() => {
    return document.body.innerText.includes("Limited time offer");
  });
  console.log(`    banner present: ${bannerHeadline}`);
  console.log(`    ribbon present: ${ribbonHeadline}`);

  // 2. Click into a post to trigger pre-roll
  console.log("  → opening first post (pre-roll should overlay modal)");
  // Scroll past the banner to find post tiles
  await page.evaluate(() => window.scrollBy(0, 600));
  await new Promise((r) => setTimeout(r, 800));

  // Click first post card — different selectors for different layouts
  const clicked = await page.evaluate(() => {
    const candidates = document.querySelectorAll(
      'a[href*="/p/"], [role="button"][aria-label^="Open post"], button[data-post-open]',
    );
    if (candidates.length > 0) {
      candidates[0].click();
      return true;
    }
    // Fallback: find the first <article> or grid item with a click handler
    const post = document.querySelector("article") || document.querySelectorAll("[class*='grid'] > div")[0];
    if (post) {
      post.click();
      return true;
    }
    return false;
  });
  console.log(`    post click fired: ${clicked}`);

  // Wait for modal + pre-roll overlay
  await new Promise((r) => setTimeout(r, 4500));
  await shoot(page, `${vp.name}-2-post-modal-with-preroll`);

  const preRollText = await page.evaluate(() => document.body.innerText.includes("Sponsored"));
  console.log(`    pre-roll visible: ${preRollText}`);

  // 3. Dashboard/advertising page — should redirect to login
  console.log("  → dashboard/advertising (unauth, expect login redirect)");
  await page.goto(DASHBOARD, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1500));
  await shoot(page, `${vp.name}-3-advertising-dashboard-unauth`);
  console.log(`    final URL: ${page.url()}`);

  await page.close();
}

for (const vp of viewports) {
  await run(vp);
}

await browser.close();
console.log(`\n✅ done. screenshots in ${OUT}/`);
