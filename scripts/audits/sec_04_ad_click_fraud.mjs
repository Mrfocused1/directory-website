import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("sec_04_ad_click_fraud");

  const totals = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM ad_impressions) as imp,
      (SELECT COUNT(*)::int FROM ad_clicks) as clk
  `;
  r.info("impressions total", `${totals[0].imp}`);
  r.info("clicks total", `${totals[0].clk}`);

  if (totals[0].imp === 0) {
    r.ok("no impressions yet — nothing to compare");
    return r.summary();
  }

  const ctr = totals[0].clk / totals[0].imp;
  r.info("overall CTR", `${(ctr * 100).toFixed(2)}%`);
  if (ctr > 0.2) r.warn("suspiciously high overall CTR (>20%)", `${(ctr * 100).toFixed(1)}%`);
  else if (ctr > 0 && ctr < 0.2) r.ok("CTR in plausible range");

  const clicksNoImp = await sql`
    SELECT COUNT(*)::int as n
    FROM ad_clicks c
    WHERE NOT EXISTS (
      SELECT 1 FROM ad_impressions i
      WHERE i.ad_id = c.ad_id AND i.session_id IS NOT DISTINCT FROM c.session_id
    )
  `;
  clicksNoImp[0].n === 0
    ? r.ok("no clicks without a matching impression (same session+ad)")
    : r.warn("clicks without prior impression", `${clicksNoImp[0].n}`);

  const rapid = await sql`
    SELECT session_id, ad_id, COUNT(*)::int as n
    FROM ad_clicks
    WHERE session_id IS NOT NULL
    GROUP BY session_id, ad_id
    HAVING COUNT(*) > 5
  `;
  rapid.length === 0
    ? r.ok("no session+ad pair with >5 clicks")
    : r.warn("session+ad pairs with >5 clicks (fraud candidates)", `${rapid.length}`);

  const topClickers = await sql`
    SELECT ad_id, COUNT(*)::int as n FROM ad_clicks GROUP BY ad_id ORDER BY n DESC LIMIT 3
  `;
  for (const row of topClickers) r.info(`ad ${row.ad_id.slice(0, 8)}`, `${row.n} clicks`);

  return r.summary();
}
