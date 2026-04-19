import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("biz_02_ad_fill_rate");

  const slotTotals = await sql`
    SELECT COUNT(*)::int as n, COUNT(*) FILTER (WHERE enabled = true)::int as enabled
    FROM ad_slots
  `;
  r.info("ad_slots configured", `${slotTotals[0].n} total, ${slotTotals[0].enabled} enabled`);

  if (slotTotals[0].enabled === 0) {
    r.info("no creators have enabled any slot — marketing opportunity");
    return r.summary();
  }

  const filled = await sql`
    SELECT COUNT(DISTINCT s.id)::int as n FROM ad_slots s
    JOIN ads a ON a.slot_id = s.id AND a.status = 'active' AND a.ends_at > now()
    WHERE s.enabled = true
  `;
  const fillRate = filled[0].n / slotTotals[0].enabled;
  r.info("enabled slots with active ad", `${filled[0].n}/${slotTotals[0].enabled} = ${(fillRate * 100).toFixed(1)}%`);
  if (fillRate < 0.1) r.warn("fill rate <10%", "consider marketing push");
  else r.ok("fill rate above 10%");

  const bySlotType = await sql`
    SELECT slot_type, COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE enabled = true)::int as enabled
    FROM ad_slots GROUP BY slot_type ORDER BY total DESC
  `;
  for (const row of bySlotType) r.info(`${row.slot_type}`, `${row.enabled}/${row.total} enabled`);

  return r.summary();
}
