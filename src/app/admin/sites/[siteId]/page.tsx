import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  sites,
  users,
  posts,
  pageViews,
  postClicks,
  searchEvents,
  categoryClicks,
  pipelineJobs,
  subscribers,
  digestHistory,
} from "@/db/schema";
import { eq, and, gte, desc, count, isNotNull, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import PageShell from "../../_components/PageShell";
import StatTile from "../../_components/StatTile";
import DataTable, { type Column } from "../../_components/DataTable";

// Admin drill-through is always fresh so we see the most recent
// activity, not a cached snapshot.
export const revalidate = 0;

type SiteDetail = {
  id: string;
  slug: string;
  handle: string;
  platform: string;
  isPublished: boolean;
  createdAt: Date;
  lastSyncAt: Date | null;
  displayName: string | null;
  bio: string | null;
  ownerEmail: string;
  ownerPlan: string;
  postCount: number;
};

async function loadSite(siteId: string): Promise<SiteDetail | null> {
  if (!db) return null;
  const [row] = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      handle: sites.handle,
      platform: sites.platform,
      isPublished: sites.isPublished,
      createdAt: sites.createdAt,
      lastSyncAt: sites.lastSyncAt,
      displayName: sites.displayName,
      bio: sites.bio,
      ownerEmail: users.email,
      ownerPlan: users.plan,
      postCount: sql<number>`cast((select count(*) from ${posts} where ${posts.siteId} = ${sites.id}) as int)`,
    })
    .from(sites)
    .innerJoin(users, eq(users.id, sites.userId))
    .where(eq(sites.id, siteId))
    .limit(1);
  return row || null;
}

async function loadAnalytics(siteId: string, days = 30) {
  if (!db) return null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    [viewsRow],
    uniqueRows,
    [clicksRow],
    [searchesRow],
    [sharesRow],
    topPosts,
    topSearches,
    topCategories,
    deviceRows,
    countryRows,
    referrerRows,
    recentFailures,
  ] = await Promise.all([
    db.select({ c: count() }).from(pageViews).where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, since))),
    db
      .select({ sessionId: pageViews.sessionId })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, since), isNotNull(pageViews.sessionId)))
      .groupBy(pageViews.sessionId),
    db.select({ c: count() }).from(postClicks).where(and(eq(postClicks.siteId, siteId), gte(postClicks.createdAt, since))),
    db.select({ c: count() }).from(searchEvents).where(and(eq(searchEvents.siteId, siteId), gte(searchEvents.createdAt, since))),
    db.select({ c: count() }).from(postClicks).where(and(eq(postClicks.siteId, siteId), eq(postClicks.shared, true), gte(postClicks.createdAt, since))),
    db
      .select({
        shortcode: postClicks.postShortcode,
        title: posts.title,
        clicks: count(postClicks.id),
      })
      .from(postClicks)
      .leftJoin(posts, and(eq(posts.siteId, postClicks.siteId), eq(posts.shortcode, postClicks.postShortcode)))
      .where(and(eq(postClicks.siteId, siteId), gte(postClicks.createdAt, since)))
      .groupBy(postClicks.postShortcode, posts.title)
      .orderBy(desc(count(postClicks.id)))
      .limit(10),
    db
      .select({ query: searchEvents.query, c: count() })
      .from(searchEvents)
      .where(and(eq(searchEvents.siteId, siteId), gte(searchEvents.createdAt, since)))
      .groupBy(searchEvents.query)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ category: categoryClicks.category, c: count() })
      .from(categoryClicks)
      .where(and(eq(categoryClicks.siteId, siteId), gte(categoryClicks.createdAt, since)))
      .groupBy(categoryClicks.category)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ device: pageViews.device, c: count() })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, since)))
      .groupBy(pageViews.device),
    db
      .select({ country: pageViews.country, c: count() })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, since)))
      .groupBy(pageViews.country)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ referrer: pageViews.referrer, c: count() })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, since)))
      .groupBy(pageViews.referrer)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        step: pipelineJobs.step,
        status: pipelineJobs.status,
        error: pipelineJobs.error,
        message: pipelineJobs.message,
        createdAt: pipelineJobs.createdAt,
      })
      .from(pipelineJobs)
      .where(eq(pipelineJobs.siteId, siteId))
      .orderBy(desc(pipelineJobs.createdAt))
      .limit(10),
  ]);

  const totalViews = viewsRow.c;
  const totalClicks = clicksRow.c;
  return {
    totalViews,
    uniqueVisitors: uniqueRows.length,
    totalClicks,
    totalSearches: searchesRow.c,
    totalShares: sharesRow.c,
    ctr: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0,
    topPosts: topPosts.map((p) => ({
      shortcode: p.shortcode,
      title: p.title || p.shortcode,
      clicks: p.clicks,
    })),
    topSearches: topSearches.map((s) => ({ query: s.query, count: s.c })),
    topCategories: topCategories.map((c) => ({ category: c.category, clicks: c.c })),
    devices: deviceRows.map((d) => ({ device: d.device || "unknown", count: d.c })),
    countries: countryRows.map((c) => ({ country: c.country || "unknown", count: c.c })),
    referrers: referrerRows.map((r) => {
      let source = "Direct";
      if (r.referrer) {
        try { source = new URL(r.referrer).hostname; } catch { source = r.referrer; }
      }
      return { source, visitors: r.c };
    }),
    recentFailures: recentFailures
      .filter((j) => j.status === "failed" || j.error)
      .slice(0, 5),
  };
}

async function loadSubscribers(siteId: string) {
  if (!db) return { rows: [], active: 0, verified: 0, recentDigests: [] };
  const [rows, [activeRow], [verifiedRow], recentDigests] = await Promise.all([
    db
      .select({
        email: subscribers.email,
        name: subscribers.name,
        frequency: subscribers.frequency,
        isVerified: subscribers.isVerified,
        isActive: subscribers.isActive,
        lastDigestAt: subscribers.lastDigestAt,
        createdAt: subscribers.createdAt,
      })
      .from(subscribers)
      .where(eq(subscribers.siteId, siteId))
      .orderBy(desc(subscribers.createdAt))
      .limit(200),
    db.select({ c: count() }).from(subscribers)
      .where(and(eq(subscribers.siteId, siteId), eq(subscribers.isActive, true))),
    db.select({ c: count() }).from(subscribers)
      .where(and(eq(subscribers.siteId, siteId), eq(subscribers.isVerified, true))),
    db
      .select({
        subject: digestHistory.subject,
        postCount: digestHistory.postCount,
        recipientCount: digestHistory.recipientCount,
        openCount: digestHistory.openCount,
        clickCount: digestHistory.clickCount,
        sentAt: digestHistory.sentAt,
      })
      .from(digestHistory)
      .where(eq(digestHistory.siteId, siteId))
      .orderBy(desc(digestHistory.sentAt))
      .limit(10),
  ]);
  return {
    rows,
    active: activeRow.c,
    verified: verifiedRow.c,
    recentDigests,
  };
}

type PostRow = { shortcode: string; title: string; clicks: number };
const postCols: Column<PostRow>[] = [
  { header: "Post", cell: (r) => <span className="text-sm font-medium truncate block max-w-[360px]">{r.title}</span> },
  { header: "Shortcode", cell: (r) => <code className="text-[11px] text-[color:var(--fg-subtle)]">{r.shortcode}</code> },
  { header: "Clicks", cell: (r) => r.clicks, align: "right" },
];

type SearchRow = { query: string; count: number };
const searchCols: Column<SearchRow>[] = [
  { header: "Query", cell: (r) => <span className="text-sm">{r.query}</span> },
  { header: "Count", cell: (r) => r.count, align: "right" },
];

type BreakdownRow = { label: string; count: number };
const breakdownCols: Column<BreakdownRow>[] = [
  { header: "Label", cell: (r) => <span className="text-sm">{r.label}</span> },
  { header: "Count", cell: (r) => r.count, align: "right" },
];

export default async function AdminSiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  await requireAdmin();
  const { siteId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    notFound();
  }
  const site = await loadSite(siteId);
  if (!site) notFound();

  const [analytics, subs] = await Promise.all([
    loadAnalytics(siteId, 30),
    loadSubscribers(siteId),
  ]);

  return (
    <PageShell
      title={`${site.displayName || site.slug}`}
      description={
        <span>
          <a
            href={`/${site.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:opacity-80"
          >
            /{site.slug}
          </a>
          {" · "}@{site.handle} on {site.platform}
          {" · owned by "}
          <span className="font-medium">{site.ownerEmail}</span>
          {" ("}{site.ownerPlan}{") · "}
          {site.postCount} posts · created {new Date(site.createdAt).toLocaleDateString()}
          {site.lastSyncAt ? ` · last synced ${new Date(site.lastSyncAt).toLocaleDateString()}` : ""}
        </span>
      }
      actions={
        <Link
          href="/admin/sites"
          className="h-9 px-3 inline-flex items-center text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
        >
          ← All sites
        </Link>
      }
    >
      {!analytics ? (
        <div className="text-sm text-[color:var(--fg-muted)]">No analytics available.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <StatTile label="Views (30d)" value={analytics.totalViews.toLocaleString()} />
            <StatTile label="Unique visitors" value={analytics.uniqueVisitors.toLocaleString()} />
            <StatTile label="Post clicks" value={analytics.totalClicks.toLocaleString()} />
            <StatTile label="Searches" value={analytics.totalSearches.toLocaleString()} />
            <StatTile label="Shares" value={analytics.totalShares.toLocaleString()} />
            <StatTile label="CTR" value={`${analytics.ctr}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <section>
              <h3 className="text-sm font-bold mb-2">Top posts (clicks)</h3>
              <DataTable
                columns={postCols}
                rows={analytics.topPosts}
                empty="No post-click data yet."
              />
            </section>
            <section>
              <h3 className="text-sm font-bold mb-2">Top searches</h3>
              <DataTable
                columns={searchCols}
                rows={analytics.topSearches}
                empty="No searches recorded."
              />
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <section>
              <h3 className="text-sm font-bold mb-2">Top categories</h3>
              <DataTable
                columns={breakdownCols}
                rows={analytics.topCategories.map((c) => ({ label: c.category, count: c.clicks }))}
                empty="—"
              />
            </section>
            <section>
              <h3 className="text-sm font-bold mb-2">Devices</h3>
              <DataTable
                columns={breakdownCols}
                rows={analytics.devices.map((d) => ({ label: d.device, count: d.count }))}
                empty="—"
              />
            </section>
            <section>
              <h3 className="text-sm font-bold mb-2">Top countries</h3>
              <DataTable
                columns={breakdownCols}
                rows={analytics.countries.map((c) => ({ label: c.country, count: c.count }))}
                empty="—"
              />
            </section>
          </div>

          <section className="mb-8">
            <h3 className="text-sm font-bold mb-2">Referrers</h3>
            <DataTable
              columns={breakdownCols}
              rows={analytics.referrers.map((r) => ({ label: r.source, count: r.visitors }))}
              empty="—"
            />
          </section>

          <section className="mb-8">
            <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
              <h3 className="text-sm font-bold">
                Subscribers{" "}
                <span className="text-[color:var(--fg-muted)] font-normal">
                  · {subs.rows.length} total · {subs.active} active · {subs.verified} verified
                </span>
              </h3>
              {subs.rows.length > 0 && (
                <a
                  href={`/api/admin/subscribers/export?siteId=${siteId}`}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-black text-white rounded-lg hover:bg-black/80 transition"
                  title="Download CSV of all subscribers"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Export CSV
                </a>
              )}
            </div>
            {subs.rows.length === 0 ? (
              <div className="text-sm text-[color:var(--fg-muted)] bg-white border border-[color:var(--border)] rounded-lg px-4 py-6 text-center">
                No subscribers yet.
              </div>
            ) : (
              <DataTable
                columns={[
                  {
                    header: "Email",
                    cell: (r: (typeof subs.rows)[number]) => (
                      <div className="min-w-0">
                        <div className="text-sm truncate">{r.email}</div>
                        {r.name && (
                          <div className="text-[11px] text-[color:var(--fg-subtle)] truncate">{r.name}</div>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: "Freq",
                    cell: (r: (typeof subs.rows)[number]) => (
                      <span className="text-xs">{r.frequency}</span>
                    ),
                  },
                  {
                    header: "State",
                    cell: (r: (typeof subs.rows)[number]) => {
                      if (!r.isVerified) {
                        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Unverified</span>;
                      }
                      if (!r.isActive) {
                        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">Unsubscribed</span>;
                      }
                      return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700">Active</span>;
                    },
                  },
                  {
                    header: "Last digest",
                    cell: (r: (typeof subs.rows)[number]) =>
                      r.lastDigestAt ? (
                        <span className="text-xs">{new Date(r.lastDigestAt).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-xs text-[color:var(--fg-subtle)]">—</span>
                      ),
                  },
                  {
                    header: "Joined",
                    cell: (r: (typeof subs.rows)[number]) => (
                      <span className="text-xs text-[color:var(--fg-subtle)]">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    ),
                  },
                ]}
                rows={subs.rows}
                empty="No subscribers."
              />
            )}
          </section>

          {subs.recentDigests.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-bold mb-2">Recent digests</h3>
              <DataTable
                columns={[
                  {
                    header: "Subject",
                    cell: (d: (typeof subs.recentDigests)[number]) => (
                      <span className="text-sm truncate block max-w-[360px]">{d.subject}</span>
                    ),
                  },
                  { header: "Posts", cell: (d: (typeof subs.recentDigests)[number]) => d.postCount, align: "right" },
                  { header: "Sent to", cell: (d: (typeof subs.recentDigests)[number]) => d.recipientCount, align: "right" },
                  { header: "Opens", cell: (d: (typeof subs.recentDigests)[number]) => d.openCount, align: "right" },
                  { header: "Clicks", cell: (d: (typeof subs.recentDigests)[number]) => d.clickCount, align: "right" },
                  {
                    header: "Sent",
                    cell: (d: (typeof subs.recentDigests)[number]) => (
                      <span className="text-xs text-[color:var(--fg-subtle)]">
                        {new Date(d.sentAt).toLocaleDateString()}
                      </span>
                    ),
                  },
                ]}
                rows={subs.recentDigests}
                empty="No digests sent."
              />
            </section>
          )}

          {analytics.recentFailures.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-bold mb-2 text-red-700">
                Recent pipeline failures
              </h3>
              <ul className="space-y-2 text-xs">
                {analytics.recentFailures.map((j, i) => (
                  <li
                    key={i}
                    className="border border-red-200 bg-red-50 rounded-lg px-3 py-2"
                  >
                    <div className="font-semibold">
                      {j.step} — {j.status}
                    </div>
                    <div className="text-[color:var(--fg-muted)]">
                      {new Date(j.createdAt).toLocaleString()}
                    </div>
                    {j.error && <div className="mt-1 text-red-700">{j.error}</div>}
                    {j.message && !j.error && (
                      <div className="mt-1 text-[color:var(--fg-muted)]">{j.message}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
