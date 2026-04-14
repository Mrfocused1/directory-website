import { NextResponse } from "next/server";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, count } from "drizzle-orm";

// GET /api/sites — List all sites for the current user
// TODO: Filter by authenticated userId once auth is implemented
export async function GET() {
  if (!db) {
    return NextResponse.json({ sites: [] });
  }

  // TODO: Once auth is added, filter by userId from session:
  // const session = await getSession();
  // const userSites = await db.query.sites.findMany({ where: eq(sites.userId, session.userId) });
  const allSites = await db.query.sites.findMany();

  // Get post counts for each site
  const result = await Promise.all(
    allSites.map(async (site) => {
      const [postCount] = await db!.select({ count: count() })
        .from(posts)
        .where(eq(posts.siteId, site.id));

      return {
        id: site.id,
        slug: site.slug,
        displayName: site.displayName,
        handle: site.handle,
        platform: site.platform,
        postCount: postCount.count,
        isPublished: site.isPublished,
        lastSyncAt: site.lastSyncAt?.toISOString() ?? null,
      };
    }),
  );

  return NextResponse.json({ sites: result });
}
