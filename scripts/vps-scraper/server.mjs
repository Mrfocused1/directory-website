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

// Known post-login prompts IG shows. We try them in order each round
// until nothing matches. Text patterns are case-insensitive.
const CHALLENGE_PATTERNS = [
  // Cookie banner
  { match: /^(allow all|allow essential|accept all|accept)$/i, label: "accept-cookies" },
  // "Save your login info?"
  { match: /^not now$/i, label: "not-now" },
  // "Was this you?" — confirm legitimate login
  { match: /^(this was me|yes,? it was me|yes it was me|continue as |it was me)$/i, label: "this-was-me" },
  // Generic Continue on intermediate pages
  { match: /^continue$/i, label: "continue" },
  // Turn on notifications?
  { match: /^(not now|skip|maybe later)$/i, label: "skip-notifications" },
];

/**
 * Click through the small set of predictable post-login prompts IG
 * shows. Returns one of:
 *   { done: true }              — no clickable prompts found, stable state
 *   { done: false }             — still clicked something this round, retry
 *   { fatal: "2fa_required" }   — hit a screen we can't resolve without a human
 */
async function handleCommonChallenges(page) {
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");

  // Hard-fail on screens we know we can't handle without a human
  if (/enter the code|6-digit|security code|two[- ]factor|confirm it's you with a|verification code/i.test(bodyText)) {
    return { fatal: "2fa_required" };
  }
  if (/captcha|verify you('re| are) human|i('m| am) not a robot/i.test(bodyText)) {
    return { fatal: "captcha_required" };
  }

  const buttons = await page.$$('button, [role="button"]');
  for (const btn of buttons) {
    let txt = "";
    try {
      txt = (await page.evaluate(el => (el.textContent || "").trim(), btn)) || "";
    } catch { continue; }
    if (!txt || txt.length > 40) continue;
    for (const p of CHALLENGE_PATTERNS) {
      if (p.match.test(txt)) {
        try {
          console.log(`[login] clicking "${txt}" (${p.label})`);
          await btn.click();
          await new Promise(r => setTimeout(r, 2500));
          return { done: false };
        } catch {}
      }
    }
  }
  return { done: true };
}

/**
 * Optional Claude vision fallback. Only runs if ANTHROPIC_API_KEY is
 * set on this host. Sends a screenshot and asks for a single action.
 * Returning null means "no AI available" or "model bailed" — the
 * caller treats that the same as no-more-actions.
 */
async function askClaudeVision(page, hint) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  let screenshot;
  try {
    screenshot = await page.screenshot({ type: "png", fullPage: false });
  } catch { return null; }
  const base64 = screenshot.toString("base64");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
            { type: "text", text: `You're helping a script log into Instagram. ${hint}\n\nReturn ONLY JSON: {"click":"<exact visible button text>"} or {"give_up":"<short reason>"}.\nGive up if the screen asks for a 2FA / SMS / email code (we can't receive those).` },
          ],
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.content?.[0]?.text?.trim() || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (parsed.give_up) return { giveUp: parsed.give_up };
    if (typeof parsed.click === "string") return { click: parsed.click };
    return null;
  } catch {
    return null;
  }
}

async function clickByVisibleText(page, text) {
  const buttons = await page.$$('button, [role="button"], a');
  for (const el of buttons) {
    const t = await page.evaluate(e => (e.textContent || "").trim(), el).catch(() => "");
    if (t && t.toLowerCase() === text.toLowerCase()) {
      try { await el.click(); await new Promise(r => setTimeout(r, 2500)); return true; } catch {}
    }
  }
  return false;
}

async function loginAndSaveCookies(username, password) {
  console.log("[ig] logging in as", username, PROXY ? "(via proxy)" : "(direct)");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await authenticatePage(page);
    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    // Cookie banner may cover the form — handle it as a pre-flight.
    await handleCommonChallenges(page);
    await new Promise(r => setTimeout(r, 1500));

    const usernameInput = await page.$('input[name="username"], input[name="email"]') || await page.$('input[aria-label*="username" i]') || await page.$('input[aria-label*="phone" i]');
    const passwordInput = await page.$('input[name="password"], input[name="pass"]') || await page.$('input[type="password"]');

    if (!usernameInput || !passwordInput) {
      console.warn("[ig] login page inputs not found. Title:", await page.title());
      return { success: false, reason: "login_form_not_found" };
    }

    await usernameInput.type(username, { delay: 80 });
    await passwordInput.type(password, { delay: 80 });
    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 8000));

    // Fast-fail on obvious credential rejection before we start clicking
    // through prompts — otherwise "Try Again" buttons get treated as
    // normal challenges and we click in a loop.
    const firstBody = await page.evaluate(() => document.body.innerText || "").catch(() => "");
    if (/(password was incorrect|incorrect password|wrong password)/i.test(firstBody)) {
      return { success: false, reason: "invalid_credentials" };
    }

    // Level 1: hardcoded challenge clickers. Cheap, covers ~80% of
    // recoveries. Runs up to 5 rounds — each round clicks one thing
    // and waits for the next screen.
    for (let round = 0; round < 5; round++) {
      const r = await handleCommonChallenges(page);
      if (r.fatal) return { success: false, reason: r.fatal };
      if (r.done) break;
    }

    // Are we in yet?
    let cookies = await page.cookies();
    let sessionCookie = cookies.find(c => c.name === "sessionid");

    // Level 2: Claude vision fallback — only invoked if level 1 left us
    // on an unfamiliar screen. Costs ~$0.01 per call and only fires
    // when ANTHROPIC_API_KEY is present on the VPS.
    if (!sessionCookie) {
      for (let round = 0; round < 2; round++) {
        const action = await askClaudeVision(page, "Post-login screen. Click what progresses toward the Instagram feed.");
        if (!action) break;
        if (action.giveUp) {
          const reason = /code|sms|2fa|email/i.test(action.giveUp) ? "2fa_required" : "captcha_required";
          return { success: false, reason, detail: action.giveUp };
        }
        const clicked = await clickByVisibleText(page, action.click);
        if (!clicked) break;
        // Give the next screen a moment, then re-run level 1 in case
        // Claude's click surfaced another known prompt.
        await handleCommonChallenges(page);
        cookies = await page.cookies();
        sessionCookie = cookies.find(c => c.name === "sessionid");
        if (sessionCookie) break;
      }
    }

    if (!sessionCookie) {
      console.warn("[ig] no sessionid cookie after login — challenge not resolved");
      return { success: false, reason: "no_session" };
    }

    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    console.log("[ig] saved", cookies.length, "cookies (sessionid present)");
    return { success: true, cookies: cookies.length };
  } catch (err) {
    console.error("[ig] login failed:", err.message);
    return { success: false, reason: "unknown", detail: err.message };
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
    const profileStatus = profileResp.status();
    const profileText = await profileResp.text();

    // 404 = handle doesn't exist on Instagram. Surface this clearly so
    // the onboarding UI can tell the creator they've typed a non-existent
    // username rather than a generic "try again".
    if (profileStatus === 404) {
      return { success: false, error: "User not found on Instagram", posts: [], handle: cleanHandle };
    }

    // Non-JSON usually means we got an HTML challenge/login page, which
    // is a rate-limit or flagged-session signal — very different from a
    // user-not-found. Include status + response snippet in the log so we
    // can triage quickly instead of staring at a generic message.
    let profileData;
    try {
      profileData = JSON.parse(profileText);
    } catch {
      console.warn(`[scrape] non-JSON from profile API (status ${profileStatus}): ${profileText.slice(0, 200)}`);
      const msg = profileStatus === 429 || /require_login|wait a few minutes/i.test(profileText)
        ? "Instagram is rate-limiting us — please try again in a few minutes"
        : `Instagram returned HTTP ${profileStatus}`;
      return { success: false, error: msg, posts: [], handle: cleanHandle };
    }

    // JSON parsed but no user payload — e.g. require_login:true from IG
    if (profileData?.status === "fail" && profileData?.require_login) {
      return { success: false, error: "Scraper session expired — please wait a few minutes", posts: [], handle: cleanHandle };
    }

    const user = profileData?.data?.user;
    if (!user) {
      return { success: false, error: "User not found or account is private", posts: [], handle: cleanHandle };
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
    let httpErrorCount = 0;

    while (allPosts.length < maxPosts && consecutiveEmpty < 3) {
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
            if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };
            return await res.json();
          } catch (e) {
            return { error: e.message };
          }
        }, feedUrl);

        if (feedResult.error) {
          console.warn(`[scrape] feed page ${feedPage}: ${feedResult.error}`);
          // On 429/401 back off and retry once — IG occasionally hiccups
          if ((feedResult.status === 429 || feedResult.status === 401) && httpErrorCount === 0) {
            httpErrorCount++;
            console.log(`[scrape] backing off 30s then retrying page ${feedPage}`);
            await new Promise(r => setTimeout(r, 30_000));
            feedPage--; // re-attempt this page
            continue;
          }
          break;
        }

        const items = feedResult?.items || [];

        if (items.length === 0) {
          // Silent empty: 200 OK but zero items. If more_available is true
          // this usually means IG is rate-limiting us via silent degradation.
          console.log(
            `[scrape] feed page ${feedPage}: no items (more_available=${feedResult.more_available})`,
          );
          consecutiveEmpty++;
          if (!feedResult.more_available) break;
          // Longer cooldown on suspected silent rate-limit
          await new Promise(r => setTimeout(r, 10_000 + Math.random() * 5000));
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

        // Adaptive pacing — jitter 1.5-3s between pages; drop the cooldown
        // since we now scrape with a valid logged-in session cookie, which
        // gives IG a much higher tolerance for sustained page loads than
        // unauthenticated scraping did. Bigger cooldown stays behind a
        // "many consecutive errors" guard so we only throttle if IG
        // actually starts pushing back.
        const baseDelay = 1500 + Math.random() * 1500;
        const cooldown = consecutiveEmpty >= 1 ? 15_000 : 0;
        if (cooldown) console.log(`[scrape] cooldown pause ${cooldown / 1000}s (recent empty page)`);
        await new Promise(r => setTimeout(r, baseDelay + cooldown));
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

  if (req.method === "GET" && req.url === "/check-session") {
    const result = await checkSession();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  // Self-contained recovery: loads stored creds, runs the enhanced
  // login flow (hardcoded prompts + optional Claude vision fallback),
  // writes fresh cookies if successful. Caller gets a structured
  // reason when a human is required (2fa/captcha/invalid creds).
  if (req.method === "POST" && req.url === "/recover") {
    const creds = loadCreds();
    if (!creds || !creds.username || !creds.password) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, reason: "no_stored_creds" }));
      return;
    }
    const result = await loginAndSaveCookies(creds.username, creds.password);
    const status = result.success ? 200 : (result.reason === "2fa_required" || result.reason === "captcha_required" || result.reason === "invalid_credentials") ? 409 : 500;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === "POST" && req.url === "/admin/restart") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { service } = JSON.parse(body || "{}");

    const commands = {
      searxng: "docker restart searxng",
      libretranslate: "docker restart libretranslate",
      piper: "pkill -f '/opt/piper/server.mjs'; sleep 2; cd /opt/piper && nohup node server.mjs >> /opt/piper/piper.log 2>&1 &",
      scraper: "echo 'Cannot restart self'",
    };

    if (!commands[service]) {
      res.writeHead(400); res.end(JSON.stringify({ error: "Unknown service" })); return;
    }

    const { execSync } = await import("child_process");
    try {
      execSync(commands[service], { timeout: 15000 });
      res.writeHead(200); res.end(JSON.stringify({ success: true, service }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[scraper] listening on :${PORT}`, PROXY ? `(proxy: ${PROXY.host}:${PROXY.port})` : "(no proxy)");
});
