import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("legal_01_data_retention");

  const unsubStale = await sql`
    SELECT COUNT(*)::int as n FROM subscribers
    WHERE is_active = false AND created_at < now() - interval '1 year'
  `;
  unsubStale[0].n === 0
    ? r.ok("no unsubscribed subscribers older than 1 year")
    : r.warn("unsubscribed subscribers held >1y (GDPR retention risk)", `${unsubStale[0].n}`);

  const rejectedAds = await sql`
    SELECT COUNT(*)::int as n FROM ads
    WHERE status = 'rejected' AND updated_at < now() - interval '90 days'
  `;
  rejectedAds[0].n === 0
    ? r.ok("no rejected ads held >90d")
    : r.warn("rejected ads >90d (consider purge)", `${rejectedAds[0].n}`);

  const expiredAds = await sql`
    SELECT COUNT(*)::int as n FROM ads
    WHERE status = 'expired' AND ends_at < now() - interval '1 year'
  `;
  r.info("ads expired >1y ago", `${expiredAds[0].n}`);

  const oldPipelineJobs = await sql`
    SELECT COUNT(*)::int as n FROM pipeline_jobs
    WHERE status IN ('completed','failed') AND created_at < now() - interval '180 days'
  `;
  oldPipelineJobs[0].n === 0
    ? r.ok("no stale completed/failed pipeline jobs >180d")
    : r.warn("pipeline_jobs rows >180d old", `${oldPipelineJobs[0].n}`);

  const rawAnalytics = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM page_views WHERE created_at < now() - interval '90 days') as page_views,
      (SELECT COUNT(*)::int FROM post_clicks WHERE created_at < now() - interval '90 days') as post_clicks,
      (SELECT COUNT(*)::int FROM search_events WHERE created_at < now() - interval '90 days') as searches,
      (SELECT COUNT(*)::int FROM category_clicks WHERE created_at < now() - interval '90 days') as cat_clicks
  `;
  const old = rawAnalytics[0];
  const oldTotal = old.page_views + old.post_clicks + old.searches + old.cat_clicks;
  if (oldTotal === 0) r.ok("90d analytics prune working — no rows older than 90d");
  else r.fail("raw analytics rows >90d old exist — prune cron not running?", `${oldTotal} rows`);

  const zombieVisitors = await sql`
    SELECT COUNT(*)::int as n FROM visitor_profiles v
    WHERE NOT EXISTS (
      SELECT 1 FROM collections c WHERE c.visitor_id = v.id
      UNION ALL SELECT 1 FROM bookmarks b JOIN collections c2 ON c2.id = b.collection_id WHERE c2.visitor_id = v.id
    ) AND v.created_at < now() - interval '30 days'
  `;
  zombieVisitors[0].n === 0
    ? r.ok("no zombie visitor profiles (>30d, zero activity)")
    : r.warn("visitor profiles with no bookmarks/collections >30d", `${zombieVisitors[0].n}`);

  return r.summary();
}
