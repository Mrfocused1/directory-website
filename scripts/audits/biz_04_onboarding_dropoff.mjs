import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("biz_04_onboarding_dropoff");

  const totals = await sql`
    SELECT COUNT(*)::int as users,
      COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int as new30
    FROM users
  `;
  r.info("users total", `${totals[0].users}`);
  r.info("signups last 30d", `${totals[0].new30}`);

  const steps = await sql`
    SELECT
      COUNT(DISTINCT u.id)::int as signed,
      COUNT(DISTINCT s.user_id)::int as created_site,
      COUNT(DISTINCT s2.user_id)::int as published_site
    FROM users u
    LEFT JOIN sites s ON s.user_id = u.id
    LEFT JOIN sites s2 ON s2.user_id = u.id AND s2.is_published = true
  `;
  const p = steps[0];
  r.info("funnel: signed up", `${p.signed}`);
  r.info("funnel: created a site", `${p.created_site}`);
  r.info("funnel: published a site", `${p.published_site}`);
  const createRate = p.signed > 0 ? p.created_site / p.signed : 0;
  const publishRate = p.created_site > 0 ? p.published_site / p.created_site : 0;
  r.info("signup → site creation rate", `${(createRate * 100).toFixed(1)}%`);
  r.info("site creation → publish rate", `${(publishRate * 100).toFixed(1)}%`);
  if (publishRate < 0.5) r.warn("less than half of created sites get published", "onboarding friction");
  else r.ok("publish rate >=50%");

  const created7d = await sql`
    SELECT COUNT(*)::int as n FROM users
    WHERE created_at > now() - interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.user_id = users.id)
  `;
  if (created7d[0].n > 0) r.warn("signups <7d with no site yet (nudge candidates)", `${created7d[0].n}`);

  return r.summary();
}
