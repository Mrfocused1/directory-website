import { db } from "@/db";
import { sites } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Resolve a siteId that could be either a UUID or a slug to a UUID.
 * Client-side code often passes the slug from the URL, but DB queries need the UUID.
 *
 * Returns the UUID if found, null otherwise.
 */
export async function resolveSiteId(siteIdOrSlug: string): Promise<string | null> {
  if (!db) return null;

  // Check if it looks like a UUID (36 chars with hyphens)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteIdOrSlug);

  if (isUUID) {
    // Verify it exists
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteIdOrSlug),
      columns: { id: true },
    });
    return site?.id ?? null;
  }

  // It's a slug — look up the UUID
  const site = await db.query.sites.findFirst({
    where: eq(sites.slug, siteIdOrSlug),
    columns: { id: true },
  });
  return site?.id ?? null;
}
