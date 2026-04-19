import { sql, makeReporter, cents } from "./lib.mjs";

const PRICE = { creator: 1999, pro: 3900, agency: 9900, free: 0 };

export async function run() {
  const r = makeReporter("money_05_mrr_churn");

  const activeByPlan = await sql`
    SELECT plan, COUNT(*)::int as n
    FROM users
    WHERE subscription_status = 'active' AND plan != 'free'
    GROUP BY plan
  `;
  let mrr = 0;
  for (const row of activeByPlan) {
    const price = PRICE[row.plan] ?? 0;
    mrr += price * row.n;
    r.info(`active ${row.plan}`, `${row.n} × ${cents(price)} = ${cents(price * row.n)}`);
  }
  r.info("total MRR", cents(mrr));

  const totals = await sql`
    SELECT
      COUNT(*) FILTER (WHERE subscription_status = 'active' AND plan != 'free')::int as paying,
      COUNT(*) FILTER (WHERE subscription_status = 'inactive')::int as cancelled,
      COUNT(*)::int as all_users
    FROM users
  `;
  const t = totals[0];
  r.info(`users: ${t.all_users} total, ${t.paying} paying, ${t.cancelled} cancelled`);
  const churnRatio = t.paying + t.cancelled > 0 ? t.cancelled / (t.paying + t.cancelled) : 0;
  r.info("lifetime churn rate", `${(churnRatio * 100).toFixed(1)}%`);
  if (churnRatio > 0.4) r.warn("lifetime churn rate >40%", `${(churnRatio * 100).toFixed(1)}%`);
  else r.ok(`churn rate OK`);

  const newLast30 = await sql`
    SELECT COUNT(*)::int as n FROM users
    WHERE subscription_status = 'active' AND plan != 'free' AND created_at > now() - interval '30 days'
  `;
  r.info("new paying customers (30d)", `${newLast30[0].n}`);

  return r.summary();
}
