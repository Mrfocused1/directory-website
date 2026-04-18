/**
 * Storage Cleanup — removes orphaned posts/references and reports storage stats.
 */

import { db } from "@/db";
import { posts, references, sites } from "@/db/schema";
import { inArray, notInArray, sql } from "drizzle-orm";

export async function runStorageCleanup() {
  console.log("[storage-cleanup] starting");
  if (!db) return { skipped: "db not configured" };

  let orphanedPostsDeleted = 0;
  let orphanedRefsDeleted = 0;

  // Find site IDs that still exist
  const existingSiteRows = await db.select({ id: sites.id }).from(sites);
  const existingSiteIds = existingSiteRows.map((r) => r.id);

  if (existingSiteIds.length === 0) {
    // No sites at all — skip deletion to avoid nuking everything
    console.log("[storage-cleanup] no sites found, skipping orphan deletion");
  } else {
    // Find orphaned posts (site_id not in any existing site)
    const orphanedPosts = await db
      .select({ id: posts.id })
      .from(posts)
      .where(notInArray(posts.siteId, existingSiteIds));

    if (orphanedPosts.length > 0) {
      const orphanedPostIds = orphanedPosts.map((p) => p.id);

      // Delete references for orphaned posts first (foreign key safety)
      const deletedRefs = await db
        .delete(references)
        .where(inArray(references.postId, orphanedPostIds))
        .returning({ id: references.id });
      orphanedRefsDeleted = deletedRefs.length;

      // Delete the orphaned posts
      const deletedPosts = await db
        .delete(posts)
        .where(inArray(posts.id, orphanedPostIds))
        .returning({ id: posts.id });
      orphanedPostsDeleted = deletedPosts.length;

      console.log(`[storage-cleanup] deleted ${orphanedPostsDeleted} orphaned posts, ${orphanedRefsDeleted} orphaned refs`);
    }
  }

  // Count totals for reporting
  const [postCountRow] = await db.select({ count: sql<number>`count(*)` }).from(posts);
  const [refCountRow] = await db.select({ count: sql<number>`count(*)` }).from(references);
  const totalPosts = Number(postCountRow?.count ?? 0);
  const totalRefs = Number(refCountRow?.count ?? 0);

  console.log(`[storage-cleanup] done — orphanedPostsDeleted=${orphanedPostsDeleted} orphanedRefsDeleted=${orphanedRefsDeleted} totalPosts=${totalPosts} totalRefs=${totalRefs}`);
  return { orphanedPostsDeleted, orphanedRefsDeleted, totalPosts, totalRefs };
}
