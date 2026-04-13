import puppeteer from "puppeteer";
import path from "path";

const pages = [
  { name: "landing", url: "http://localhost:3002" },
  { name: "onboarding", url: "http://localhost:3002/onboarding" },
  { name: "dashboard", url: "http://localhost:3002/dashboard" },
  { name: "dashboard-domains", url: "http://localhost:3002/dashboard/domains" },
  { name: "dashboard-analytics", url: "http://localhost:3002/dashboard/analytics" },
  { name: "dashboard-platforms", url: "http://localhost:3002/dashboard/platforms" },
  { name: "directory-demo", url: "http://localhost:3002/d/demo" },
];

const outDir = "/tmp/screenshots";

async function run() {
  const browser = await puppeteer.launch({ headless: true });

  for (const pg of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    try {
      await page.goto(pg.url, { waitUntil: "networkidle2", timeout: 15000 });
      await page.screenshot({ path: path.join(outDir, `${pg.name}.png`), fullPage: true });
      console.log(`✓ ${pg.name}`);
    } catch (e) {
      console.log(`✗ ${pg.name}: ${e.message}`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nScreenshots saved to ${outDir}`);
}

run();
