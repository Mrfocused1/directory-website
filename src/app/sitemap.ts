import type { MetadataRoute } from "next";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

const MAX_URLS_PER_SITEMAP = 5000;

/**
 * Generate sitemap index chunks based on total post count.
 * Next.js calls this to discover /sitemap/0.xml, /sitemap/1.xml, etc.
 */
export async function generateSitemaps() {
  if (!db) return [{ id: 0 }];

  try {
    const [result] = await db
      .select({ total: count() })
      .from(posts)
      .innerJoin(sites, eq(posts.siteId, sites.id))
      .where(and(eq(posts.isVisible, true), eq(sites.isPublished, true)));

    const totalPosts = result?.total ?? 0;
    // Sitemap 0 always exists (it carries static + tenant pages + first chunk of posts).
    // Additional sitemaps hold further post chunks.
    const numSitemaps = Math.max(1, Math.ceil(totalPosts / MAX_URLS_PER_SITEMAP));
    return Array.from({ length: numSitemaps }, (_, i) => ({ id: i }));
  } catch (err) {
    console.error("[sitemap] generateSitemaps failed:", err);
    return [{ id: 0 }];
  }
}

/**
 * Generate the URLs for a single sitemap chunk.
 * Chunk 0 includes static marketing pages + all tenant root pages + first
 * batch of posts. Subsequent chunks are posts only.
 */
export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const marketing: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  if (!db) return id === 0 ? marketing : [];

  try {
    // Static + tenant pages only go into sitemap 0
    let tenantRoots: MetadataRoute.Sitemap = [];
    if (id === 0) {
      const publishedSites = await db.query.sites.findMany({
        where: eq(sites.isPublished, true),
        columns: { slug: true, updatedAt: true },
        limit: 10_000,
      });

      tenantRoots = publishedSites.map((s) => ({
        url: `${SITE_URL}/${s.slug}`,
        lastModified: s.updatedAt ?? now,
        changeFrequency: "daily",
        priority: 0.8,
      }));
    }

    // Posts are paginated across sitemaps
    const offset = id * MAX_URLS_PER_SITEMAP;
    const recentPosts = await db
      .select({
        siteSlug: sites.slug,
        shortcode: posts.shortcode,
        takenAt: posts.takenAt,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .innerJoin(sites, eq(posts.siteId, sites.id))
      .where(and(eq(posts.isVisible, true), eq(sites.isPublished, true)))
      .orderBy(desc(posts.takenAt))
      .limit(MAX_URLS_PER_SITEMAP)
      .offset(offset);

    const postUrls: MetadataRoute.Sitemap = recentPosts.map((p) => ({
      url: `${SITE_URL}/${p.siteSlug}/p/${p.shortcode}`,
      lastModified: p.takenAt ?? p.createdAt ?? now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

    if (id === 0) {
      return [...marketing, ...tenantRoots, ...postUrls];
    }
    return postUrls;
  } catch (err) {
    console.error("[sitemap] Failed to build sitemap chunk", id, ":", err);
    return id === 0 ? marketing : [];
  }
}
