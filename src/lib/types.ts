// ─── Shared types used across client & server ────────────────────────

export type Platform = "instagram" | "tiktok" | "youtube";

export type PostType = "video" | "image" | "carousel";

export type YouTubeRef = {
  kind: "youtube";
  title: string;
  videoId: string;
  note?: string;
};

export type ArticleRef = {
  kind: "article";
  title: string;
  url: string;
  note?: string;
};

export type Reference = YouTubeRef | ArticleRef;

export type SitePost = {
  id: string;
  shortcode: string;
  type: PostType;
  caption: string;
  title: string;
  category: string;
  platform: Platform; // which platform this post came from
  takenAt: string | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
  numSlides: number;
  slides: { type: string; src: string }[] | null;
  transcript: string | null;
  platformUrl: string | null;
  references: Reference[];
  isFeatured?: boolean;
};

export type PlatformConnection = {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  postCount: number;
  isConnected: boolean;
  lastSyncAt: string | null;
  syncStatus: "idle" | "syncing" | "completed" | "failed";
};

export type SiteConfig = {
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  handle: string;
  platform: Platform;
  accentColor: string;
  categories: string[];
  platforms: PlatformConnection[]; // all connected platforms
};

export type PipelineStep = "scrape" | "transcribe" | "categorize" | "references" | "complete";

export type PipelineStatus = "pending" | "running" | "completed" | "failed";

export type PipelineJob = {
  id: string;
  step: PipelineStep;
  status: PipelineStatus;
  progress: number;
  message: string | null;
  error: string | null;
};
