import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("money_03_connect_health");

  const counts = await sql`
    SELECT
      COUNT(*)::int as total,
      SUM(CASE WHEN charges_enabled THEN 1 ELSE 0 END)::int as charges_ok,
      SUM(CASE WHEN payouts_enabled THEN 1 ELSE 0 END)::int as payouts_ok,
      SUM(CASE WHEN details_submitted THEN 1 ELSE 0 END)::int as details_ok
    FROM stripe_connect_accounts
  `;
  const c = counts[0];
  r.info(`total connect accounts`, `${c.total}`);
  r.info(`charges_enabled`, `${c.charges_ok}/${c.total}`);
  r.info(`payouts_enabled`, `${c.payouts_ok}/${c.total}`);

  const stuck = await sql`
    SELECT COUNT(*)::int as n FROM stripe_connect_accounts
    WHERE created_at < now() - interval '7 days'
    AND (charges_enabled = false OR payouts_enabled = false)
  `;
  stuck[0].n === 0
    ? r.ok("no connect accounts stuck >7d in incomplete onboarding")
    : r.warn("connect accounts stuck >7d incomplete", `${stuck[0].n}`);

  const soldButNotEnabled = await sql`
    SELECT COUNT(DISTINCT s.user_id)::int as n
    FROM ads a
    JOIN sites s ON s.id = a.site_id
    LEFT JOIN stripe_connect_accounts sca ON sca.user_id = s.user_id
    WHERE a.status IN ('active','pending_review')
    AND (sca.payouts_enabled IS NULL OR sca.payouts_enabled = false)
  `;
  soldButNotEnabled[0].n === 0
    ? r.ok("creators with active ads all have payouts enabled")
    : r.fail("creators with active ads but no payouts", `${soldButNotEnabled[0].n} users`);

  return r.summary();
}
