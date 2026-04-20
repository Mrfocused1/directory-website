import { db } from "@/db";
import {
  sites,
  posts,
  references,
  platformConnections,
  users,
  customDomains,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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
  features: { newsletter: boolean; bookmarks: boolean; tts: boolean };
} | null> {
  if (db) {
    return getSiteDataFromDB(tenantSlug);
  }
  // Fallback: generate demo data when DB is unavailable
  if (tenantSlug === "nischa") return getNischaDemoData();
  return getDemoSiteData(tenantSlug);
}

async function getSiteDataFromDB(tenantSlug: string): Promise<{
  siteId: string;
  site: SiteConfig;
  posts: SitePost[];
  branding: SiteBranding;
  features: { newsletter: boolean; bookmarks: boolean; tts: boolean };
} | null> {
  // Primary lookup: by slug (buildmy.directory/<slug>).
  let site = await db!.query.sites.findFirst({
    where: eq(sites.slug, tenantSlug),
  });

  // Fallback lookup: treat the input as a custom domain. The proxy
  // rewrites incoming custom-domain requests to `/<hostname>`, so
  // when the slug miss happens we check the customDomains table for
  // an active mapping and resolve to the owning site.
  if (!site && tenantSlug.includes(".")) {
    const host = tenantSlug.toLowerCase().replace(/^www\./, "");
    const mapping = await db!
      .select({ siteId: customDomains.siteId, status: customDomains.status })
      .from(customDomains)
      .where(eq(customDomains.domain, host))
      .limit(1);
    if (mapping[0] && (mapping[0].status === "active" || mapping[0].status === "verifying")) {
      site = await db!.query.sites.findFirst({
        where: eq(sites.id, mapping[0].siteId),
      });
    }
  }

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
  // Hard-cap at 2000: agency post_limit is 2000; anything past that is
  // a data accident (import loop, webhook replay). Every page render
  // ships the full post list to the client so unbounded here = OOM
  // and pool starvation.
  const sitePosts = await db!.query.posts.findMany({
    where: and(eq(posts.siteId, site.id), eq(posts.isVisible, true)),
    orderBy: (posts, { desc, asc }) => [
      desc(posts.isFeatured),
      asc(posts.sortOrder),
      desc(posts.takenAt),
    ],
    limit: 2000,
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
      summary: p.summary ?? null,
      transcript: p.transcript,
      transcriptSegments: p.transcriptSegments ?? null,
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
  const validPlans = ["creator", "pro", "agency", "free"];
  const planId = (validPlans.includes(owner?.plan as string) ? owner!.plan : "creator") as PlanId;
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
      bookmarks: hasFeature(planId, "bookmarks"),
      tts: hasFeature(planId, "tts"),
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
  features: { newsletter: boolean; bookmarks: boolean; tts: boolean };
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
      summary: null,
      transcript: i % 2 !== 0 ? "This is a demo transcript. In production, this would be the full AI-generated transcription of the video content." : null,
      transcriptSegments: null,
      platformUrl: PLATFORM_URLS[platform](handle, `demo${i}`),
      references: refs,
    };
  });

  return {
    siteId: tenantSlug,
    site: demoSite,
    posts: demoPosts,
    branding: { customBrandName: null, customBrandUrl: null, showPoweredBy: true },
    features: { newsletter: true, bookmarks: true, tts: true },
  };
}

// ─── @nischa.me demo ────────────────────────────────────────────────
function getNischaDemoData(): {
  siteId: string;
  site: SiteConfig;
  posts: SitePost[];
  branding: SiteBranding;
  features: { newsletter: boolean; bookmarks: boolean; tts: boolean };
} {
  const site: SiteConfig = {
    slug: "nischa",
    displayName: "Nischa Shah",
    bio: "Life is complicated… personal finance doesn't have to be. Ex-investment banker turned creator.",
    avatarUrl: null,
    handle: "@nischa.me",
    platform: "instagram",
    accentColor: "#1a1a2e",
    categories: ["Saving", "Investing", "Budgeting", "Mindset"],
    platforms: [{ id: "ig", platform: "instagram" as Platform, handle: "nischa.me", displayName: "Nischa Shah", avatarUrl: null, postCount: 9, followerCount: 568000, isConnected: true, lastSyncAt: new Date().toISOString(), syncStatus: "idle" as const }],
  };

  const nischaPosts: SitePost[] = [
    {
      id: "n-1",
      shortcode: "17-habits-rich",
      type: "video",
      caption: "17 money habits that changed my life. These aren't complicated — they're just things most people never bother doing. Number 7 alone saved me £12K in one year. Save this and come back to it.",
      title: "17 Habits That Made Me Rich",
      category: "Saving",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 2, 10)).toISOString(),
      mediaUrl: "/demo-scrape-1.mp4",
      thumbUrl: "/demo-thumbs/nischa-1.jpg",
      numSlides: 0,
      slides: null,
      transcript: "Let me share the 17 habits that genuinely changed my financial life. Number one — automate your savings. The day I set up a standing order to move money the moment I got paid, everything changed. Number two — the 24-hour rule. Before buying anything over fifty pounds, wait 24 hours. You'd be amazed how often you don't actually want it.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "youtube", title: "17 Habits That Made Me Rich", videoId: "K8dTnlVWPZo", note: "Nischa's full YouTube breakdown — 2.8M views" },
        { kind: "article", title: "50 Money-Saving Habits That Actually Work", url: "https://www.nerdwallet.com/article/finance/money-saving-tips", note: "NerdWallet" },
      ],
    },
    {
      id: "n-2",
      shortcode: "65-25-10-rule",
      type: "video",
      caption: "Forget the 50/30/20 rule. Here's my updated version that actually works in 2026. The 65/25/10 rule — and why it's better for most people right now.",
      title: "The 65/25/10 Budget Rule Explained",
      category: "Budgeting",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 2, 8)).toISOString(),
      mediaUrl: "/demo-scrape-2.mp4",
      thumbUrl: "/demo-thumbs/nischa-2.jpg",
      numSlides: 0,
      slides: null,
      transcript: "Everyone talks about the 50/30/20 rule but honestly, in today's economy, it doesn't work for most people. Here's what I use instead — the 65/25/10 rule. 65 percent goes to necessities, 25 percent to savings and investments, and 10 percent to fun money. The reason this works better is because it acknowledges that living costs have gone up.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "article", title: "The 65/20/15 Rule: A Modern Budgeting Framework", url: "https://finance.yahoo.com/news/6-ways-change-finances-6-220009483.html", note: "Yahoo Finance" },
        { kind: "youtube", title: "The 50/30/20 Rule Is Dead — Do This Instead", videoId: "HQzoZfc3GwQ", note: "Nischa on YouTube" },
      ],
    },
    {
      id: "n-3",
      shortcode: "first-1000-invested",
      type: "video",
      caption: "How to invest your first £1,000. Step by step, no jargon, no gatekeeping. This is exactly what I'd do if I was starting from zero today.",
      title: "How to Invest Your First £1,000",
      category: "Investing",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 2, 5)).toISOString(),
      mediaUrl: "/demo-scrape-3.mp4",
      thumbUrl: "/demo-thumbs/nischa-3.jpg",
      numSlides: 0,
      slides: null,
      transcript: "If you have one thousand pounds and you want to start investing, here's exactly what I'd do. Step one — open a stocks and shares ISA. This is a tax-free wrapper, meaning any gains you make inside it are completely tax free. Step two — pick a global index fund. Something like Vanguard FTSE Global All Cap. You're instantly diversified across thousands of companies worldwide.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "article", title: "How to Start Investing in Index Funds", url: "https://www.investopedia.com/articles/investing/090215/index-fund-investopedia.asp", note: "Investopedia" },
        { kind: "youtube", title: "Investing for Beginners — How I'd Invest £1000", videoId: "gFQNPmLKj1k", note: "Nischa on YouTube" },
        { kind: "article", title: "Best Stocks & Shares ISAs 2026", url: "https://www.moneysavingexpert.com/savings/stocks-shares-isas/", note: "MoneySavingExpert" },
      ],
    },
    {
      id: "n-4",
      shortcode: "mind-hacks-save",
      type: "video",
      caption: "5 mind hacks I used to save six figures. These aren't tips — they're psychological shifts that rewire how you think about money.",
      title: "5 Mind Hacks to Save More Money",
      category: "Mindset",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 2, 2)).toISOString(),
      mediaUrl: "/demo-scrape-4.mp4",
      thumbUrl: "/demo-thumbs/nischa-4.jpg",
      numSlides: 0,
      slides: null,
      transcript: "The first hack is what I call the cost-per-use calculation. Before buying something, divide the price by how many times you'll realistically use it. A hundred pound jacket you wear twice costs fifty pounds per wear. A thirty pound jacket you wear fifty times costs sixty pence per wear. Suddenly expensive things look cheap and cheap things look expensive.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "article", title: "5 Mind Hacks To Save More Money — Nischa Shah", url: "https://finance.yahoo.com/news/money-expert-nischa-5-mind-170155614.html", note: "Yahoo Finance" },
        { kind: "article", title: "The Psychology of Saving Money", url: "https://www.psychologytoday.com/us/blog/the-science-behind-behavior/202001/the-psychology-saving", note: "Psychology Today" },
      ],
    },
    {
      id: "n-5",
      shortcode: "house-lie",
      type: "video",
      caption: "They're lying to you about buying a house. Here's the truth nobody in finance wants to tell you — and what I'm doing with my money instead.",
      title: "The Truth About Buying a House",
      category: "Investing",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 1, 28)).toISOString(),
      mediaUrl: "/demo-scrape-5.mp4",
      thumbUrl: "/demo-thumbs/nischa-5.jpg",
      numSlides: 0,
      slides: null,
      transcript: "Everyone tells you to buy a house as soon as possible. Your parents, your friends, random people on the internet. But here's what they're not telling you. When you factor in mortgage interest, stamp duty, maintenance costs, insurance, and opportunity cost of your deposit — renting and investing the difference often comes out ahead over 10 years.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "youtube", title: "They're Lying to You About Buying a House!", videoId: "Uwl3-jBNEd4", note: "Nischa on YouTube — Diary of a CEO appearance" },
        { kind: "article", title: "Renting vs Buying: The Maths Nobody Shows You", url: "https://www.ft.com/content/rent-vs-buy-calculator", note: "Financial Times" },
      ],
    },
    {
      id: "n-6",
      shortcode: "passive-income-7",
      type: "video",
      caption: "7 passive income ideas that actually work in 2026. I've tried all of them — here's what made money and what was a waste of time.",
      title: "7 Passive Income Ideas That Actually Work",
      category: "Investing",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 1, 24)).toISOString(),
      mediaUrl: "/demo-scrape-6.mp4",
      thumbUrl: "/demo-thumbs/nischa-6.jpg",
      numSlides: 0,
      slides: null,
      transcript: "Passive income idea number one — dividend ETFs. I put money into Vanguard's High Dividend Yield ETF and it pays me quarterly without me doing anything. Number two — a high interest savings account. Boring? Yes. Passive? Absolutely. I'm earning over five percent right now doing literally nothing.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "youtube", title: "7 Passive Income Ideas — How I Make $200K/year", videoId: "M5y69v1RbU0", note: "Nischa on YouTube" },
        { kind: "article", title: "Best Passive Income Ideas for 2026", url: "https://www.bankrate.com/investing/passive-income-ideas/", note: "Bankrate" },
      ],
    },
    {
      id: "n-7",
      shortcode: "spending-tracker",
      type: "carousel",
      caption: "How I track every penny I spend — and why it changed everything. My free spending tracker template is in my bio. It takes 5 minutes a week.",
      title: "My Free Spending Tracker System",
      category: "Budgeting",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 1, 20)).toISOString(),
      mediaUrl: null,
      thumbUrl: "/demo-thumbs/nischa-7.jpg",
      numSlides: 5,
      slides: null,
      transcript: null,
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "article", title: "How to Track Your Spending Effectively", url: "https://www.ramseysolutions.com/budgeting/how-to-track-spending", note: "Ramsey Solutions" },
      ],
    },
    {
      id: "n-8",
      shortcode: "quit-banking",
      type: "video",
      caption: "I quit my £100K+ investment banking job. Here's what happened next — and why I'd do it again in a heartbeat.",
      title: "Why I Quit Investment Banking",
      category: "Mindset",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 1, 15)).toISOString(),
      mediaUrl: "/hero-demo.mp4",
      thumbUrl: "/demo-thumbs/nischa-8.jpg",
      numSlides: 0,
      slides: null,
      transcript: "I was 28 years old making over six figures in investment banking. On paper my life looked perfect. But I was working 80 hour weeks, I had no time for myself, and I realised I was building someone else's dream. The day I handed in my resignation was terrifying but also the most free I've ever felt.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "article", title: "An Investment Banker Quit to Become a YouTuber — Now Makes Over $1M", url: "https://www.cnbc.com/2024/07/10/investment-banker-who-quit-to-become-a-youtuber-made-over-1-million.html", note: "CNBC" },
        { kind: "youtube", title: "How to Be Financially Free — Nischa on Diary of a CEO", videoId: "Uwl3-jBNEd4", note: "Steven Bartlett podcast" },
      ],
    },
    {
      id: "n-9",
      shortcode: "emergency-fund",
      type: "video",
      caption: "How much should your emergency fund actually be? The 3-6 months rule is outdated. Here's what I recommend instead based on your actual situation.",
      title: "How Big Should Your Emergency Fund Be?",
      category: "Saving",
      platform: "instagram" as Platform,
      takenAt: new Date(Date.UTC(2026, 1, 10)).toISOString(),
      mediaUrl: "/hero-demo-fitness-new.mp4",
      thumbUrl: "/demo-thumbs/nischa-9.jpg",
      numSlides: 0,
      slides: null,
      transcript: "Everyone says save three to six months of expenses as an emergency fund. But that's way too vague. Here's how I think about it. If you're employed with a stable job, three months is fine. If you're self-employed or freelance, aim for six to nine months. If you have dependents, add two more months on top. And keep it in a high-interest easy-access savings account — not invested.",
      summary: null,
      transcriptSegments: null,
      platformUrl: null,
      references: [
        { kind: "article", title: "How Much Emergency Fund Do I Need?", url: "https://www.moneysavingexpert.com/savings/emergency-fund/", note: "MoneySavingExpert" },
        { kind: "article", title: "Emergency Fund: What It Is and How to Build One", url: "https://www.investopedia.com/terms/e/emergency_fund.asp", note: "Investopedia" },
      ],
    },
  ];

  return {
    siteId: "nischa",
    site,
    posts: nischaPosts,
    branding: { customBrandName: null, customBrandUrl: null, showPoweredBy: true },
    features: { newsletter: false, bookmarks: false, tts: false },
  };
}
