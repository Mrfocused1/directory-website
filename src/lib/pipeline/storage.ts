/**
 * Media Storage Module — powered by Vercel Blob
 *
 * Downloads media from scraped URLs and stores them in Vercel Blob.
 * Falls back to using original URLs if Blob is not configured.
 */

import { put } from "@vercel/blob";

/**
 * Upload a media file from a URL to Vercel Blob.
 * Returns the Blob URL, or the original URL if upload fails.
 */
export async function uploadFromUrl(
  sourceUrl: string,
  path: string,
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !sourceUrl) {
    return sourceUrl; // Fall back to original URL
  }

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return sourceUrl;

    const blob = await put(path, response.body!, {
      access: "public",
      contentType: response.headers.get("content-type") || "image/jpeg",
    });

    return blob.url;
  } catch (error) {
    console.error(`[storage] Failed to upload ${path}:`, error);
    return sourceUrl; // Fall back to original URL
  }
}

/**
 * Upload a thumbnail for a post.
 */
export async function uploadThumbnail(
  siteSlug: string,
  shortcode: string,
  thumbUrl: string,
): Promise<string> {
  if (!thumbUrl) return "";
  return uploadFromUrl(thumbUrl, `sites/${siteSlug}/thumbs/${shortcode}.jpg`);
}

/**
 * Upload a video or image for a post.
 */
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
