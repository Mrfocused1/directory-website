import { db } from "@/db";
import { users, stripeEvents } from "@/db/schema";
import { sql, count } from "drizzle-orm";
import StatTile from "../_components/StatTile";
import PageShell from "../_components/PageShell";
import DataTable, { type Column } from "../_components/DataTable";

export const revalidate = 60;

type EventRow = {
  id: string;
  type: string;
  receivedAt: Date;
};

// Unified £19.99 pricing across every paid tier. Pro and Agency
// exist as legacy plan IDs for feature gating but no longer have
// a distinct price point.
const PLAN_PRICE_CENTS: Record<string, number> = {
  free: 0,
  creator: 1999,
  pro: 1999,
  agency: 1999,
};

async function loadBilling() {
  if (!db) return null;

  const [planRows, recentEvents, [withBilling]] = await Promise.all([
    db
      .select({ plan: users.plan, n: count() })
      .from(users)
      .groupBy(users.plan),
    db
      .select({
        id: stripeEvents.id,
        type: stripeEvents.type,
        receivedAt: stripeEvents.receivedAt,
      })
      .from(stripeEvents)
      .orderBy(sql`${stripeEvents.receivedAt} desc`)
      .limit(30),
    db
      .select({ n: count() })
      .from(users)
      .where(sql`${users.stripeCustomerId} is not null`),
  ]);

  const mrrCents = planRows.reduce(
    (sum, r) => sum + (PLAN_PRICE_CENTS[r.plan] ?? 0) * r.n,
    0,
  );
  const arrCents = mrrCents * 12;

  return {
    planRows,
    recentEvents: recentEvents as EventRow[],
    customersWithBilling: withBilling.n,
    mrrCents,
    arrCents,
  };
}

const eventCols: Column<EventRow>[] = [
  { header: "Event type", cell: (r) => <span className="text-xs font-mono">{r.type}</span> },
  {
    header: "ID",
    cell: (r) => (
      <span className="text-[11px] text-[color:var(--fg-subtle)] font-mono">
        {r.id.slice(0, 28)}…
      </span>
    ),
  },
  {
    header: "Received",
    cell: (r) => (
      <span className="text-xs text-[color:var(--fg-subtle)] whitespace-nowrap">
        {new Date(r.receivedAt).toLocaleString()}
      </span>
    ),
  },
];

export default async function AdminBillingPage() {
  const data = await loadBilling();
  if (!data) {
    return (
      <PageShell title="Billing">
        <div className="text-sm text-[color:var(--fg-subtle)]">Database not configured.</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Billing"
      description="Plan distribution + recent Stripe events. Read-only — manage subscriptions in the Stripe dashboard."
      actions={
        <a
          href="https://dashboard.stripe.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 px-3 inline-flex items-center text-xs font-semibold bg-black text-white rounded-lg hover:opacity-90 transition"
        >
          Open Stripe →
        </a>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="MRR (estimate)"
          value={`$${(data.mrrCents / 100).toLocaleString()}`}
          hint="users × plan price"
        />
        <StatTile
          label="ARR (estimate)"
          value={`$${(data.arrCents / 100).toLocaleString()}`}
        />
        <StatTile
          label="With Stripe customer"
          value={data.customersWithBilling}
        />
        <StatTile
          label="Stripe events (latest)"
          value={data.recentEvents.length}
        />
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3">Plan distribution</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.planRows.map((p) => (
            <div
              key={p.plan}
              className="bg-white border border-[color:var(--border)] rounded-xl p-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">
                {p.plan}
              </p>
              <p className="text-2xl font-extrabold tabular-nums">{p.n}</p>
              <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
                ${(((PLAN_PRICE_CENTS[p.plan] ?? 0) * p.n) / 100).toLocaleString()}/mo
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold mb-3">Recent Stripe events</h2>
        <DataTable
          columns={eventCols}
          rows={data.recentEvents}
          empty="No Stripe events received yet."
        />
      </section>
    </PageShell>
  );
}
