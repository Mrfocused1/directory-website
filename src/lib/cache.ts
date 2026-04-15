import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Invalidate the CDN cache for a tenant's public pages after a write
 * that affects what visitors see (pipeline completion, profile edits,
 * post edits, bulk actions, reorder).
 *
 * Tenant pages have a 5-minute `revalidate`; this call makes the
 * change visible immediately instead of up to 5 minutes stale.
 * Swallows errors — stale cache for 5 minutes is never a reason to
 * fail the originating write.
 */
export async function revalidateTenantBySiteId(siteId: string): Promise<void> {
  if (!db) return;
  try {
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
      columns: { slug: true },
    });
    if (site?.slug) {
      revalidatePath(`/${site.slug}`);
    }
  } catch (err) {
    console.warn(
      "[cache] revalidate skipped:",
      err instanceof Error ? err.message : err,
    );
  }
}
