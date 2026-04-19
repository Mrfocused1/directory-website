import { sql, makeReporter } from "./lib.mjs";

const CHECKS = [
  { child: "sites", childCol: "user_id", parent: "users", parentCol: "id" },
  { child: "posts", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: `"references"`, childCol: "post_id", parent: "posts", parentCol: "id" },
  { child: "pipeline_jobs", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "subscribers", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "digest_history", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "page_views", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "post_clicks", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "search_events", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "category_clicks", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "daily_stats", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "visitor_profiles", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "collections", childCol: "visitor_id", parent: "visitor_profiles", parentCol: "id" },
  { child: "collections", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "bookmarks", childCol: "collection_id", parent: "collections", parentCol: "id" },
  { child: "platform_connections", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "custom_domains", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "api_keys", childCol: "user_id", parent: "users", parentCol: "id" },
  { child: "stripe_connect_accounts", childCol: "user_id", parent: "users", parentCol: "id" },
  { child: "ad_slots", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "ads", childCol: "slot_id", parent: "ad_slots", parentCol: "id" },
  { child: "ads", childCol: "site_id", parent: "sites", parentCol: "id" },
  { child: "ad_impressions", childCol: "ad_id", parent: "ads", parentCol: "id" },
  { child: "ad_clicks", childCol: "ad_id", parent: "ads", parentCol: "id" },
];

export async function run() {
  const r = makeReporter("data_01_orphan_rows");
  let totalOrphans = 0;

  for (const c of CHECKS) {
    const q = `SELECT COUNT(*)::int AS n FROM ${c.child} x WHERE x.${c.childCol} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${c.parent} p WHERE p.${c.parentCol} = x.${c.childCol})`;
    try {
      const [row] = await sql.unsafe(q);
      if (row.n === 0) {
        r.ok(`${c.child}.${c.childCol} → ${c.parent}.${c.parentCol}`);
      } else {
        r.fail(`orphans in ${c.child}.${c.childCol}`, `${row.n} rows not in ${c.parent}`);
        totalOrphans += row.n;
      }
    } catch (err) {
      r.warn(`${c.child}.${c.childCol} check failed`, err.message);
    }
  }

  if (totalOrphans > 0) r.info("total orphan rows", `${totalOrphans}`);
  return r.summary();
}
