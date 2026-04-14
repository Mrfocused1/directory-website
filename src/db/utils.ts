import { db } from "@/db";
import { sites } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Resolve a siteId that could be either a UUID or a slug to a UUID.
 * Client-side code often passes the slug from the URL, but DB queries need the UUID.
 *
 * Returns the UUID if found, null otherwise.
 */
export async function resolveSiteId(siteIdOrSlug: string): Promise<string | null> {
  if (!db) return null;

  try {
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
  } catch (error) {
    console.error("[resolveSiteId] Query failed:", error);
    return null;
  }
}

/**
 * Verify a user owns a site. Returns the resolved siteId UUID if owned,
 * null otherwise. Use in dashboard API GETs to prevent IDOR.
 */
export async function ownedSiteId(siteIdOrSlug: string, userId: string): Promise<string | null> {
  if (!db) return null;
  const resolvedSiteId = await resolveSiteId(siteIdOrSlug);
  if (!resolvedSiteId) return null;

  try {
    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, resolvedSiteId), eq(sites.userId, userId)),
      columns: { id: true },
    });
    return site?.id ?? null;
  } catch (error) {
    console.error("[ownedSiteId] Query failed:", error);
    return null;
  }
}
