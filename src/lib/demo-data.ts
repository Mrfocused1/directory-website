import { db } from "@/db";
import { sites, posts, references, platformConnections, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { SiteConfig, SitePost, Reference, PlatformConnection, Platform } from "@/lib/types";
import { hasFeature, type PlanId } from "@/lib/plans";

export type SiteBranding = {
  // Set when white-label is active (Agency plan)
  customBrandName: string | null;
  customBrandUrl: string | null;
  // Whether the "Powered by BuildMy.Directory" badge should be shown
  showPoweredBy: boolean;
};

/**
 * Fetches site data from the database for tenant pages.
 * Falls back to demo data when DB is unavailable (development).
 */
export async function getSiteData(tenantSlug: string): Promise<{
  siteId: string;
  site: SiteConfig;
  posts: SitePost[];
  branding: SiteBranding;
  features: { newsletter: boolean; requests: boolean; bookmarks: boolean };
} | null> {
  if (db) {
    return getSiteDataFromDB(tenantSlug);
  }
  // Fallback: generate demo data when DB is unavailable
  return getDemoSiteData(tenantSlug);
}

async function getSiteDataFromDB(tenantSlug: string): Promise<{
  siteId: string;
  site: SiteConfig;
  posts: SitePost[];
  branding: SiteBranding;
  features: { newsletter: boolean; requests: boolean; bookmarks: boolean };
} | null> {
  const site = await db!.query.sites.findFirst({
    where: eq(sites.slug, tenantSlug),
  });

  if (!site) {
    // No site found in DB — fall back to demo for the "demo" slug
    if (tenantSlug === "demo") return getDemoSiteData(tenantSlug);
    return null;
  }

  // Don't expose unpublished/draft directories
  if (!site.isPublished && tenantSlug !== "demo") {
    return null;
  }

  // Fetch platform connections
  const connections = await db!.query.platformConnections.findMany({
    where: eq(platformConnections.siteId, site.id),
  });

  const platforms: PlatformConnection[] = connections.map((c) => ({
    id: c.id,
    platform: c.platform as Platform,
    handle: c.handle,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    followerCount: c.followerCount,
    postCount: c.postCount ?? 0,
    isConnected: c.isConnected,
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    syncStatus: c.syncStatus as PlatformConnection["syncStatus"],
  }));

  // Fetch posts with references. Order: pinned first, then by manual
  // sortOrder if the creator has reordered, then by takenAt (newest).
  const sitePosts = await db!.query.posts.findMany({
    where: eq(posts.siteId, site.id),
    orderBy: (posts, { desc, asc }) => [
      desc(posts.isFeatured),
      asc(posts.sortOrder),
      desc(posts.takenAt),
    ],
  });

  // Batch-load ALL references for this site's posts in a single query
  // instead of one query per post (N+1).
  const postIds = sitePosts.map((p) => p.id);
  const allRefs = postIds.length > 0
    ? await db!.select().from(references).where(inArray(references.postId, postIds))
    : [];

  // Group references by postId for O(1) lookup
  const refsByPostId = new Map<string, typeof allRefs>();
  for (const r of allRefs) {
    if (!refsByPostId.has(r.postId)) refsByPostId.set(r.postId, []);
    refsByPostId.get(r.postId)!.push(r);
  }

  const postList: SitePost[] = sitePosts.map((p) => {
    const refs = refsByPostId.get(p.id) ?? [];

    const mappedRefs: Reference[] = refs.map((r) =>
      r.kind === "youtube"
        ? { kind: "youtube" as const, title: r.title, videoId: r.videoId || "", note: r.note || undefined }
        : { kind: "article" as const, title: r.title, url: r.url || "", note: r.note || undefined },
    );

    return {
      id: p.id,
      shortcode: p.shortcode,
      type: p.type as SitePost["type"],
      caption: p.caption,
      title: p.title,
      category: p.category,
      platform: (site.platform || "instagram") as Platform,
      takenAt: p.takenAt?.toISOString() ?? null,
      mediaUrl: p.mediaUrl,
      thumbUrl: p.thumbUrl,
      numSlides: p.numSlides ?? 0,
      slides: p.slides ?? null,
      transcript: p.transcript,
      platformUrl: p.platformUrl,
      references: mappedRefs,
      isFeatured: p.isFeatured,
    };
  });

  const siteConfig: SiteConfig = {
    slug: site.slug,
    displayName: site.displayName || site.slug,
    bio: site.bio,
    avatarUrl: site.avatarUrl,
    handle: site.handle,
    platform: site.platform as Platform,
    accentColor: site.accentColor || "#000000",
    categories: (site.categories as string[]) || [],
    platforms,
    gridColumns: (site.gridColumns === 2 ? 2 : 3) as 2 | 3,
  };

  // Determine branding based on the owner's plan
  const owner = await db!.query.users.findFirst({
    where: eq(users.id, site.userId),
    columns: { plan: true },
  });
  const validPlans = ["free", "creator", "pro", "agency"];
  const planId = (validPlans.includes(owner?.plan as string) ? owner!.plan : "free") as PlanId;
  const canRemoveBranding = hasFeature(planId, "remove_branding");
  const canWhiteLabel = hasFeature(planId, "white_label");

  const branding: SiteBranding = {
    // White-label only takes effect when the plan allows it
    customBrandName: canWhiteLabel ? site.whiteLabelBrand : null,
    customBrandUrl: canWhiteLabel ? site.whiteLabelUrl : null,
    // Powered-by badge hidden when plan allows branding removal
    showPoweredBy: !canRemoveBranding,
  };

  return {
    siteId: site.id,
    site: siteConfig,
    posts: postList,
    branding,
    features: {
      newsletter: hasFeature(planId, "newsletter"),
      requests: hasFeature(planId, "requests"),
      bookmarks: hasFeature(planId, "bookmarks"),
    },
  };
}

// ─── Demo data fallback ─────────────────────────────────────────────

const PLATFORM_URLS: Record<Platform, (handle: string, id: string) => string> = {
  instagram: (handle, id) => `https://www.instagram.com/p/${id}/`,
  tiktok: (handle, id) => `https://www.tiktok.com/@${handle}/video/${id}`,
  youtube: (handle, id) => `https://www.youtube.com/watch?v=${id}`,
};

const DEMO_PLATFORMS: PlatformConnection[] = [
  {
    id: "pc-1", platform: "instagram", handle: "demo_creator", displayName: "Demo Creator",
    avatarUrl: null, followerCount: 48200, postCount: 14, isConnected: true,
    lastSyncAt: "2026-04-12T10:00:00Z", syncStatus: "completed",
  },
  {
    id: "pc-2", platform: "tiktok", handle: "demo_creator", displayName: "Demo Creator",
    avatarUrl: null, followerCount: 125000, postCount: 8, isConnected: true,
    lastSyncAt: "2026-04-12T10:05:00Z", syncStatus: "completed",
  },
  {
    id: "pc-3", platform: "youtube", handle: "DemoCreator", displayName: "Demo Creator",
    avatarUrl: null, followerCount: 12400, postCount: 6, isConnected: true,
    lastSyncAt: "2026-04-11T18:00:00Z", syncStatus: "completed",
  },
];

const PLATFORM_SEQUENCE: Platform[] = [
  "instagram", "tiktok", "instagram", "youtube",
  "tiktok", "instagram", "instagram", "tiktok",
  "youtube", "instagram", "tiktok", "instagram",
  "instagram", "youtube", "tiktok", "instagram",
  "tiktok", "instagram", "youtube", "instagram",
  "tiktok", "instagram", "instagram", "youtube",
];

function getDemoSiteData(tenantSlug: string): {
  siteId: string;
  site: SiteConfig;
  posts: SitePost[];
  branding: SiteBranding;
  features: { newsletter: boolean; requests: boolean; bookmarks: boolean };
} {
  const name = tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1);

  const demoSite: SiteConfig = {
    slug: tenantSlug,
    displayName: `${name} Directory`,
    bio: "Content archive with transcriptions, references, and more.",
    avatarUrl: null,
    handle: `@${tenantSlug}`,
    platform: "instagram",
    accentColor: "#000000",
    categories: ["Business", "Economics", "Current Affairs"],
    platforms: DEMO_PLATFORMS,
  };

  const demoPosts: SitePost[] = Array.from({ length: 24 }, (_, i) => {
    const categories = demoSite.categories;
    const category = categories[i % categories.length];
    const platform = PLATFORM_SEQUENCE[i % PLATFORM_SEQUENCE.length];
    const handle = platform === "youtube" ? "DemoCreator" : tenantSlug;
    const refs: Reference[] =
      i % 3 === 0
        ? [{ kind: "youtube" as const, title: `Related video about ${category}`, videoId: "dQw4w9WgXcQ", note: "Example Channel" }]
        : [];

    return {
      id: `demo-${i}`,
      shortcode: `post-${i + 1}`,
      type: i % 4 === 0 ? "carousel" : i % 2 === 0 ? "image" : "video",
      caption: `This is a demo post about ${category.toLowerCase()}. In a real directory, this would contain the actual caption from your ${platform} post with full text search support.`,
      title: `Demo Post ${i + 1}: ${category}`,
      category,
      platform,
      takenAt: new Date(Date.UTC(2026, 3, 13) - i * 86400000).toISOString(),
      mediaUrl: null,
      thumbUrl: null,
      numSlides: i % 4 === 0 ? 3 : 0,
      slides: null,
      transcript: i % 2 !== 0 ? "This is a demo transcript. In production, this would be the full AI-generated transcription of the video content." : null,
      platformUrl: PLATFORM_URLS[platform](handle, `demo${i}`),
      references: refs,
    };
  });

  return {
    siteId: tenantSlug,
    site: demoSite,
    posts: demoPosts,
    branding: { customBrandName: null, customBrandUrl: null, showPoweredBy: true },
    features: { newsletter: true, requests: true, bookmarks: true },
  };
}
