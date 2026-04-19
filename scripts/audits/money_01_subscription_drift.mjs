import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("money_01_subscription_drift");

  const rows = await sql`SELECT plan, subscription_status, COUNT(*)::int as n FROM users GROUP BY plan, subscription_status ORDER BY n DESC`;
  for (const row of rows) r.info(`users: plan=${row.plan} status=${row.subscription_status}`, `${row.n}`);

  const paidNoCustomer = await sql`
    SELECT COUNT(*)::int as n FROM users
    WHERE plan != 'free' AND subscription_status = 'active' AND stripe_customer_id IS NULL
  `;
  paidNoCustomer[0].n === 0
    ? r.ok("no active paid users without stripe_customer_id")
    : r.fail("active paid users missing stripe_customer_id", `${paidNoCustomer[0].n}`);

  const freeButActive = await sql`
    SELECT COUNT(*)::int as n FROM users
    WHERE plan = 'free' AND subscription_status = 'active'
  `;
  freeButActive[0].n === 0
    ? r.ok("no 'free' plan rows marked active")
    : r.warn("users on 'free' plan with subscription_status='active'", `${freeButActive[0].n}`);

  const paidInactive = await sql`
    SELECT COUNT(*)::int as n FROM users
    WHERE plan IN ('creator','pro','agency') AND subscription_status = 'inactive'
  `;
  paidInactive[0].n === 0
    ? r.ok("no paid-plan users stuck on inactive")
    : r.info("paid-plan users with subscription_status='inactive' (cancelled)", `${paidInactive[0].n}`);

  const dupCustomers = await sql`
    SELECT stripe_customer_id, COUNT(*)::int as n FROM users
    WHERE stripe_customer_id IS NOT NULL
    GROUP BY stripe_customer_id HAVING COUNT(*) > 1
  `;
  dupCustomers.length === 0
    ? r.ok("no duplicate stripe_customer_id")
    : r.fail("duplicate stripe_customer_id across users", `${dupCustomers.length} cust IDs`);

  return r.summary();
}
