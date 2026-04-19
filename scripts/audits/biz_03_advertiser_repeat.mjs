import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("biz_03_advertiser_repeat");

  const totals = await sql`
    SELECT
      COUNT(DISTINCT advertiser_email)::int as unique_adv,
      COUNT(*)::int as total_ads
    FROM ads
  `;
  r.info("ads purchased", `${totals[0].total_ads}`);
  r.info("unique advertiser emails", `${totals[0].unique_adv}`);

  if (totals[0].total_ads === 0) {
    r.ok("no ads yet — nothing to audit");
    return r.summary();
  }

  const repeat = await sql`
    SELECT advertiser_email, COUNT(*)::int as n FROM ads
    WHERE advertiser_email IS NOT NULL AND advertiser_email != ''
    GROUP BY advertiser_email HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 5
  `;
  r.info("advertisers with >1 ad", `${repeat.length}`);
  for (const row of repeat) r.info(row.advertiser_email, `${row.n} ads`);

  const repeatRate = totals[0].unique_adv > 0 ? repeat.length / totals[0].unique_adv : 0;
  r.info("repeat rate", `${(repeatRate * 100).toFixed(1)}%`);
  if (totals[0].total_ads > 10 && repeatRate < 0.1) r.warn("repeat rate <10% — likely poor advertiser experience");
  else if (totals[0].total_ads > 10) r.ok("repeat rate >=10%");

  return r.summary();
}
