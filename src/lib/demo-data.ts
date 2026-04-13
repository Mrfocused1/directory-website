import type { SiteConfig, SitePost, Reference, Platform, PlatformConnection } from "@/lib/types";

/**
 * Shared demo data generator for tenant pages.
 * In production, this is replaced by DB queries.
 */

const PLATFORM_URLS: Record<Platform, (handle: string, id: string) => string> = {
  instagram: (handle, id) => `https://www.instagram.com/p/${id}/`,
  tiktok: (handle, id) => `https://www.tiktok.com/@${handle}/video/${id}`,
  youtube: (handle, id) => `https://www.youtube.com/watch?v=${id}`,
};

const DEMO_PLATFORMS: PlatformConnection[] = [
  {
    id: "pc-1",
    platform: "instagram",
    handle: "demo_creator",
    displayName: "Demo Creator",
    avatarUrl: null,
    followerCount: 48200,
    postCount: 14,
    isConnected: true,
    lastSyncAt: "2026-04-12T10:00:00Z",
    syncStatus: "completed",
  },
  {
    id: "pc-2",
    platform: "tiktok",
    handle: "demo_creator",
    displayName: "Demo Creator",
    avatarUrl: null,
    followerCount: 125000,
    postCount: 8,
    isConnected: true,
    lastSyncAt: "2026-04-12T10:05:00Z",
    syncStatus: "completed",
  },
  {
    id: "pc-3",
    platform: "youtube",
    handle: "DemoCreator",
    displayName: "Demo Creator",
    avatarUrl: null,
    followerCount: 12400,
    postCount: 6,
    isConnected: true,
    lastSyncAt: "2026-04-11T18:00:00Z",
    syncStatus: "completed",
  },
];

// Distribute posts across platforms
const PLATFORM_SEQUENCE: Platform[] = [
  "instagram", "tiktok", "instagram", "youtube",
  "tiktok", "instagram", "instagram", "tiktok",
  "youtube", "instagram", "tiktok", "instagram",
  "instagram", "youtube", "tiktok", "instagram",
  "tiktok", "instagram", "youtube", "instagram",
  "tiktok", "instagram", "instagram", "youtube",
];

export async function getSiteData(tenantSlug: string): Promise<{
  site: SiteConfig;
  posts: SitePost[];
} | null> {
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
        ? [
            {
              kind: "youtube" as const,
              title: `Related video about ${category}`,
              videoId: "dQw4w9WgXcQ",
              note: "Example Channel",
            },
          ]
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
      transcript:
        i % 2 !== 0
          ? "This is a demo transcript. In production, this would be the full AI-generated transcription of the video content."
          : null,
      platformUrl: PLATFORM_URLS[platform](handle, `demo${i}`),
      references: refs,
    };
  });

  return { site: demoSite, posts: demoPosts };
}
