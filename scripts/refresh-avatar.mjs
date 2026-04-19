#!/usr/bin/env node
/**
 * Fetch an Instagram profile picture via the public
 * web_profile_info endpoint, mirror it to our storage provider
 * (so the signed CDN URL doesn't expire), and update
 * sites.avatar_url with the persistent URL.
 *
 * Usage: node scripts/refresh-avatar.mjs <site-slug>
 *
 * Env required: DATABASE_URL, BLOB_READ_WRITE_TOKEN (or R2_* set).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { put } from "@vercel/blob";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/refresh-avatar.mjs <site-slug>");
  process.exit(1);
}

const res = await fetch(
  `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(slug)}`,
  {
    headers: {
      "X-IG-App-ID": "936619743392459",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  },
);
if (!res.ok) {
  console.error(`Instagram API returned ${res.status}`);
  process.exit(2);
}
const data = await res.json();
const picUrl = data?.data?.user?.profile_pic_url_hd || data?.data?.user?.profile_pic_url;
if (!picUrl) {
  console.error("No profile pic URL in response");
  process.exit(2);
}
console.log(`Fetched IG profile pic URL: ${picUrl.slice(0, 80)}...`);

// Download
const imgRes = await fetch(picUrl);
if (!imgRes.ok) {
  console.error(`Image download failed: ${imgRes.status}`);
  process.exit(2);
}
const buf = Buffer.from(await imgRes.arrayBuffer());
console.log(`Downloaded ${(buf.length / 1024).toFixed(1)} KB`);

// Upload to Vercel Blob
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN not set");
  process.exit(3);
}
const key = `sites/${slug}/avatar-${Date.now()}.jpg`;
const blob = await put(key, buf, {
  access: "public",
  contentType: "image/jpeg",
  token,
});
console.log(`Uploaded to Blob: ${blob.url}`);

// Update DB
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const result = await client.query(
  "UPDATE sites SET avatar_url = $1 WHERE slug = $2 RETURNING slug, avatar_url",
  [blob.url, slug],
);
await client.end();
console.log("DB row:", result.rows[0]);
