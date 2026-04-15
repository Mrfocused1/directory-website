import type { MetadataRoute } from "next";
import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

/**
 * Dynamic sitemap: marketing pages + every published tenant directory
 * + up to 1000 of the most recent posts across all directories.
 * Kept under the Google 50k-URL soft cap by design.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const marketing: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  if (!db) return marketing;

  try {
    const publishedSites = await db.query.sites.findMany({
      where: eq(sites.isPublished, true),
      columns: { slug: true, updatedAt: true },
      limit: 10_000,
    });

    const tenantRoots: MetadataRoute.Sitemap = publishedSites.map((s) => ({
      url: `${SITE_URL}/d/${s.slug}`,
      lastModified: s.updatedAt ?? now,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    // Fetch the most recent visible posts across all published sites.
    // We cap the list at 1000 for performance; larger sites can expose a
    // per-tenant sitemap later if needed.
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
      .limit(1000);

    const postUrls: MetadataRoute.Sitemap = recentPosts.map((p) => ({
      url: `${SITE_URL}/d/${p.siteSlug}/p/${p.shortcode}`,
      lastModified: p.takenAt ?? p.createdAt ?? now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

    return [...marketing, ...tenantRoots, ...postUrls];
  } catch (err) {
    console.error("[sitemap] Failed to build full sitemap:", err);
    return marketing;
  }
}
