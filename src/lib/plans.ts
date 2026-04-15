/**
 * Plan configuration — defines what each tier can access.
 * In production, the user's plan comes from the DB via auth context.
 */

export type PlanId = "free" | "creator" | "pro" | "agency";

export type FeatureKey =
  | "analytics_basic"
  | "analytics_full"
  | "analytics_ai_insights"
  | "newsletter"
  | "requests"
  | "bookmarks"
  | "custom_domain"
  | "platforms_multi"
  | "multi_accounts_per_platform"
  | "references"
  | "transcription"
  | "auto_categorization"
  | "seo_meta"
  | "remove_branding"
  | "white_label"
  | "api_access"
  | "export_subscribers"
  | "unlimited_posts";

type PlatformLimits = {
  instagram: number; // max accounts per platform
  tiktok: number;
  youtube: number;
};

type PlanConfig = {
  id: PlanId;
  name: string;
  price: number; // monthly in dollars
  features: Set<FeatureKey>;
  postLimit: number; // 0 = unlimited
  siteLimit: number;
  platformLimit: number; // total platforms allowed
  accountsPerPlatform: PlatformLimits; // max accounts per platform type
};

const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    postLimit: 9,
    siteLimit: 1,
    platformLimit: 1,
    accountsPerPlatform: { instagram: 1, tiktok: 0, youtube: 0 },
    // Free includes auto-categorization (Claude, ~$0.0003/post) and
    // transcription (Deepgram, ~$0.002/post for a 30s reel). At the
    // 9-post cap that's ~$0.02 of Deepgram spend per free build —
    // acceptable acquisition cost vs. the UX win of shipping videos
    // that are searchable by what's actually SAID in them.
    features: new Set(["auto_categorization", "transcription"]),
  },
  creator: {
    id: "creator",
    name: "Creator",
    price: 19,
    postLimit: 100,
    siteLimit: 1,
    platformLimit: 3,
    accountsPerPlatform: { instagram: 1, tiktok: 1, youtube: 1 },
    features: new Set([
      "analytics_basic",
      "analytics_full",
      "newsletter",
      "requests",
      "bookmarks",
      "platforms_multi",
      "references",
      "transcription",
      "auto_categorization",
      "custom_domain",
    ]),
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 39,
    postLimit: 500,
    siteLimit: 1,
    platformLimit: 3,
    accountsPerPlatform: { instagram: 1, tiktok: 1, youtube: 1 },
    features: new Set([
      "analytics_basic",
      "analytics_full",
      "analytics_ai_insights",
      "newsletter",
      "requests",
      "bookmarks",
      "platforms_multi",
      "references",
      "transcription",
      "auto_categorization",
      "custom_domain",
      "seo_meta",
      "remove_branding",
      "export_subscribers",
    ]),
  },
  agency: {
    id: "agency",
    name: "Agency",
    price: 99,
    postLimit: 0,
    siteLimit: 10,
    platformLimit: 3,
    accountsPerPlatform: { instagram: 5, tiktok: 5, youtube: 5 },
    features: new Set([
      "analytics_basic",
      "analytics_full",
      "analytics_ai_insights",
      "newsletter",
      "requests",
      "bookmarks",
      "platforms_multi",
      "multi_accounts_per_platform",
      "references",
      "transcription",
      "auto_categorization",
      "custom_domain",
      "seo_meta",
      "remove_branding",
      "export_subscribers",
      "unlimited_posts",
      "white_label",
      "api_access",
    ]),
  },
};

export function getPlan(planId: PlanId): PlanConfig {
  return PLANS[planId];
}

export function hasFeature(planId: PlanId, feature: FeatureKey): boolean {
  return PLANS[planId].features.has(feature);
}

import type { Platform } from "@/lib/types";
export type { Platform };

/** Check if the user can add another account for a specific platform */
export function canAddPlatformAccount(
  planId: PlanId,
  platform: Platform,
  currentCount: number,
): boolean {
  const limit = PLANS[planId].accountsPerPlatform[platform];
  return currentCount < limit;
}

/** Get the per-platform account limit */
export function getPlatformLimit(planId: PlanId, platform: Platform): number {
  return PLANS[planId].accountsPerPlatform[platform];
}

/** Get the plan needed to add more accounts on a platform */
export function requiredPlanForPlatform(platform: Platform, desiredCount: number): PlanConfig {
  const order: PlanId[] = ["free", "creator", "pro", "agency"];
  for (const id of order) {
    if (PLANS[id].accountsPerPlatform[platform] >= desiredCount) return PLANS[id];
  }
  return PLANS.agency;
}

/** Returns the cheapest plan that includes the given feature */
export function requiredPlanFor(feature: FeatureKey): PlanConfig {
  const order: PlanId[] = ["free", "creator", "pro", "agency"];
  for (const id of order) {
    if (PLANS[id].features.has(feature)) return PLANS[id];
  }
  return PLANS.agency;
}

/** Upgrade prompts — feature-specific messaging */
export const UPGRADE_PROMPTS: Record<FeatureKey, { title: string; desc: string; benefit: string }> = {
  analytics_basic: { title: "Analytics", desc: "See how visitors interact with your directory.", benefit: "Available on Creator and up" },
  analytics_full: { title: "Full Analytics", desc: "Detailed charts, top posts, search terms, heatmaps, and more.", benefit: "See exactly what your audience wants" },
  analytics_ai_insights: { title: "AI Insights", desc: "Get AI-powered recommendations on what content to create next.", benefit: "Let AI guide your content strategy" },
  newsletter: { title: "Email Newsletter", desc: "Build a subscriber list and send automated digest emails.", benefit: "Own your audience — not the algorithm" },
  requests: { title: "Content Requests", desc: "Let visitors vote on topics they want you to cover.", benefit: "Never run out of content ideas" },
  bookmarks: { title: "Visitor Collections", desc: "Visitors can save and organize your posts into personal collections.", benefit: "Increase engagement and return visits" },
  custom_domain: { title: "Custom Domain", desc: "Use your own domain like yourname.com instead of a subdomain.", benefit: "Look professional with your own brand" },
  platforms_multi: { title: "Multi-Platform", desc: "Connect Instagram, TikTok, and YouTube in one unified directory.", benefit: "All your content in one place" },
  multi_accounts_per_platform: { title: "Multiple Accounts Per Platform", desc: "Connect more than one Instagram, TikTok, or YouTube account to a single directory.", benefit: "Build multi-creator directories under one roof" },
  references: { title: "Smart References", desc: "We auto-find YouTube videos and articles related to your content.", benefit: "Add credibility with cited sources" },
  transcription: { title: "Video Transcription", desc: "AI-powered transcripts for every video — searchable, copyable, SEO-indexed.", benefit: "Make your video content discoverable in search" },
  auto_categorization: { title: "AI Auto-Categorization", desc: "Claude AI detects topics and assigns the perfect category to each post.", benefit: "Smart organization, zero manual tagging" },
  seo_meta: { title: "SEO & Open Graph", desc: "Custom meta tags, Open Graph previews, and Twitter cards for every post.", benefit: "Get found on Google and look great when shared" },
  remove_branding: { title: "Remove Branding", desc: "Remove the BuildMy.Directory badge from your site.", benefit: "A fully white-label experience" },
  white_label: { title: "White Label", desc: "Fully rebrand the platform for your clients.", benefit: "Run it as your own product" },
  api_access: { title: "API Access", desc: "Programmatic access to manage sites, posts, and subscribers.", benefit: "Integrate with your existing tools" },
  export_subscribers: { title: "Export Subscribers", desc: "Download your subscriber list as CSV at any time.", benefit: "Your data, your list, no lock-in" },
  unlimited_posts: { title: "Unlimited Posts", desc: "No cap on how many posts your directory can hold.", benefit: "Grow without limits" },
};
