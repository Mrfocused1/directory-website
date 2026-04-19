import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("money_04_billing_truthfulness");

  const stillActivePastEnd = await sql`
    SELECT COUNT(*)::int as n FROM ads
    WHERE status = 'active' AND ends_at < now()
  `;
  stillActivePastEnd[0].n === 0
    ? r.ok("no active ads past ends_at")
    : r.fail("ads still 'active' after ends_at", `${stillActivePastEnd[0].n} — should be 'expired'`);

  const badWindow = await sql`
    SELECT COUNT(*)::int as n FROM ads
    WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at <= starts_at
  `;
  badWindow[0].n === 0 ? r.ok("no inverted date windows") : r.fail("ads with ends_at <= starts_at", `${badWindow[0].n}`);

  const servedBeforeStart = await sql`
    SELECT COUNT(*)::int as n
    FROM ad_impressions i
    JOIN ads a ON a.id = i.ad_id
    WHERE i.created_at < a.starts_at
  `;
  servedBeforeStart[0].n === 0
    ? r.ok("no impressions before ad starts_at")
    : r.fail("impressions served before ad started", `${servedBeforeStart[0].n}`);

  const servedAfterEnd = await sql`
    SELECT COUNT(*)::int as n
    FROM ad_impressions i
    JOIN ads a ON a.id = i.ad_id
    WHERE i.created_at > a.ends_at
  `;
  servedAfterEnd[0].n === 0
    ? r.ok("no impressions after ad ends_at")
    : r.fail("impressions served after ad ended", `${servedAfterEnd[0].n}`);

  const activeNoAsset = await sql`
    SELECT COUNT(*)::int as n FROM ads
    WHERE status = 'active' AND (asset_url IS NULL OR asset_url = '')
  `;
  activeNoAsset[0].n === 0 ? r.ok("all active ads have asset_url") : r.fail("active ads missing asset_url", `${activeNoAsset[0].n}`);

  return r.summary();
}
