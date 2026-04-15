import { db } from "@/db";
import { pipelineJobs, sites, users } from "@/db/schema";
import { sql, eq, gt, and } from "drizzle-orm";
import StatTile from "../_components/StatTile";
import PageShell from "../_components/PageShell";
import DataTable, { type Column } from "../_components/DataTable";

export const revalidate = 30;

type Row = {
  jobId: string;
  siteId: string;
  siteSlug: string;
  ownerEmail: string;
  step: string;
  status: string;
  progress: number;
  message: string | null;
  error: string | null;
  createdAt: Date;
};

async function loadPipeline() {
  if (!db) return null;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    [running],
    [failed24h],
    [completed24h],
    statusBreakdown,
    recent,
    failedJobs,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(pipelineJobs)
      .where(eq(pipelineJobs.status, "running")),
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(pipelineJobs)
      .where(and(eq(pipelineJobs.status, "failed"), gt(pipelineJobs.createdAt, yesterday))),
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(pipelineJobs)
      .where(and(eq(pipelineJobs.status, "completed"), gt(pipelineJobs.createdAt, yesterday))),
    db
      .select({
        step: pipelineJobs.step,
        status: pipelineJobs.status,
        n: sql<number>`cast(count(*) as int)`,
      })
      .from(pipelineJobs)
      .where(gt(pipelineJobs.createdAt, yesterday))
      .groupBy(pipelineJobs.step, pipelineJobs.status),
    db
      .select({
        jobId: pipelineJobs.id,
        siteId: pipelineJobs.siteId,
        siteSlug: sites.slug,
        ownerEmail: users.email,
        step: pipelineJobs.step,
        status: pipelineJobs.status,
        progress: pipelineJobs.progress,
        message: pipelineJobs.message,
        error: pipelineJobs.error,
        createdAt: pipelineJobs.createdAt,
      })
      .from(pipelineJobs)
      .innerJoin(sites, eq(sites.id, pipelineJobs.siteId))
      .innerJoin(users, eq(users.id, sites.userId))
      .orderBy(sql`${pipelineJobs.createdAt} desc`)
      .limit(40),
    db
      .select({
        jobId: pipelineJobs.id,
        siteId: pipelineJobs.siteId,
        siteSlug: sites.slug,
        ownerEmail: users.email,
        step: pipelineJobs.step,
        status: pipelineJobs.status,
        progress: pipelineJobs.progress,
        message: pipelineJobs.message,
        error: pipelineJobs.error,
        createdAt: pipelineJobs.createdAt,
      })
      .from(pipelineJobs)
      .innerJoin(sites, eq(sites.id, pipelineJobs.siteId))
      .innerJoin(users, eq(users.id, sites.userId))
      .where(eq(pipelineJobs.status, "failed"))
      .orderBy(sql`${pipelineJobs.createdAt} desc`)
      .limit(20),
  ]);

  return {
    running: running.n,
    failed24h: failed24h.n,
    completed24h: completed24h.n,
    statusBreakdown,
    recent: recent as Row[],
    failedJobs: failedJobs as Row[],
  };
}

const statusToneMap: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const cols: Column<Row>[] = [
  {
    header: "Site",
    cell: (r) => (
      <div className="min-w-0">
        <a
          href={`/${r.siteSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold hover:underline truncate block"
        >
          /{r.siteSlug}
        </a>
        <div className="text-[11px] text-[color:var(--fg-subtle)] truncate">{r.ownerEmail}</div>
      </div>
    ),
  },
  { header: "Step", cell: (r) => <span className="text-xs font-mono">{r.step}</span> },
  {
    header: "Status",
    cell: (r) => (
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          statusToneMap[r.status] || statusToneMap.pending
        }`}
      >
        {r.status}
      </span>
    ),
  },
  { header: "Progress", cell: (r) => `${r.progress}%`, align: "right" },
  {
    header: "Message / error",
    cell: (r) => (
      <div className="max-w-md">
        {r.error && (
          <div className="text-[11px] text-red-700 truncate" title={r.error}>
            {r.error}
          </div>
        )}
        {r.message && (
          <div className="text-[11px] text-[color:var(--fg-subtle)] truncate" title={r.message}>
            {r.message}
          </div>
        )}
      </div>
    ),
  },
  {
    header: "When",
    cell: (r) => (
      <span className="text-[11px] text-[color:var(--fg-subtle)] whitespace-nowrap">
        {new Date(r.createdAt).toLocaleString()}
      </span>
    ),
  },
];

export default async function AdminPipelinePage() {
  const data = await loadPipeline();
  if (!data) {
    return (
      <PageShell title="Pipeline">
        <div className="text-sm text-[color:var(--fg-subtle)]">Database not configured.</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Pipeline" description="Real-time job health. 30s cache.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile label="Running now" value={data.running} tone={data.running > 0 ? "warn" : "good"} />
        <StatTile
          label="Failed (24h)"
          value={data.failed24h}
          tone={data.failed24h > 0 ? "bad" : "good"}
        />
        <StatTile label="Completed (24h)" value={data.completed24h} tone="good" />
        <StatTile
          label="Steps × statuses (24h)"
          value={data.statusBreakdown.length}
          hint={data.statusBreakdown
            .map((s) => `${s.n} ${s.step}/${s.status}`)
            .slice(0, 4)
            .join(" · ")}
        />
      </div>

      {data.failedJobs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold mb-3 text-red-700">Failed jobs (most recent first)</h2>
          <DataTable columns={cols} rows={data.failedJobs} />
        </section>
      )}

      <section>
        <h2 className="text-sm font-bold mb-3">All jobs (last 40)</h2>
        <DataTable columns={cols} rows={data.recent} empty="No pipeline activity yet." />
      </section>
    </PageShell>
  );
}
