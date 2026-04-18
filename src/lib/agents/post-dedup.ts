/**
 * Post Deduplication — hides duplicate posts per site.
 */

import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function runPostDedup() {
  console.log("[post-dedup] starting");
  if (!db) return { skipped: "db not configured" };

  const publishedSites = await db.query.sites.findMany({
    where: eq(sites.isPublished, true),
    columns: { id: true, slug: true },
  });

  let sitesChecked = 0;
  let duplicatesFound = 0;
  let postsHidden = 0;

  for (const site of publishedSites) {
    sitesChecked++;

    const visiblePosts = await db.query.posts.findMany({
      where: and(eq(posts.siteId, site.id), eq(posts.isVisible, true)),
      columns: { id: true, shortcode: true, caption: true, takenAt: true },
      orderBy: (p, { asc }) => [asc(p.takenAt)],
    });

    // Group by shortcode
    const byShortcode = new Map<string, typeof visiblePosts>();
    for (const post of visiblePosts) {
      const bucket = byShortcode.get(post.shortcode) || [];
      bucket.push(post);
      byShortcode.set(post.shortcode, bucket);
    }

    // Group by exact caption (trimmed)
    const byCaption = new Map<string, typeof visiblePosts>();
    for (const post of visiblePosts) {
      const key = (post.caption || "").trim();
      if (!key) continue;
      const bucket = byCaption.get(key) || [];
      bucket.push(post);
      byCaption.set(key, bucket);
    }

    // Group by first 100 chars of caption
    const byPrefix = new Map<string, typeof visiblePosts>();
    for (const post of visiblePosts) {
      const prefix = (post.caption || "").trim().slice(0, 100);
      if (prefix.length < 20) continue;
      const bucket = byPrefix.get(prefix) || [];
      bucket.push(post);
      byPrefix.set(prefix, bucket);
    }

    const toHide = new Set<string>();

    // Collect dupes: keep earliest takenAt, hide the rest
    const processGroup = (group: typeof visiblePosts) => {
      if (group.length < 2) return;
      duplicatesFound++;
      // Already sorted by takenAt asc (or null last)
      const sorted = [...group].sort((a, b) => {
        const ta = a.takenAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const tb = b.takenAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      for (let i = 1; i < sorted.length; i++) {
        toHide.add(sorted[i].id);
      }
    };

    for (const group of byShortcode.values()) processGroup(group);
    for (const group of byCaption.values()) processGroup(group);
    for (const group of byPrefix.values()) processGroup(group);

    for (const postId of toHide) {
      await db.update(posts).set({ isVisible: false }).where(eq(posts.id, postId));
      postsHidden++;
      console.log(`[post-dedup] hidden duplicate post ${postId} on site ${site.slug}`);
    }
  }

  console.log(`[post-dedup] done — sitesChecked=${sitesChecked} duplicatesFound=${duplicatesFound} postsHidden=${postsHidden}`);
  return { sitesChecked, duplicatesFound, postsHidden };
}
