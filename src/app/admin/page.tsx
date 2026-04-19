import { db } from "@/db";
import {
  users,
  sites,
  posts,
  pageViews,
  pipelineJobs,
  subscribers,
} from "@/db/schema";
import { sql, eq, gt, and, count } from "drizzle-orm";
import StatTile from "./_components/StatTile";
import PageShell from "./_components/PageShell";

// 60-second segment cache so repeated /admin loads don't re-hit the DB
// for every metric. Aggregates change slowly enough that this is safe.
export const revalidate = 60;

async function loadKpis() {
  if (!db) return null;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    [totalUsers],
    [totalSites],
    [publishedSites],
    [postsLast24],
    [viewsLast24],
    [activeSubscribers],
    [failedJobsLast24],
    planRows,
  ] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(sites),
    db.select({ n: count() }).from(sites).where(eq(sites.isPublished, true)),
    db.select({ n: count() }).from(posts).where(gt(posts.createdAt, yesterday)),
    db.select({ n: count() }).from(pageViews).where(gt(pageViews.createdAt, yesterday)),
    db
      .select({ n: count() })
      .from(subscribers)
      .where(and(eq(subscribers.isActive, true), eq(subscribers.isVerified, true))),
    db
      .select({ n: count() })
      .from(pipelineJobs)
      .where(and(gt(pipelineJobs.createdAt, yesterday), eq(pipelineJobs.status, "failed"))),
    db
      .select({ plan: users.plan, n: count() })
      .from(users)
      .groupBy(users.plan),
  ]);

  return {
    totalUsers: totalUsers.n,
    totalSites: totalSites.n,
    publishedSites: publishedSites.n,
    postsLast24: postsLast24.n,
    viewsLast24: viewsLast24.n,
    activeSubscribers: activeSubscribers.n,
    failedJobsLast24: failedJobsLast24.n,
    planRows,
  };
}

async function loadRecentSignups() {
  if (!db) return [];
  return db
    .select({
      email: users.email,
      plan: users.plan,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(sql`${users.createdAt} desc`)
    .limit(8);
}

async function loadRecentSites() {
  if (!db) return [];
  return db
    .select({
      slug: sites.slug,
      handle: sites.handle,
      isPublished: sites.isPublished,
      createdAt: sites.createdAt,
      ownerEmail: users.email,
    })
    .from(sites)
    .innerJoin(users, eq(users.id, sites.userId))
    .orderBy(sql`${sites.createdAt} desc`)
    .limit(8);
}

export default async function AdminOverviewPage() {
  const [kpis, signups, recentSites] = await Promise.all([
    loadKpis(),
    loadRecentSignups(),
    loadRecentSites(),
  ]);

  if (!kpis) {
    return (
      <PageShell title="Overview">
        <div className="text-sm text-[color:var(--fg-subtle)]">
          Database not configured — connect DB to load metrics.
        </div>
      </PageShell>
    );
  }

  // Estimate of MRR using plan price × user count (no Stripe round-trip)
  const planPriceCents: Record<string, number> = {
    free: 0,
    creator: 1999, // £19.99 GBP
    pro: 3900,    // $39 USD
    agency: 9900, // $99 USD
  };
  const mrrCents = kpis.planRows.reduce(
    (sum, r) => sum + (planPriceCents[r.plan] ?? 0) * r.n,
    0,
  );
  const mrr = `$${(mrrCents / 100).toLocaleString()}`;

  return (
    <PageShell
      title="Overview"
      description="Read-only platform health snapshot. Cached for 60s."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatTile label="Users" value={kpis.totalUsers} />
        <StatTile label="MRR (estimated)" value={mrr} />
        <StatTile
          label="Sites"
          value={kpis.totalSites}
          hint={`${kpis.publishedSites} live`}
        />
        <StatTile
          label="Verified subscribers"
          value={kpis.activeSubscribers}
        />
        <StatTile
          label="Posts (24h)"
          value={kpis.postsLast24}
          tone={kpis.postsLast24 > 0 ? "good" : "default"}
        />
        <StatTile label="Page views (24h)" value={kpis.viewsLast24} />
        <StatTile
          label="Failed jobs (24h)"
          value={kpis.failedJobsLast24}
          tone={kpis.failedJobsLast24 > 0 ? "bad" : "good"}
        />
        <StatTile
          label="Plans"
          value={kpis.planRows.map((r) => `${r.n} ${r.plan}`).join(" · ")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-bold mb-3">Recent signups</h2>
          <ul className="bg-white border border-[color:var(--border)] rounded-xl divide-y divide-[color:var(--border)]">
            {signups.length === 0 ? (
              <li className="p-4 text-sm text-[color:var(--fg-subtle)]">No users yet.</li>
            ) : (
              signups.map((u) => (
                <li
                  key={u.email}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-semibold truncate">{u.email}</span>
                  <span className="text-xs text-[color:var(--fg-subtle)] shrink-0">
                    {u.plan} · {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-bold mb-3">Recent sites</h2>
          <ul className="bg-white border border-[color:var(--border)] rounded-xl divide-y divide-[color:var(--border)]">
            {recentSites.length === 0 ? (
              <li className="p-4 text-sm text-[color:var(--fg-subtle)]">No sites yet.</li>
            ) : (
              recentSites.map((s) => (
                <li key={s.slug} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href={`/${s.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold truncate hover:underline"
                    >
                      {s.slug}
                    </a>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        s.isPublished
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {s.isPublished ? "Live" : "Draft"}
                    </span>
                  </div>
                  <div className="text-[11px] text-[color:var(--fg-subtle)] flex items-center gap-2 mt-0.5">
                    <span>@{s.handle}</span>
                    <span>·</span>
                    <span className="truncate">{s.ownerEmail}</span>
                    <span>·</span>
                    <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
