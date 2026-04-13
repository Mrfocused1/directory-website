import puppeteer from "puppeteer";

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // iPhone 14
  await page.goto("http://localhost:3002", { waitUntil: "networkidle2", timeout: 15000 });

  // Scroll to features section
  await page.evaluate(() => {
    const el = document.querySelector("section:nth-of-type(3)");
    if (el) el.scrollIntoView({ behavior: "instant" });
  });
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({ path: "/tmp/screenshots/mobile-features.png" });
  console.log("✓ mobile-features");

  await browser.close();
}

run();
