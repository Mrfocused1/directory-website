/**
 * Serverless-safe subset of the audit agents in scripts/audits/.
 *
 * These re-run the DB-only checks inside the Inngest function so they can
 * fire on a cron. Filesystem/static-analysis audits (rate-limits scan, PII
 * scanner, npm audit, env drift) stay in scripts/audits/ for local/CI use.
 *
 * Each audit returns a list of findings. `level: "fail"` is actionable;
 * `warn` is worth a look; `info` is metric-only and never alerts.
 */

import postgres from "postgres";

export type Finding = {
  level: "fail" | "warn" | "info";
  label: string;
  detail?: string;
};

export type AuditResult = {
  name: string;
  findings: Finding[];
  fails: number;
  warns: number;
};

function newResult(name: string): AuditResult & {
  fail: (l: string, d?: string) => void;
  warn: (l: string, d?: string) => void;
  info: (l: string, d?: string) => void;
} {
  const findings: Finding[] = [];
  return {
    name,
    findings,
    get fails() { return findings.filter((f) => f.level === "fail").length; },
    get warns() { return findings.filter((f) => f.level === "warn").length; },
    fail: (label, detail) => findings.push({ level: "fail", label, detail }),
    warn: (label, detail) => findings.push({ level: "warn", label, detail }),
    info: (label, detail) => findings.push({ level: "info", label, detail }),
  };
}

export async function runAllDbAudits(databaseUrl: string): Promise<AuditResult[]> {
  const sql = postgres(databaseUrl, { ssl: "require", max: 2, idle_timeout: 5 });
  const out: AuditResult[] = [];
  try {
    out.push(await subscriptionDrift(sql));
    out.push(await adPayoutIntegrity(sql));
    out.push(await connectHealth(sql));
    out.push(await billingTruthfulness(sql));
    out.push(await orphanRows(sql));
    out.push(await clickFraud(sql));
    out.push(await dataRetention(sql));
    out.push(await adFillRate(sql));
    out.push(await siteFreshness(sql));
    out.push(await mrrMeter(sql));
  } finally {
    await sql.end();
  }
  return out;
}

// ── individual audits (mirror scripts/audits/*.mjs) ──────────────────────

async function subscriptionDrift(sql: postgres.Sql) {
  const r = newResult("subscription_drift");
  const [a] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE plan != 'free' AND subscription_status='active' AND stripe_customer_id IS NULL`;
  a.n === 0 ? r.info("no paid users missing stripe_customer_id") : r.fail("paid users missing stripe_customer_id", String(a.n));
  const [b] = await sql`SELECT COUNT(DISTINCT stripe_customer_id)::int AS dups FROM (SELECT stripe_customer_id FROM users WHERE stripe_customer_id IS NOT NULL GROUP BY stripe_customer_id HAVING COUNT(*) > 1) x`;
  b.dups === 0 ? r.info("no duplicate stripe_customer_id") : r.fail("duplicate stripe_customer_id", String(b.dups));
  return r;
}

async function adPayoutIntegrity(sql: postgres.Sql) {
  const r = newResult("ad_payout_integrity");
  const [a] = await sql`SELECT COUNT(*)::int AS n FROM ads WHERE amount_cents <> platform_fee_cents + creator_amount_cents`;
  a.n === 0 ? r.info("all ads: amount = fee + creator") : r.fail("ads with mismatched split", String(a.n));
  const [b] = await sql`SELECT COUNT(*)::int AS n FROM ads WHERE amount_cents < 0 OR platform_fee_cents < 0 OR creator_amount_cents < 0`;
  b.n === 0 ? r.info("no negative amounts") : r.fail("ads with negative amounts", String(b.n));
  return r;
}

async function connectHealth(sql: postgres.Sql) {
  const r = newResult("connect_health");
  const [a] = await sql`
    SELECT COUNT(DISTINCT s.user_id)::int AS n
    FROM ads a JOIN sites s ON s.id = a.site_id
    LEFT JOIN stripe_connect_accounts sca ON sca.user_id = s.user_id
    WHERE a.status IN ('active','pending_review')
      AND (sca.payouts_enabled IS NULL OR sca.payouts_enabled = false)
  `;
  a.n === 0 ? r.info("every creator with active ads has payouts enabled") : r.fail("creators with active ads but no payouts", String(a.n));
  const [b] = await sql`SELECT COUNT(*)::int AS n FROM stripe_connect_accounts WHERE created_at < now() - interval '7 days' AND (charges_enabled = false OR payouts_enabled = false)`;
  if (b.n > 0) r.warn("connect accounts stuck >7d incomplete", String(b.n));
  return r;
}

async function billingTruthfulness(sql: postgres.Sql) {
  const r = newResult("billing_truthfulness");
  const [a] = await sql`SELECT COUNT(*)::int AS n FROM ads WHERE status='active' AND ends_at < now()`;
  a.n === 0 ? r.info("no active ads past ends_at") : r.fail("active ads past ends_at", String(a.n));
  const [b] = await sql`SELECT COUNT(*)::int AS n FROM ads WHERE status='active' AND (asset_url IS NULL OR asset_url='')`;
  b.n === 0 ? r.info("active ads all have assets") : r.fail("active ads without asset_url", String(b.n));
  const [c] = await sql`SELECT COUNT(*)::int AS n FROM ad_impressions i JOIN ads a ON a.id=i.ad_id WHERE i.created_at < a.starts_at OR i.created_at > a.ends_at`;
  c.n === 0 ? r.info("no out-of-window impressions") : r.fail("impressions served outside ad window", String(c.n));
  return r;
}

async function orphanRows(sql: postgres.Sql) {
  const r = newResult("orphan_rows");
  const pairs = [
    ["sites", "user_id", "users", "id"],
    ["posts", "site_id", "sites", "id"],
    [`"references"`, "post_id", "posts", "id"],
    ["ad_slots", "site_id", "sites", "id"],
    ["ads", "slot_id", "ad_slots", "id"],
    ["ads", "site_id", "sites", "id"],
    ["ad_impressions", "ad_id", "ads", "id"],
    ["ad_clicks", "ad_id", "ads", "id"],
    ["stripe_connect_accounts", "user_id", "users", "id"],
    ["subscribers", "site_id", "sites", "id"],
  ] as const;
  let total = 0;
  for (const [child, col, parent, parentCol] of pairs) {
    const q = `SELECT COUNT(*)::int AS n FROM ${child} x WHERE x.${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.${parentCol} = x.${col})`;
    const [row] = await sql.unsafe(q);
    if (row.n > 0) {
      r.fail(`${child}.${col} orphans`, String(row.n));
      total += row.n;
    }
  }
  if (total === 0) r.info("no orphan rows across 10 relation pairs");
  return r;
}

async function clickFraud(sql: postgres.Sql) {
  const r = newResult("click_fraud");
  const [t] = await sql`SELECT (SELECT COUNT(*)::int FROM ad_impressions) AS imp, (SELECT COUNT(*)::int FROM ad_clicks) AS clk`;
  r.info("tracking totals", `${t.imp} imp, ${t.clk} clk`);
  if (t.imp > 0) {
    const ctr = t.clk / t.imp;
    if (ctr > 0.2) r.warn(`CTR > 20% (${(ctr * 100).toFixed(1)}%) — suspicious`);
  }
  const [b] = await sql`SELECT COUNT(*)::int AS n FROM (SELECT session_id, ad_id FROM ad_clicks WHERE session_id IS NOT NULL GROUP BY session_id, ad_id HAVING COUNT(*) > 5) x`;
  if (b.n > 0) r.warn("session+ad pairs with >5 clicks", String(b.n));
  return r;
}

async function dataRetention(sql: postgres.Sql) {
  const r = newResult("data_retention");
  const [a] = await sql`SELECT
    (SELECT COUNT(*)::int FROM page_views WHERE created_at < now() - interval '90 days') AS pv,
    (SELECT COUNT(*)::int FROM post_clicks WHERE created_at < now() - interval '90 days') AS pc,
    (SELECT COUNT(*)::int FROM search_events WHERE created_at < now() - interval '90 days') AS se,
    (SELECT COUNT(*)::int FROM category_clicks WHERE created_at < now() - interval '90 days') AS cc`;
  const total = a.pv + a.pc + a.se + a.cc;
  if (total > 0) r.fail("raw analytics >90d still present — prune cron not running?", String(total));
  else r.info("analytics prune: clean");
  return r;
}

async function adFillRate(sql: postgres.Sql) {
  const r = newResult("ad_fill_rate");
  const [a] = await sql`SELECT
    (SELECT COUNT(*)::int FROM ad_slots WHERE enabled = true) AS enabled,
    (SELECT COUNT(DISTINCT s.id)::int FROM ad_slots s JOIN ads a ON a.slot_id = s.id AND a.status='active' AND a.ends_at > now() WHERE s.enabled = true) AS filled`;
  if (a.enabled > 0) {
    const pct = ((a.filled / a.enabled) * 100).toFixed(0);
    r.info("ad fill rate", `${a.filled}/${a.enabled} (${pct}%)`);
  }
  return r;
}

async function siteFreshness(sql: postgres.Sql) {
  const r = newResult("site_freshness");
  const [a] = await sql`SELECT COUNT(*)::int AS n FROM sites WHERE is_published = true AND (last_sync_at IS NULL OR last_sync_at < now() - interval '90 days')`;
  if (a.n > 0) r.warn("published sites dark >90d", String(a.n));
  return r;
}

async function mrrMeter(sql: postgres.Sql) {
  const PRICE: Record<string, number> = { creator: 1999, pro: 1999, agency: 1999 };
  const r = newResult("mrr_meter");
  const rows = await sql`SELECT plan, COUNT(*)::int AS n FROM users WHERE subscription_status = 'active' AND plan != 'free' GROUP BY plan`;
  let mrr = 0;
  for (const row of rows) mrr += (PRICE[row.plan] ?? 0) * row.n;
  r.info("MRR", `$${(mrr / 100).toFixed(2)}`);
  return r;
}
