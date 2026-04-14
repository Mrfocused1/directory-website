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

  try {
    const allSites = await db.query.sites.findMany();

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
  } catch (error) {
    console.error("[sites] GET error:", error);
    return NextResponse.json({ sites: [] });
  }
}
