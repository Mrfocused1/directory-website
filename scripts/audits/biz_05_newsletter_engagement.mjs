import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("biz_05_newsletter_engagement");

  const subs = await sql`
    SELECT COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE is_active = true)::int as active,
      COUNT(*) FILTER (WHERE is_verified = true)::int as verified
    FROM subscribers
  `;
  r.info("subscribers", `${subs[0].total} total, ${subs[0].active} active, ${subs[0].verified} verified`);

  if (subs[0].active === 0) {
    r.ok("no active subscribers yet");
    return r.summary();
  }

  const digests = await sql`
    SELECT COUNT(*)::int as n,
      SUM(recipient_count)::int as sent,
      SUM(open_count)::int as opens,
      SUM(click_count)::int as clicks
    FROM digest_history WHERE sent_at > now() - interval '90 days'
  `;
  const d = digests[0];
  r.info("digests sent last 90d", `${d.n ?? 0}`);

  if ((d.sent ?? 0) > 0) {
    const openRate = (d.opens ?? 0) / d.sent;
    const clickRate = (d.clicks ?? 0) / d.sent;
    r.info("open rate 90d", `${(openRate * 100).toFixed(1)}%`);
    r.info("click rate 90d", `${(clickRate * 100).toFixed(2)}%`);
    if (openRate < 0.15) r.warn("open rate <15% (industry avg ~20-25%)");
    else r.ok("open rate healthy");
    if (d.opens > 0 && clickRate === 0) r.warn("zero clicks despite opens — check CTA");
  } else {
    r.info("no digest send history in last 90d");
  }

  const deadLists = await sql`
    SELECT s.slug, COUNT(sub.id)::int as subs,
      MAX(sub.last_digest_at) as last_digest
    FROM sites s
    JOIN subscribers sub ON sub.site_id = s.id AND sub.is_active = true
    GROUP BY s.slug
    HAVING COUNT(sub.id) > 20
      AND (MAX(sub.last_digest_at) < now() - interval '30 days' OR MAX(sub.last_digest_at) IS NULL)
  `;
  if (deadLists.length > 0) {
    r.warn(`${deadLists.length} site(s) with 20+ subscribers but no digest in 30d`);
    for (const row of deadLists.slice(0, 5)) r.warn(row.slug, `${row.subs} subs, last ${row.last_digest ?? "never"}`);
  } else {
    r.ok("no dormant lists with 20+ subscribers");
  }

  return r.summary();
}
