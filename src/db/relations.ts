import { relations } from "drizzle-orm";
import {
  users,
  sites,
  posts,
  references,
  pipelineJobs,
  pageViews,
  postClicks,
  searchEvents,
  categoryClicks,
  dailyStats,
  subscribers,
  digestHistory,
  visitorProfiles,
  collections,
  bookmarks,
  platformConnections,
  customDomains,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  sites: many(sites),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  user: one(users, { fields: [sites.userId], references: [users.id] }),
  posts: many(posts),
  pipelineJobs: many(pipelineJobs),
  pageViews: many(pageViews),
  postClicks: many(postClicks),
  searchEvents: many(searchEvents),
  categoryClicks: many(categoryClicks),
  dailyStats: many(dailyStats),
  subscribers: many(subscribers),
  digestHistory: many(digestHistory),
  visitorProfiles: many(visitorProfiles),
  collections: many(collections),
  platformConnections: many(platformConnections),
  customDomains: many(customDomains),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  site: one(sites, { fields: [posts.siteId], references: [sites.id] }),
  references: many(references),
}));

export const referencesRelations = relations(references, ({ one }) => ({
  post: one(posts, { fields: [references.postId], references: [posts.id] }),
}));

export const pipelineJobsRelations = relations(pipelineJobs, ({ one }) => ({
  site: one(sites, { fields: [pipelineJobs.siteId], references: [sites.id] }),
}));

export const pageViewsRelations = relations(pageViews, ({ one }) => ({
  site: one(sites, { fields: [pageViews.siteId], references: [sites.id] }),
}));

export const postClicksRelations = relations(postClicks, ({ one }) => ({
  site: one(sites, { fields: [postClicks.siteId], references: [sites.id] }),
}));

export const searchEventsRelations = relations(searchEvents, ({ one }) => ({
  site: one(sites, { fields: [searchEvents.siteId], references: [sites.id] }),
}));

export const categoryClicksRelations = relations(categoryClicks, ({ one }) => ({
  site: one(sites, { fields: [categoryClicks.siteId], references: [sites.id] }),
}));

export const dailyStatsRelations = relations(dailyStats, ({ one }) => ({
  site: one(sites, { fields: [dailyStats.siteId], references: [sites.id] }),
}));

export const subscribersRelations = relations(subscribers, ({ one }) => ({
  site: one(sites, { fields: [subscribers.siteId], references: [sites.id] }),
}));

export const digestHistoryRelations = relations(digestHistory, ({ one }) => ({
  site: one(sites, { fields: [digestHistory.siteId], references: [sites.id] }),
}));

export const visitorProfilesRelations = relations(visitorProfiles, ({ one, many }) => ({
  site: one(sites, { fields: [visitorProfiles.siteId], references: [sites.id] }),
  collections: many(collections),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  visitor: one(visitorProfiles, { fields: [collections.visitorId], references: [visitorProfiles.id] }),
  site: one(sites, { fields: [collections.siteId], references: [sites.id] }),
  bookmarks: many(bookmarks),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  collection: one(collections, { fields: [bookmarks.collectionId], references: [collections.id] }),
}));

export const platformConnectionsRelations = relations(platformConnections, ({ one }) => ({
  site: one(sites, { fields: [platformConnections.siteId], references: [sites.id] }),
}));

export const customDomainsRelations = relations(customDomains, ({ one }) => ({
  site: one(sites, { fields: [customDomains.siteId], references: [sites.id] }),
}));
