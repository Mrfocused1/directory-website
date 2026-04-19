import { sql, makeReporter, cents } from "./lib.mjs";

export async function run() {
  const r = makeReporter("money_02_ad_payout_integrity");

  const bad = await sql`
    SELECT id, amount_cents, platform_fee_cents, creator_amount_cents
    FROM ads
    WHERE amount_cents <> (platform_fee_cents + creator_amount_cents)
  `;
  bad.length === 0
    ? r.ok("every ad row: amount = platform_fee + creator_amount")
    : r.fail(`${bad.length} ads with mismatched split`, bad.map((b) => b.id).slice(0, 3).join(", "));

  const negative = await sql`
    SELECT COUNT(*)::int as n FROM ads
    WHERE amount_cents < 0 OR platform_fee_cents < 0 OR creator_amount_cents < 0
  `;
  negative[0].n === 0 ? r.ok("no negative amounts") : r.fail("ads with negative amounts", `${negative[0].n}`);

  const feePct = await sql`
    SELECT AVG(platform_fee_cents::float / NULLIF(amount_cents, 0)) as ratio, COUNT(*)::int as n
    FROM ads WHERE status IN ('active','pending_review','expired')
  `;
  const ratio = feePct[0].ratio ? Number(feePct[0].ratio) : null;
  if (ratio === null) r.info("no active/reviewed ads to compute fee ratio");
  else if (ratio > 0.09 && ratio < 0.11) r.ok("platform fee ratio ~10%", `${(ratio * 100).toFixed(2)}%`);
  else r.warn("unusual platform fee ratio", `${(ratio * 100).toFixed(2)}% over ${feePct[0].n} ads`);

  const unpaid = await sql`
    SELECT status, COUNT(*)::int as n, COALESCE(SUM(creator_amount_cents),0)::bigint as total
    FROM ads GROUP BY status
  `;
  for (const row of unpaid) r.info(`ads.${row.status}`, `${row.n} rows, ${cents(Number(row.total))} creator owed`);

  return r.summary();
}
