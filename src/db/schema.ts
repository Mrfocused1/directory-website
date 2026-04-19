import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  varchar,
  index,
  uniqueIndex,
  date,
  real,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  stripeCustomerId: text("stripe_customer_id"),
  // Default now creator; legacy rows may still have plan="free"
  // from before the free tier was retired. Those are handled
  // read-only in plans.ts.
  plan: varchar("plan", { length: 32 }).notNull().default("creator"), // creator | pro | agency | free (legacy)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Sites (one per influencer directory) ────────────────────────────
export const sites = pgTable(
  "sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 63 }).notNull(), // path: buildmy.directory/<slug>
    customDomain: text("custom_domain"),
    platform: varchar("platform", { length: 16 }).notNull().default("instagram"), // instagram | tiktok
    handle: varchar("handle", { length: 128 }).notNull(), // @username
    displayName: text("display_name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    accentColor: varchar("accent_color", { length: 7 }).default("#000000"),
    categories: jsonb("categories").$type<string[]>().default([]),
    isPublished: boolean("is_published").notNull().default(false),
    lastSyncAt: timestamp("last_sync_at"),
    // Newsletter settings — customise the sender identity for digest emails.
    // If unset, we fall back to the site displayName and the site owner's
    // auth email respectively.
    newsletterFromName: varchar("newsletter_from_name", { length: 64 }),
    newsletterReplyTo: varchar("newsletter_reply_to", { length: 320 }),
    // Custom sender email — lets the creator send subscriber emails from
    // their own address instead of hello@buildmy.directory.
    senderEmail: varchar("sender_email", { length: 320 }),
    senderVerified: boolean("sender_verified").default(false),
    senderVerificationToken: varchar("sender_verification_token", { length: 128 }),
    senderVerificationExpiry: timestamp("sender_verification_expiry"),
    // Custom sending domain (Option 2) — e.g. mail.creatordomain.com
    senderDomain: varchar("sender_domain", { length: 255 }),
    senderDomainVerified: boolean("sender_domain_verified").default(false),
    // White-label brand shown in the directory footer instead of
    // "Powered by BuildMy.Directory". Requires white_label feature (Agency).
    // Null + plan has remove_branding = hide the badge entirely.
    // Null + no remove_branding = show "Powered by BuildMy.Directory".
    whiteLabelBrand: varchar("white_label_brand", { length: 64 }),
    whiteLabelUrl: text("white_label_url"),
    // Public-directory grid layout — admin controls density of the
    // post grid from /dashboard/posts. Accepts 2 or 3 (mobile is
    // always 2 to preserve readability on small screens).
    gridColumns: integer("grid_columns").notNull().default(3),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sites_slug_idx").on(table.slug),
    index("sites_user_id_idx").on(table.userId),
    uniqueIndex("sites_custom_domain_idx").on(table.customDomain),
    index("sites_is_published_idx").on(table.isPublished),
  ],
);

// ─── Posts ────────────────────────────────────────────────────────────
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    shortcode: varchar("shortcode", { length: 64 }).notNull(),
    type: varchar("type", { length: 16 }).notNull().default("video"), // video | image | carousel
    caption: text("caption").notNull().default(""),
    title: text("title").notNull().default("Untitled"),
    category: varchar("category", { length: 64 }).notNull().default("Uncategorized"),
    takenAt: timestamp("taken_at"),
    mediaUrl: text("media_url"), // video or image URL
    thumbUrl: text("thumb_url"),
    numSlides: integer("num_slides").default(0),
    slides: jsonb("slides").$type<{ type: string; src: string }[]>(),
    transcript: text("transcript"),
    transcriptSegments: jsonb("transcript_segments").$type<
      { start: number; end: number; text: string }[]
    >(),
    platformUrl: text("platform_url"), // original IG/TT url
    summary: text("summary"), // AI-generated 2-3 bullet point summary
    isVisible: boolean("is_visible").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    // Manual ordering set by the creator from the dashboard. Lower = first.
    // Resolved as: isFeatured DESC, sortOrder ASC, takenAt DESC.
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("posts_site_id_idx").on(table.siteId),
    uniqueIndex("posts_site_shortcode_idx").on(table.siteId, table.shortcode),
    index("posts_featured_idx").on(table.siteId, table.isFeatured),
    index("posts_sort_idx").on(table.siteId, table.sortOrder),
    index("posts_created_at_idx").on(table.createdAt),
  ],
);

// ─── References ──────────────────────────────────────────────────────
export const references = pgTable(
  "references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull().default("article"), // article | youtube
    title: text("title").notNull(),
    url: text("url"), // for articles
    videoId: text("video_id"), // for youtube
    note: text("note"),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("references_post_id_idx").on(table.postId)],
);

// ─── Pipeline Jobs ───────────────────────────────────────────────────
export const pipelineJobs = pgTable(
  "pipeline_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    step: varchar("step", { length: 32 }).notNull(), // scrape | transcribe | categorize | references | complete
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | running | completed | failed
    progress: integer("progress").default(0), // 0-100
    message: text("message"),
    error: text("error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("pipeline_jobs_site_id_idx").on(table.siteId)],
);

// ─── Analytics: Page Views ───────────────────────────────────────────
export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    postShortcode: varchar("post_shortcode", { length: 64 }), // null = directory home
    path: text("path").notNull(),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    country: varchar("country", { length: 2 }),
    city: text("city"),
    device: varchar("device", { length: 16 }), // desktop | mobile | tablet
    browser: varchar("browser", { length: 32 }),
    sessionId: varchar("session_id", { length: 64 }),
    duration: integer("duration"), // seconds spent on page
    scrollDepth: integer("scroll_depth"), // percentage 0-100
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("page_views_site_id_idx").on(table.siteId),
    index("page_views_created_at_idx").on(table.createdAt),
    index("page_views_session_idx").on(table.sessionId),
  ],
);

// ─── Analytics: Post Clicks (opening a post modal) ───────────────────
export const postClicks = pgTable(
  "post_clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    postShortcode: varchar("post_shortcode", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }),
    referenceClicked: text("reference_clicked"), // if they clicked a reference from this post
    videoWatchTime: integer("video_watch_time"), // seconds watched
    videoDuration: integer("video_duration"), // total video length
    shared: boolean("shared").default(false), // did they share?
    sharePlatform: varchar("share_platform", { length: 16 }), // x | whatsapp | copy
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("post_clicks_site_id_idx").on(table.siteId),
    index("post_clicks_shortcode_idx").on(table.postShortcode),
    index("post_clicks_created_at_idx").on(table.createdAt),
  ],
);

// ─── Analytics: Search Events ────────────────────────────────────────
export const searchEvents = pgTable(
  "search_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    resultsCount: integer("results_count").notNull().default(0),
    clickedShortcode: varchar("clicked_shortcode", { length: 64 }), // did they click a result?
    sessionId: varchar("session_id", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("search_events_site_id_idx").on(table.siteId),
    index("search_events_created_at_idx").on(table.createdAt),
  ],
);

// ─── Analytics: Category Clicks ──────────────────────────────────────
export const categoryClicks = pgTable(
  "category_clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 64 }).notNull(),
    sessionId: varchar("session_id", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("category_clicks_site_id_idx").on(table.siteId),
    index("category_clicks_created_at_idx").on(table.createdAt),
  ],
);

// ─── Analytics: Daily Aggregated Stats ───────────────────────────────
export const dailyStats = pgTable(
  "daily_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalViews: integer("total_views").notNull().default(0),
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
    totalClicks: integer("total_clicks").notNull().default(0),
    totalSearches: integer("total_searches").notNull().default(0),
    totalShares: integer("total_shares").notNull().default(0),
    avgSessionDuration: real("avg_session_duration").default(0), // seconds
    avgScrollDepth: real("avg_scroll_depth").default(0), // percentage
    topPost: varchar("top_post", { length: 64 }), // most clicked shortcode
    topSearch: text("top_search"), // most searched term
    topReferrer: text("top_referrer"),
    deviceBreakdown: jsonb("device_breakdown").$type<Record<string, number>>(), // { desktop: 45, mobile: 55 }
    countryBreakdown: jsonb("country_breakdown").$type<Record<string, number>>(), // { US: 30, GB: 20 }
    referrerBreakdown: jsonb("referrer_breakdown").$type<Record<string, number>>(),
  },
  (table) => [
    uniqueIndex("daily_stats_site_date_idx").on(table.siteId, table.date),
  ],
);

// ─── Email Subscribers ───────────────────────────────────────────────
export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 128 }),
    categories: jsonb("categories").$type<string[]>().default([]), // empty = all categories
    frequency: varchar("frequency", { length: 16 }).notNull().default("weekly"), // weekly | daily | monthly
    isVerified: boolean("is_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull(),
    lastDigestAt: timestamp("last_digest_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("subscribers_site_id_idx").on(table.siteId),
    uniqueIndex("subscribers_site_email_idx").on(table.siteId, table.email),
    index("subscribers_active_idx").on(table.isActive),
  ],
);

// ─── Digest History ──────────────────────────────────────────────────
export const digestHistory = pgTable(
  "digest_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    postCount: integer("post_count").notNull().default(0),
    recipientCount: integer("recipient_count").notNull().default(0),
    openCount: integer("open_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [
    index("digest_history_site_id_idx").on(table.siteId),
  ],
);

// ─── Visitor Profiles (lightweight email-based auth for bookmarks) ───
export const visitorProfiles = pgTable(
  "visitor_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 128 }),
    avatarColor: varchar("avatar_color", { length: 7 }).notNull().default("#000000"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("visitor_profiles_site_email_idx").on(table.siteId, table.email),
  ],
);

// ─── Bookmark Collections ────────────────────────────────────────────
export const collections = pgTable(
  "collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitorProfiles.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    emoji: varchar("emoji", { length: 8 }).default(""),
    isDefault: boolean("is_default").notNull().default(false),
    // Public share token — set when the owner turns sharing on.
    // Null = private. Non-null = viewable at /d/[tenant]/c/[shareToken]
    shareToken: varchar("share_token", { length: 48 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("collections_visitor_id_idx").on(table.visitorId),
    index("collections_site_id_idx").on(table.siteId),
    uniqueIndex("collections_share_token_idx").on(table.shareToken),
  ],
);

// ─── Bookmarks ───────────────────────────────────────────────────────
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    postShortcode: varchar("post_shortcode", { length: 64 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("bookmarks_collection_id_idx").on(table.collectionId),
    uniqueIndex("bookmarks_collection_post_idx").on(table.collectionId, table.postShortcode),
  ],
);

// ─── Platform Connections (multi-platform support) ───────────────────
export const platformConnections = pgTable(
  "platform_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 16 }).notNull(), // instagram | tiktok | youtube
    handle: varchar("handle", { length: 128 }).notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    followerCount: integer("follower_count"),
    postCount: integer("post_count").default(0),
    isConnected: boolean("is_connected").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at"),
    syncStatus: varchar("sync_status", { length: 16 }).notNull().default("idle"), // idle | syncing | completed | failed
    syncError: text("sync_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("platform_connections_site_id_idx").on(table.siteId),
    uniqueIndex("platform_connections_site_platform_handle_idx").on(table.siteId, table.platform, table.handle),
  ],
);

// ─── Custom Domains ──────────────────────────────────────────────────
export const customDomains = pgTable(
  "custom_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 253 }).notNull(),
    type: varchar("type", { length: 16 }).notNull().default("external"), // external (BYO) | purchased (bought through us)
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | verifying | active | failed | expired
    verificationToken: varchar("verification_token", { length: 64 }).notNull(),
    dnsVerified: boolean("dns_verified").notNull().default(false),
    sslProvisioned: boolean("ssl_provisioned").notNull().default(false),
    // Purchase tracking (for domains bought through us)
    purchasePrice: integer("purchase_price"), // cents
    renewalPrice: integer("renewal_price"), // cents
    expiresAt: timestamp("expires_at"),
    registrar: varchar("registrar", { length: 32 }), // vercel
    registrarOrderId: text("registrar_order_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("custom_domains_site_id_idx").on(table.siteId),
    uniqueIndex("custom_domains_domain_idx").on(table.domain),
  ],
);

// ─── API Keys (Agency plan — programmatic access) ────────────────────
// Users on plans with `api_access` can generate keys to access their data
// via /api/v1/* endpoints. Keys are hashed at rest; we store a 8-char
// prefix for display (so users can identify which key is which).
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 64 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    keyHash: text("key_hash").notNull(), // sha256 hex of the full key
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_hash_idx").on(table.keyHash),
  ],
);

// ─── Admin Audit Log ─────────────────────────────────────────────────
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminEmail: varchar("admin_email", { length: 320 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    targetEmail: varchar("target_email", { length: 320 }),
    details: text("details"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_log_admin_email_idx").on(table.adminEmail),
    index("admin_audit_log_action_idx").on(table.action),
    index("admin_audit_log_created_at_idx").on(table.createdAt),
  ],
);

// ─── Stripe Webhook Events (idempotency tracking) ────────────────────
// Stripe can deliver the same webhook multiple times. We insert event.id
// before processing side effects; a unique-violation means we've already
// handled it and can return 200 immediately.
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(), // Stripe event ID (e.g., evt_xxx)
    type: varchar("type", { length: 64 }).notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
);
