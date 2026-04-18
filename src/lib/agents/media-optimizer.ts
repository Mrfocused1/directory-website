/**
 * Media Optimizer — hides posts with broken media URLs and flags missing thumbnails.
 */

import { db } from "@/db";
import { posts, sites } from "@/db/schema";
import { eq, and, isNull, or, sql } from "drizzle-orm";

const HEAD_TIMEOUT_MS = 5_000;
const MAX_CHECK_PER_RUN = 300;

async function isMediaBroken(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 BuildMyDirectoryBot/1.0 (+https://buildmy.directory)" },
        redirect: "follow",
      });
      return res.status === 404 || res.status === 410;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return true; // network error = treat as broken
  }
}

export async function runMediaOptimizer() {
  console.log("[media-optimizer] starting");
  if (!db) return { skipped: "db not configured" };

  let postsChecked = 0;
  let brokenMediaHidden = 0;
  let missingThumbs = 0;

  // 1. Find visible posts with a mediaUrl — check for 404/410
  const postsWithMedia = await db.query.posts.findMany({
    where: and(eq(posts.isVisible, true)),
    columns: { id: true, mediaUrl: true, thumbUrl: true, siteId: true, shortcode: true },
    limit: MAX_CHECK_PER_RUN,
  });

  const missingThumbIds: string[] = [];
  const stats: Record<string, { total: number; broken: number; noThumb: number }> = {};

  for (const post of postsWithMedia) {
    postsChecked++;
    const siteStats = stats[post.siteId] ?? { total: 0, broken: 0, noThumb: 0 };
    siteStats.total++;

    // Check for broken media URL
    if (post.mediaUrl) {
      const broken = await isMediaBroken(post.mediaUrl);
      if (broken) {
        await db.update(posts).set({ isVisible: false }).where(eq(posts.id, post.id));
        siteStats.broken++;
        brokenMediaHidden++;
        console.log(`[media-optimizer] hidden post ${post.shortcode} (broken mediaUrl: ${post.mediaUrl})`);
        stats[post.siteId] = siteStats;
        continue; // no need to check thumb if post is now hidden
      }
    }

    // Check for missing thumbnail
    if (!post.thumbUrl || post.thumbUrl.trim() === "") {
      siteStats.noThumb++;
      missingThumbs++;
      missingThumbIds.push(post.id);
    }

    stats[post.siteId] = siteStats;
  }

  if (missingThumbIds.length > 0) {
    console.log(`[media-optimizer] ${missingThumbIds.length} posts need thumbnails (flagged for VPS doctor)`);
  }

  console.log(`[media-optimizer] done — postsChecked=${postsChecked} brokenMediaHidden=${brokenMediaHidden} missingThumbs=${missingThumbs}`);
  return { postsChecked, brokenMediaHidden, missingThumbs, stats };
}
