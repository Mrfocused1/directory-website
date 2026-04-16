/**
 * Media Storage Module — provider-agnostic.
 *
 * Picks Vercel Blob or Cloudflare R2 at runtime based on
 * `STORAGE_PROVIDER`:
 *
 *   STORAGE_PROVIDER=r2     → route uploads to R2 via the S3 protocol
 *   anything else / unset   → stay on Vercel Blob (legacy)
 *
 * Both providers expose the same surface (uploadFromUrl,
 * uploadThumbnail, uploadMedia, uploadBuffer) so callers don't care
 * which one is active. Flip between them in 30 seconds by changing
 * the env var — no code change.
 *
 * R2 is ~35% cheaper per GB of storage AND has free egress forever,
 * so at any meaningful scale it wins. We kept Blob working as a
 * graceful fallback: if R2 env vars aren't set, or if an R2 upload
 * throws, we either fall through to Blob (for backwards-compat reads)
 * or return the source URL so the pipeline never hard-crashes on a
 * storage hiccup.
 */

import { put, del } from "@vercel/blob";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

type StorageProvider = "r2" | "blob";

function activeProvider(): StorageProvider {
  return process.env.STORAGE_PROVIDER === "r2" ? "r2" : "blob";
}

// ─── R2 client (lazy, singleton) ─────────────────────────────────────
let _r2: S3Client | null = null;
function r2Client(): S3Client | null {
  if (_r2) return _r2;
  const endpoint = process.env.R2_S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  _r2 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _r2;
}

function r2PublicUrl(path: string): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") || "";
  return `${base}/${path.replace(/^\//, "")}`;
}

// ─── Upload from a source URL ────────────────────────────────────────
/**
 * Download a file from `sourceUrl` and upload it to the active
 * storage provider at `path`. Returns the public URL.
 *
 * If the active provider fails or isn't configured, returns
 * `sourceUrl` so the pipeline keeps going with whatever the scraper
 * originally gave us.
 */
export async function uploadFromUrl(
  sourceUrl: string,
  path: string,
): Promise<string> {
  if (!sourceUrl) return sourceUrl;

  const provider = activeProvider();
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return sourceUrl;
    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (provider === "r2") {
      const client = r2Client();
      const bucket = process.env.R2_BUCKET;
      if (!client || !bucket) return sourceUrl;
      const buffer = Buffer.from(await response.arrayBuffer());
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path.replace(/^\//, ""),
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return r2PublicUrl(path);
    }

    // Default / blob path
    if (!process.env.BLOB_READ_WRITE_TOKEN) return sourceUrl;
    const blob = await put(path, response.body!, {
      access: "public",
      contentType,
    });
    return blob.url;
  } catch (error) {
    console.error(`[storage:${provider}] upload from url failed for ${path}:`, error);
    return sourceUrl;
  }
}

/**
 * Upload a raw buffer (for direct user uploads — manual-upload feature,
 * admin tooling, etc.). Returns the public URL or empty string on
 * failure (caller decides whether to surface the error).
 */
export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const provider = activeProvider();
  try {
    if (provider === "r2") {
      const client = r2Client();
      const bucket = process.env.R2_BUCKET;
      if (!client || !bucket) throw new Error("R2 not configured");
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path.replace(/^\//, ""),
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return r2PublicUrl(path);
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Blob not configured");
    const blob = await put(path, buffer, { access: "public", contentType });
    return blob.url;
  } catch (error) {
    console.error(`[storage:${provider}] upload buffer failed for ${path}:`, error);
    return "";
  }
}

/** Upload a thumbnail for a post. */
export async function uploadThumbnail(
  siteSlug: string,
  shortcode: string,
  thumbUrl: string,
): Promise<string> {
  if (!thumbUrl) return "";
  return uploadFromUrl(thumbUrl, `sites/${siteSlug}/thumbs/${shortcode}.jpg`);
}

/** Upload a video or image for a post. */
export async function uploadMedia(
  siteSlug: string,
  shortcode: string,
  mediaUrl: string,
  type: "video" | "image",
): Promise<string> {
  if (!mediaUrl) return "";
  const ext = type === "video" ? "mp4" : "jpg";
  return uploadFromUrl(mediaUrl, `sites/${siteSlug}/media/${shortcode}.${ext}`);
}

/**
 * Best-effort deletion of a file from the active storage provider.
 * Failures are logged but never thrown — callers should not let a
 * storage cleanup error block a database operation.
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url) return;

  const provider = activeProvider();
  try {
    if (provider === "r2") {
      const client = r2Client();
      const bucket = process.env.R2_BUCKET;
      if (!client || !bucket) return;

      // Extract the object key from the public URL.
      // R2_PUBLIC_URL is the base (e.g. https://cdn.example.com) — strip
      // it to get the key.  If the URL doesn't match, skip silently.
      const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
      if (!publicBase || !url.startsWith(publicBase)) return;
      const key = url.slice(publicBase.length).replace(/^\//, "");
      if (!key) return;

      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
      return;
    }

    // Vercel Blob path
    if (!process.env.BLOB_READ_WRITE_TOKEN) return;
    await del(url);
  } catch (error) {
    console.error(`[storage:${provider}] delete failed for ${url}:`, error);
  }
}
