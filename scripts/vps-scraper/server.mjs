import proxyChain from "proxy-chain";
import http from "node:http";
import fs from "node:fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const PORT = 3001;
const API_KEY = fs.readFileSync("/opt/scraper/.api-key", "utf8").trim();
const COOKIE_FILE = "/opt/scraper/.ig-cookies.json";
const CREDS_FILE = "/opt/scraper/.ig-creds.json";

function loadCreds() {
  try { return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8")); } catch { return null; }
}

let PROXY = null;
try { PROXY = JSON.parse(fs.readFileSync("/opt/scraper/.proxy.json", "utf8")); } catch {}

function loadCookies() {
  try { return JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8")); } catch { return null; }
}

function proxyUrl() {
  if (!PROXY) return null;
  return `http://${PROXY.host}:${PROXY.port}`;
}

async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process", "--disable-features=VizDisplayCompositor"];
  let proxyServerUrl = null;
  if (PROXY) {
    // proxy-chain creates a local unauthenticated proxy that tunnels
    // to the authenticated upstream. Chromium connects to localhost
    // (no auth needed), proxy-chain handles the auth handshake.
    const upstreamUrl = `http://${PROXY.username}:${PROXY.password}@${PROXY.host}:${PROXY.port}`;
    proxyServerUrl = await proxyChain.anonymizeProxy(upstreamUrl);
    args.push(`--proxy-server=${proxyServerUrl}`);
  }
  const browser = await puppeteer.launch({
    headless: "new",
    args,
    executablePath: "/usr/bin/chromium-browser",
  });
  browser._proxyServerUrl = proxyServerUrl; // save for cleanup
  return browser;
}

async function authenticatePage(page) {
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
  // proxy auth handled by proxy-chain tunnel — no page.authenticate needed
}

async function loginAndSaveCookies(username, password) {
  console.log("[ig] logging in as", username, PROXY ? "(via proxy)" : "(direct)");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await authenticatePage(page);
    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    // Accept cookies banner if present
    try {
      const btns = await page.$$("button");
      for (const btn of btns) {
        const txt = await page.evaluate(el => el.textContent || "", btn);
        if (/allow|accept|essential/i.test(txt)) { await btn.click(); break; }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));

    // Find login inputs — try multiple selectors
    const usernameInput = await page.$('input[name="username"], input[name="email"]') || await page.$('input[aria-label*="username" i]') || await page.$('input[aria-label*="phone" i]');
    const passwordInput = await page.$('input[name="password"], input[name="pass"]') || await page.$('input[type="password"]');

    if (!usernameInput || !passwordInput) {
      const html = await page.content();
      console.warn("[ig] login page inputs not found. Title:", await page.title());
      return { success: false, error: "Login form not found — Instagram may be showing a different page" };
    }

    await usernameInput.type(username, { delay: 80 });
    await passwordInput.type(password, { delay: 80 });
    await new Promise(r => setTimeout(r, 1000));

    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 10000));

    // Check for login errors
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (/incorrect|wrong password|invalid|unusual login/i.test(bodyText)) {
      return { success: false, error: "Login rejected — check credentials or handle suspicious-login verification" };
    }

    const cookies = await page.cookies();
    const sessionCookie = cookies.find(c => c.name === "sessionid");
    if (!sessionCookie) {
      console.warn("[ig] no sessionid cookie after login — might need 2FA or verification");
      return { success: false, error: "No session cookie — Instagram may require verification. Log in manually from a browser first, then try again." };
    }

    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    console.log("[ig] saved", cookies.length, "cookies (sessionid present)");
    return { success: true, cookies: cookies.length };
  } catch (err) {
    console.error("[ig] login failed:", err.message);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

/** Parse a single edge node into our post shape */
function edgeToPost(node) {
  return {
    shortcode: node.shortcode,
    type: node.is_video ? "video" : node.__typename === "GraphSidecar" ? "carousel" : "image",
    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
    displayUrl: node.display_url || "",
    videoUrl: node.video_url || null,
    thumbUrl: node.thumbnail_src || node.display_url || "",
    mediaUrls: [node.video_url, node.display_url].filter(Boolean),
    takenAt: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : null,
    likesCount: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
    commentsCount: node.edge_media_to_comment?.count || 0,
    numSlides: node.edge_sidecar_to_children?.edges?.length || 0,
    platformUrl: `https://www.instagram.com/p/${node.shortcode}/`,
  };
}

/** Parse a v1 feed item into our post shape */
function feedItemToPost(item) {
  const isVideo = item.media_type === 2;
  const isCarousel = item.media_type === 8;
  const videoUrl = (item.video_versions || [])[0]?.url || null;
  const thumbUrl = (item.image_versions2?.candidates || [])[0]?.url || "";
  return {
    shortcode: item.code,
    type: isVideo ? "video" : isCarousel ? "carousel" : "image",
    caption: item.caption?.text || "",
    displayUrl: thumbUrl,
    videoUrl,
    thumbUrl,
    mediaUrls: [videoUrl, thumbUrl].filter(Boolean),
    takenAt: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
    likesCount: item.like_count || 0,
    commentsCount: item.comment_count || 0,
    numSlides: isCarousel ? (item.carousel_media?.length || 0) : 0,
    platformUrl: `https://www.instagram.com/p/${item.code}/`,
  };
}

async function scrapeInstagram(handle, maxPosts = 9) {
  const cleanHandle = handle.replace(/^@/, "").trim();
  console.log(`[scrape] @${cleanHandle} (max ${maxPosts})`, PROXY ? "via proxy" : "direct");

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await authenticatePage(page);

    // Load cookies if available (boosts data quality) but don't require them
    const cookies = loadCookies();
    if (cookies && cookies.length > 0) {
      await page.setCookie(...cookies);
    }

    // Step 1: Load the public profile page to establish browser session/cookies
    await page.goto(`https://www.instagram.com/${cleanHandle}/`, { waitUntil: "networkidle2", timeout: 45000 });

    // Step 2: Fetch profile data via API
    await page.setExtraHTTPHeaders({"X-IG-App-ID":"936619743392459","X-Requested-With":"XMLHttpRequest"});
    const profileResp = await page.goto(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${cleanHandle}`, { waitUntil: "networkidle2", timeout: 30000 });
    let profileData;
    try {
      profileData = JSON.parse(await profileResp.text());
    } catch {
      console.warn("[scrape] non-JSON from profile API");
      return { success: false, error: "Could not load profile data", posts: [], handle: cleanHandle };
    }

    const user = profileData?.data?.user;
    if (!user) {
      return { success: false, error: "User not found or private", posts: [], handle: cleanHandle };
    }

    const userId = user.id;
    const allPosts = [];
    const seenShortcodes = new Set();

    function addPost(post) {
      if (seenShortcodes.has(post.shortcode)) return false;
      seenShortcodes.add(post.shortcode);
      allPosts.push(post);
      return true;
    }

    // ── Strategy A: v1 feed endpoint with in-page fetch pagination ─
    // IMPORTANT: use page.evaluate(fetch()) instead of page.goto() for
    // pagination. page.goto() navigates away and loses the Instagram
    // session context, causing page 2+ to return empty.
    console.log(`[scrape] using v1 feed endpoint for @${cleanHandle} (userId: ${userId})...`);

    // First, navigate back to Instagram to establish context for fetch()
    await page.goto(`https://www.instagram.com/${cleanHandle}/`, { waitUntil: "networkidle2", timeout: 30000 });

    let maxId = null;
    let feedPage = 0;
    let consecutiveEmpty = 0;

    while (allPosts.length < maxPosts && consecutiveEmpty < 2) {
      feedPage++;
      const feedUrl = maxId
        ? `https://www.instagram.com/api/v1/feed/user/${userId}/?count=33&max_id=${maxId}`
        : `https://www.instagram.com/api/v1/feed/user/${userId}/?count=33`;

      try {
        // Use in-page fetch to keep cookies/session alive
        const feedResult = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, {
              headers: { "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest" },
              credentials: "include",
            });
            if (!res.ok) return { error: `HTTP ${res.status}` };
            return await res.json();
          } catch (e) {
            return { error: e.message };
          }
        }, feedUrl);

        if (feedResult.error) {
          console.warn(`[scrape] feed page ${feedPage}: ${feedResult.error}`);
          break;
        }

        const items = feedResult?.items || [];

        if (items.length === 0) {
          console.log(`[scrape] feed page ${feedPage}: no items`);
          consecutiveEmpty++;
          if (!feedResult.more_available) break;
          continue;
        }
        consecutiveEmpty = 0;

        let added = 0;
        for (const item of items) {
          if (allPosts.length >= maxPosts) break;
          if (addPost(feedItemToPost(item))) added++;
        }

        console.log(`[scrape] feed page ${feedPage}: ${items.length} items, ${added} new (total: ${allPosts.length})`);

        if (!feedResult.more_available) {
          console.log(`[scrape] no more posts available`);
          break;
        }
        maxId = feedResult.next_max_id;
        if (!maxId) break;

        // Rate limit: 2-3s between pages
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
      } catch (err) {
        console.warn(`[scrape] feed page ${feedPage} failed: ${err.message}`);
        break;
      }
    }

    // ── Fallback: grab edges from initial profile if feed returned nothing
    if (allPosts.length === 0) {
      console.log(`[scrape] feed returned nothing, falling back to edges...`);
      const edges = user.edge_owner_to_timeline_media?.edges || [];
      for (const edge of edges) {
        if (allPosts.length >= maxPosts) break;
        addPost(edgeToPost(edge.node));
      }
    }

    // Save fresh cookies
    try {
      const freshCookies = await page.cookies();
      if (freshCookies.length > 0) fs.writeFileSync(COOKIE_FILE, JSON.stringify(freshCookies, null, 2));
    } catch {}

    console.log(`[scrape] DONE: ${allPosts.length} posts for @${cleanHandle}`);
    return { success: true, posts: allPosts, handle: cleanHandle };
  } catch (err) {
    console.error(`[scrape] error for @${cleanHandle}:`, err.message);
    return { success: false, error: err.message, posts: [], handle: cleanHandle };
  } finally {
    await browser.close();
  }
}

// ─── Session management endpoints ───────────────────────────────────

async function checkSession() {
  const cookies = loadCookies();
  if (!cookies || cookies.length === 0) return { valid: false, reason: "no_cookies" };
  const sid = cookies.find(c => c.name === "sessionid");
  if (!sid) return { valid: false, reason: "no_sessionid" };
  
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await authenticatePage(page);
    await page.setCookie(...cookies);
    await page.setExtraHTTPHeaders({"X-IG-App-ID":"936619743392459","X-Requested-With":"XMLHttpRequest"});
    const resp = await page.goto("https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram", { waitUntil: "networkidle2", timeout: 15000 });
    const text = await resp.text();
    try {
      const data = JSON.parse(text);
      if (data?.data?.user) return { valid: true };
      return { valid: false, reason: "no_user_in_response" };
    } catch {
      return { valid: false, reason: "non_json_response" };
    }
  } catch (err) {
    return { valid: false, reason: err.message };
  } finally {
    await browser.close();
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), hasSession: !!loadCookies(), hasProxy: !!PROXY }));
    return;
  }

  const authHeader = req.headers["x-api-key"] || "";
  if (authHeader !== API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return;
  }

  if (req.method === "POST" && req.url === "/login") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { username, password } = JSON.parse(body || "{}");
    if (!username || !password) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "username and password required" }));
      return;
    }
    const result = await loginAndSaveCookies(username, password);
    res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === "POST" && req.url === "/scrape") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const { handle, platform, maxPosts } = parsed;
    if (!handle) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing handle" }));
      return;
    }
    if (platform && platform !== "instagram") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "TikTok scraping requires Apify. VPS handles Instagram only.", posts: [], handle }));
      return;
    }
    const result = await scrapeInstagram(handle, maxPosts || 9);
    res.writeHead(result.success ? 200 : 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[scraper] listening on :${PORT}`, PROXY ? `(proxy: ${PROXY.host}:${PROXY.port})` : "(no proxy)");
});
