import { db } from "@/db";
import { users, sites } from "@/db/schema";
import { sql, ilike, count } from "drizzle-orm";
import PageShell from "../_components/PageShell";
import DataTable, { type Column } from "../_components/DataTable";
import RevokeButton from "../_components/RevokeButton";

export const revalidate = 60;

type Row = {
  id: string;
  email: string;
  plan: string;
  hasBilling: boolean;
  sitesCount: number;
  createdAt: Date;
  lastActivity: Date | null;
};

async function loadUsers(query: string): Promise<Row[]> {
  if (!db) return [];
  const q = query.trim();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      stripeCustomerId: users.stripeCustomerId,
      createdAt: users.createdAt,
      sitesCount: sql<number>`cast((select count(*) from ${sites} where ${sites.userId} = ${users.id}) as int)`,
      lastActivity: sql<
        Date | null
      >`(select max(${sites.lastSyncAt}) from ${sites} where ${sites.userId} = ${users.id})`,
    })
    .from(users)
    .where(q ? ilike(users.email, `%${q}%`) : undefined)
    .orderBy(sql`${users.createdAt} desc`)
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    plan: r.plan,
    hasBilling: !!r.stripeCustomerId,
    sitesCount: r.sitesCount,
    createdAt: r.createdAt,
    lastActivity: r.lastActivity,
  }));
}

const planTone: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  creator: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  agency: "bg-amber-100 text-amber-700",
};

const columns: Column<Row>[] = [
  {
    header: "Email",
    cell: (r) => <span className="text-sm truncate">{r.email}</span>,
  },
  {
    header: "Plan",
    cell: (r) => (
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          planTone[r.plan] || planTone.free
        }`}
      >
        {r.plan}
      </span>
    ),
  },
  {
    header: "Billing",
    cell: (r) => (r.hasBilling ? <span className="text-xs">Stripe ✓</span> : <span className="text-xs text-[color:var(--fg-subtle)]">—</span>),
  },
  { header: "Sites", cell: (r) => r.sitesCount, align: "right" },
  {
    header: "Last sync",
    cell: (r) =>
      r.lastActivity ? (
        <span className="text-xs">{new Date(r.lastActivity).toLocaleDateString()}</span>
      ) : (
        <span className="text-xs text-[color:var(--fg-subtle)]">—</span>
      ),
  },
  {
    header: "Joined",
    cell: (r) => (
      <span className="text-xs text-[color:var(--fg-subtle)]">
        {new Date(r.createdAt).toLocaleDateString()}
      </span>
    ),
  },
  {
    header: "",
    cell: (r) => <RevokeButton email={r.email} />,
  },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q || "";
  const rows = await loadUsers(q);

  return (
    <PageShell
      title="Users"
      description={`${rows.length} ${rows.length === 1 ? "user" : "users"}${q ? ` matching "${q}"` : ""}, newest first (cap 100).`}
      actions={
        <form method="GET" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search email…"
            className="h-9 px-3 w-72 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />
          {q && (
            <a
              href="/admin/users"
              className="h-9 px-3 inline-flex items-center text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            >
              Clear
            </a>
          )}
        </form>
      }
    >
      <DataTable columns={columns} rows={rows} empty={q ? "No users match." : "No users."} />
    </PageShell>
  );
}
