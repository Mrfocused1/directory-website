import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("biz_01_creator_activity");

  const totals = await sql`
    SELECT
      COUNT(*)::int as users,
      COUNT(*) FILTER (WHERE subscription_status = 'active' AND plan != 'free')::int as paying
    FROM users
  `;
  r.info(`users`, `${totals[0].users} total, ${totals[0].paying} paying`);

  const withSites = await sql`
    SELECT COUNT(DISTINCT u.id)::int as n FROM users u
    JOIN sites s ON s.user_id = u.id
    WHERE u.subscription_status = 'active' AND u.plan != 'free'
  `;
  const withoutSite = totals[0].paying - withSites[0].n;
  r.info(`paying users with a site`, `${withSites[0].n}`);
  if (withoutSite > 0) r.warn("paying users without any site", `${withoutSite}`);
  else r.ok("every paying user has a site");

  const syncedLast30 = await sql`
    SELECT COUNT(*)::int as n FROM sites
    WHERE last_sync_at > now() - interval '30 days'
  `;
  r.info("sites synced last 30d", `${syncedLast30[0].n}`);

  const trafficLast30 = await sql`
    SELECT COUNT(DISTINCT site_id)::int as n FROM page_views
    WHERE created_at > now() - interval '30 days'
  `;
  r.info("sites with pageviews last 30d", `${trafficLast30[0].n}`);

  const zombie = await sql`
    SELECT COUNT(*)::int as n FROM users u
    WHERE u.subscription_status = 'active' AND u.plan != 'free'
    AND NOT EXISTS (
      SELECT 1 FROM sites s WHERE s.user_id = u.id
      AND s.last_sync_at > now() - interval '60 days'
    )
  `;
  zombie[0].n === 0
    ? r.ok("no paying users with 60d+ inactive sites")
    : r.warn("paying users with NO site activity in 60d (churn risk)", `${zombie[0].n}`);

  return r.summary();
}
