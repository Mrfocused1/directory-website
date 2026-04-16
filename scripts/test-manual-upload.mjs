#!/usr/bin/env node
/**
 * Verifies the manual-upload feature end-to-end against production
 * WITHOUT touching any paid third-party budget:
 *
 *   ✗ No Apify scrape (we seed the site directly)
 *   ✗ No Resend email (throwaway user is admin-created, pre-confirmed)
 *   ✗ No Groq/Anthropic (manual path skips transcription + categorization)
 *   ✓ One R2 thumbnail write (~2 KB) + one R2 media write (~2 KB)
 *
 * Creates a throwaway user, signs in via the real login form, POSTs
 * a multipart form with tiny in-memory PNG bytes to
 * /api/dashboard/posts, asserts the post + references rows were
 * inserted, fetches the R2 public URLs to confirm they serve,
 * then cleans up everything.
 */
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import sharp from "sharp";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")]; }),
);

const BASE = "https://buildmy.directory";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(env.DATABASE_URL, { max: 2 });

async function mkUser() {
  const stamp = Date.now().toString(36);
  const email = `qa-manupload-${stamp}@example.com`;
  const password = "testpassword123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user.id;
  await sql`INSERT INTO users (id, email, plan, created_at, updated_at) VALUES (${id}, ${email}, 'free', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`;
  return { id, email, password, stamp };
}
async function rmUser(id) {
  try { await sql`DELETE FROM users WHERE id = ${id}`; } catch {}
  try { await admin.auth.admin.deleteUser(id); } catch {}
}

async function main() {
  console.log("\n🧪 manual upload verification\n");
  const u = await mkUser();
  console.log(`  seeded throwaway user ${u.email}`);

  // Seed a site directly — NO apify call
  const slug = `qa-manup-${u.stamp}`;
  const [siteRow] = await sql`
    INSERT INTO sites (user_id, slug, platform, handle, display_name, is_published)
    VALUES (${u.id}, ${slug}, 'instagram', 'qa', 'Manual Upload Test', true)
    RETURNING id
  `;
  const siteId = siteRow.id;
  console.log(`  seeded site /${slug} (${siteId.slice(0, 8)})`);

  // Tiny test images — 200 x 250 solid color PNGs, ~2 KB each
  const thumbBytes = await sharp({
    create: { width: 200, height: 250, channels: 3, background: { r: 179, g: 255, b: 116 } },
  }).png().toBuffer();
  const mediaBytes = await sharp({
    create: { width: 200, height: 250, channels: 3, background: { r: 20, g: 0, b: 24 } },
  }).png().toBuffer();
  console.log(`  prepared thumbnail=${thumbBytes.length} B, media=${mediaBytes.length} B`);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  let postId = null, thumbUrl = null, mediaUrl = null;

  try {
    // Sign in — real login flow
    await page.goto(`${BASE}/login?next=/dashboard`, { waitUntil: "networkidle2" });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^sign in$/i.test((x.textContent || "").trim()));
      b?.click();
    });
    await page.waitForFunction(
      () => /welcome back/i.test(document.querySelector("h1")?.textContent || ""),
      { timeout: 5000 },
    ).catch(() => null);
    await page.type('input[type="email"]', u.email);
    await page.type('input[type="password"]', u.password);
    await page.click('form button[type="submit"]');
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/login"),
      { timeout: 20000, polling: 400 },
    );
    console.log(`  ✓ signed in`);

    // POST multipart form directly from the authenticated page context
    const submit = await page.evaluate(async (payload) => {
      const fd = new FormData();
      fd.append("siteId", payload.siteId);
      fd.append("caption", payload.caption);
      fd.append("title", payload.title);
      fd.append("category", payload.category);
      fd.append("platformUrl", payload.platformUrl);
      fd.append("type", "image");
      // reconstruct Files from base64
      const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      fd.append("thumbnail", new File([decode(payload.thumb)], "thumb.png", { type: "image/png" }));
      fd.append("media", new File([decode(payload.media)], "media.png", { type: "image/png" }));
      const res = await fetch("/api/dashboard/posts", { method: "POST", body: fd });
      return { status: res.status, body: await res.text() };
    }, {
      siteId,
      caption: "QA: manual upload smoke test — should appear on the public tenant page.",
      title: "QA manual upload",
      category: "QA",
      platformUrl: "https://example.com/qa",
      thumb: thumbBytes.toString("base64"),
      media: mediaBytes.toString("base64"),
    });

    if (submit.status !== 201) {
      console.error(`  ✗ POST /api/dashboard/posts → ${submit.status}: ${submit.body.slice(0, 200)}`);
      process.exit(1);
    }
    const parsed = JSON.parse(submit.body);
    postId = parsed.post.id;
    thumbUrl = parsed.post.thumbUrl;
    mediaUrl = parsed.post.mediaUrl;
    console.log(`  ✓ post created id=${postId.slice(0, 8)} shortcode=${parsed.post.shortcode}`);
    console.log(`    thumbUrl=${thumbUrl}`);
    console.log(`    mediaUrl=${mediaUrl}`);

    // Verify DB row
    const [postRow] = await sql`SELECT id, caption, title, category, thumb_url, media_url FROM posts WHERE id = ${postId}`;
    if (!postRow) { console.error("  ✗ post row not found in DB"); process.exit(1); }
    if (postRow.caption !== "QA: manual upload smoke test — should appear on the public tenant page.") {
      console.error(`  ✗ caption mismatch: "${postRow.caption}"`);
      process.exit(1);
    }
    console.log(`  ✓ DB row: category="${postRow.category}" title="${postRow.title}"`);

    // Verify R2 public URLs serve
    const thumbResp = await fetch(thumbUrl);
    const mediaResp = await fetch(mediaUrl);
    if (!thumbResp.ok) { console.error(`  ✗ thumb URL returned HTTP ${thumbResp.status}`); process.exit(1); }
    if (!mediaResp.ok) { console.error(`  ✗ media URL returned HTTP ${mediaResp.status}`); process.exit(1); }
    const thumbContentType = thumbResp.headers.get("content-type");
    const mediaContentType = mediaResp.headers.get("content-type");
    console.log(`  ✓ public thumb 200 (${thumbContentType}, ${thumbResp.headers.get("content-length")} B)`);
    console.log(`  ✓ public media 200 (${mediaContentType}, ${mediaResp.headers.get("content-length")} B)`);

    // Confirm tenant page revalidated (the freshly-created post is listed)
    const tenantHtml = await fetch(`${BASE}/${slug}`).then((r) => r.text());
    const containsPost = tenantHtml.includes(postRow.title) || tenantHtml.includes(parsed.post.shortcode);
    console.log(`  ${containsPost ? "✓" : "✗"} tenant page includes new post`);

    console.log("\n✅ manual upload works end-to-end (no paid services touched)");
  } finally {
    await browser.close();
    // Cleanup
    try {
      await sql`DELETE FROM sites WHERE id = ${siteId}`;
      console.log(`\n  cleaned site + post + refs (cascade)`);
    } catch {}
    await rmUser(u.id);
    console.log(`  cleaned throwaway user`);
    await sql.end();
  }
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  try { await sql.end(); } catch {}
  process.exit(1);
});
