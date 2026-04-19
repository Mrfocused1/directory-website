import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("content_02_post_freshness");

  const sites = await sql`SELECT COUNT(*)::int as n FROM sites WHERE is_published = true`;
  r.info("published sites", `${sites[0].n}`);

  const stale30 = await sql`
    SELECT COUNT(*)::int as n FROM sites
    WHERE is_published = true AND (last_sync_at IS NULL OR last_sync_at < now() - interval '30 days')
  `;
  stale30[0].n === 0
    ? r.ok("all published sites synced within 30d")
    : r.warn("published sites not synced in 30d", `${stale30[0].n}`);

  const stale90 = await sql`
    SELECT COUNT(*)::int as n FROM sites
    WHERE is_published = true AND (last_sync_at IS NULL OR last_sync_at < now() - interval '90 days')
  `;
  stale90[0].n === 0
    ? r.ok("no published sites with zero activity for 90d")
    : r.fail("published sites dark for 90d", `${stale90[0].n}`);

  const byRecency = await sql`
    SELECT
      COUNT(*) FILTER (WHERE last_sync_at > now() - interval '7 days')::int as week,
      COUNT(*) FILTER (WHERE last_sync_at > now() - interval '30 days' AND last_sync_at <= now() - interval '7 days')::int as month,
      COUNT(*) FILTER (WHERE last_sync_at <= now() - interval '30 days')::int as older
    FROM sites WHERE is_published = true
  `;
  r.info(`sync distribution`, `${byRecency[0].week} last week, ${byRecency[0].month} 7-30d, ${byRecency[0].older} >30d`);

  return r.summary();
}
