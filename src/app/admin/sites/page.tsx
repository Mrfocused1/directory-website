import { db } from "@/db";
import { sites, users, posts, pageViews, pipelineJobs } from "@/db/schema";
import { sql, eq, ilike, or, and, gt } from "drizzle-orm";
import PageShell from "../_components/PageShell";
import DataTable, { type Column } from "../_components/DataTable";

export const revalidate = 60;

type Row = {
  id: string;
  slug: string;
  handle: string;
  platform: string;
  isPublished: boolean;
  ownerEmail: string;
  ownerPlan: string;
  postCount: number;
  views7d: number;
  failedJobs24h: number;
  createdAt: Date;
  lastSyncAt: Date | null;
};

async function loadSites(query: string): Promise<Row[]> {
  if (!db) return [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const q = query.trim();
  const where = q
    ? or(
        ilike(sites.slug, `%${q}%`),
        ilike(sites.handle, `%${q}%`),
        ilike(users.email, `%${q}%`),
      )
    : undefined;

  // One JOIN-heavy query so we don't N+1 across 4 stats per site
  const rows = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      handle: sites.handle,
      platform: sites.platform,
      isPublished: sites.isPublished,
      createdAt: sites.createdAt,
      lastSyncAt: sites.lastSyncAt,
      ownerEmail: users.email,
      ownerPlan: users.plan,
      postCount: sql<number>`cast((select count(*) from ${posts} where ${posts.siteId} = ${sites.id}) as int)`,
      views7d: sql<number>`cast((select count(*) from ${pageViews} where ${pageViews.siteId} = ${sites.id} and ${pageViews.createdAt} > ${sevenDaysAgo.toISOString()}) as int)`,
      failedJobs24h: sql<number>`cast((select count(*) from ${pipelineJobs} where ${pipelineJobs.siteId} = ${sites.id} and ${pipelineJobs.status} = 'failed' and ${pipelineJobs.createdAt} > ${yesterday.toISOString()}) as int)`,
    })
    .from(sites)
    .innerJoin(users, eq(users.id, sites.userId))
    .where(where)
    .orderBy(sql`${sites.createdAt} desc`)
    .limit(100);

  return rows;
}

const columns: Column<Row>[] = [
  {
    header: "Site",
    cell: (r) => (
      <div className="min-w-0">
        <a
          href={`/${r.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold hover:underline truncate block"
        >
          /{r.slug}
        </a>
        <div className="text-[11px] text-[color:var(--fg-subtle)] truncate">
          @{r.handle} · {r.platform}
        </div>
      </div>
    ),
  },
  {
    header: "Owner",
    cell: (r) => (
      <div className="min-w-0">
        <div className="text-sm truncate">{r.ownerEmail}</div>
        <div className="text-[11px] text-[color:var(--fg-subtle)]">{r.ownerPlan}</div>
      </div>
    ),
  },
  {
    header: "Status",
    cell: (r) => (
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          r.isPublished
            ? "bg-green-100 text-green-700"
            : "bg-yellow-100 text-yellow-700"
        }`}
      >
        {r.isPublished ? "Live" : "Draft"}
      </span>
    ),
  },
  { header: "Posts", cell: (r) => r.postCount, align: "right" },
  { header: "Views 7d", cell: (r) => r.views7d, align: "right" },
  {
    header: "Failures 24h",
    cell: (r) => (
      <span className={r.failedJobs24h > 0 ? "text-red-700 font-bold" : ""}>
        {r.failedJobs24h}
      </span>
    ),
    align: "right",
  },
  {
    header: "Last sync",
    cell: (r) =>
      r.lastSyncAt ? (
        <span className="text-xs">{new Date(r.lastSyncAt).toLocaleDateString()}</span>
      ) : (
        <span className="text-xs text-[color:var(--fg-subtle)]">—</span>
      ),
  },
  {
    header: "Created",
    cell: (r) => (
      <span className="text-xs text-[color:var(--fg-subtle)]">
        {new Date(r.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

export default async function AdminSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q || "";
  const rows = await loadSites(q);

  return (
    <PageShell
      title="Sites"
      description={`${rows.length} ${rows.length === 1 ? "site" : "sites"}${q ? ` matching "${q}"` : ""}, latest first (cap 100).`}
      actions={
        <form method="GET" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search slug, handle, owner email…"
            className="h-9 px-3 w-72 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />
          {q && (
            <a
              href="/admin/sites"
              className="h-9 px-3 inline-flex items-center text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            >
              Clear
            </a>
          )}
        </form>
      }
    >
      <DataTable columns={columns} rows={rows} empty={q ? "No sites match." : "No sites."} />
    </PageShell>
  );
}
