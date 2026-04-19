import { sql, makeReporter } from "./lib.mjs";

const EXPECTED_FKS = [
  ["sites", "user_id"],
  ["posts", "site_id"],
  ["references", "post_id"],
  ["pipeline_jobs", "site_id"],
  ["subscribers", "site_id"],
  ["digest_history", "site_id"],
  ["page_views", "site_id"],
  ["post_clicks", "site_id"],
  ["search_events", "site_id"],
  ["category_clicks", "site_id"],
  ["daily_stats", "site_id"],
  ["visitor_profiles", "site_id"],
  ["collections", "visitor_id"],
  ["collections", "site_id"],
  ["bookmarks", "collection_id"],
  ["platform_connections", "site_id"],
  ["custom_domains", "site_id"],
  ["api_keys", "user_id"],
  ["stripe_connect_accounts", "user_id"],
  ["ad_slots", "site_id"],
  ["ads", "slot_id"],
  ["ads", "site_id"],
  ["ad_impressions", "ad_id"],
  ["ad_clicks", "ad_id"],
];

export async function run() {
  const r = makeReporter("data_02_fk_constraints");

  const fks = await sql`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `;
  const have = new Set(fks.map((f) => `${f.table_name}.${f.column_name}`));

  r.info("total FK constraints", `${fks.length}`);

  const missing = [];
  for (const [t, c] of EXPECTED_FKS) {
    const key = `${t}.${c}`;
    if (have.has(key)) continue;
    missing.push(key);
  }

  if (missing.length === 0) r.ok("every expected FK exists at DB level");
  else {
    r.warn(`${missing.length} expected FK(s) not enforced at DB level`, "");
    for (const m of missing) r.warn("missing FK", m);
  }

  const uniqueChecks = await sql`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
  `;
  const uniques = new Set(uniqueChecks.map((u) => `${u.table_name}.${u.column_name}`));
  const expectUnique = [
    ["users", "email"],
    ["users", "stripe_customer_id"],
    ["sites", "slug"],
    ["stripe_events", "id"],
    ["ads", "stripe_payment_intent_id"],
  ];
  for (const [t, c] of expectUnique) {
    uniques.has(`${t}.${c}`)
      ? r.ok(`unique: ${t}.${c}`)
      : r.warn(`no UNIQUE constraint on ${t}.${c}`);
  }

  return r.summary();
}
