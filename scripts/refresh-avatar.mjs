#!/usr/bin/env node
/**
 * Fetch an Instagram profile picture via the public
 * web_profile_info endpoint. If BLOB_READ_WRITE_TOKEN is set,
 * mirror the image to Vercel Blob (permanent URL). Otherwise
 * store the signed IG URL directly — works for a few days then
 * needs re-running.
 *
 * Applies to every creator on the platform. Called from
 * build-site.mjs at the end of every pipeline run; also safe to
 * run by hand.
 *
 * Usage: node scripts/refresh-avatar.mjs <site-slug>
 */
import "dotenv/config";
import pg from "pg";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/refresh-avatar.mjs <site-slug>");
  process.exit(1);
}

// Determine the IG handle. We read sites.handle first — it's the
// authoritative source; slug may have been normalised. Fall back to
// slug when the row is missing a handle.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const {
  rows: [siteRow],
} = await client.query(
  "SELECT handle, platform FROM sites WHERE slug = $1",
  [slug],
);
if (!siteRow) {
  console.error(`No site with slug "${slug}"`);
  await client.end();
  process.exit(2);
}
if (siteRow.platform && siteRow.platform !== "instagram") {
  console.log(`Skipping avatar refresh — platform is ${siteRow.platform}, not instagram.`);
  await client.end();
  process.exit(0);
}
const handle = (siteRow.handle || slug).replace(/^@/, "");

const res = await fetch(
  `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
  {
    headers: {
      "X-IG-App-ID": "936619743392459",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  },
);
if (!res.ok) {
  console.error(`Instagram API returned ${res.status}`);
  await client.end();
  process.exit(2);
}
const data = await res.json();
const picUrl = data?.data?.user?.profile_pic_url_hd || data?.data?.user?.profile_pic_url;
if (!picUrl) {
  console.error("No profile pic URL in response");
  await client.end();
  process.exit(2);
}
console.log(`Fetched IG profile pic URL for @${handle}`);

// Try to mirror to Vercel Blob if we have the token. Otherwise
// store the signed IG URL directly — it'll work for a few days.
let persistentUrl = picUrl;
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (token) {
  try {
    const { put } = await import("@vercel/blob");
    const imgRes = await fetch(picUrl);
    if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const key = `sites/${slug}/avatar-${Date.now()}.jpg`;
    const blob = await put(key, buf, {
      access: "public",
      contentType: "image/jpeg",
      token,
    });
    persistentUrl = blob.url;
    console.log(`Mirrored to Blob: ${(buf.length / 1024).toFixed(1)} KB → ${blob.url}`);
  } catch (err) {
    console.warn(`⚠ Blob upload failed (${err.message}) — storing raw IG URL instead`);
  }
} else {
  console.log("BLOB_READ_WRITE_TOKEN not set — storing raw IG URL (expires in ~3 days)");
}

const result = await client.query(
  "UPDATE sites SET avatar_url = $1 WHERE slug = $2 RETURNING slug, avatar_url",
  [persistentUrl, slug],
);
await client.end();
console.log(`✓ Avatar updated for ${result.rows[0].slug}`);
