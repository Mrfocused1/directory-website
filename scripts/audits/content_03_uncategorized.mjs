import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("content_03_uncategorized");

  const totals = await sql`
    SELECT
      COUNT(*)::int as all_posts,
      COUNT(*) FILTER (WHERE category IS NULL OR category = '' OR category = 'Uncategorized')::int as uncategorized,
      COUNT(DISTINCT site_id)::int as sites
    FROM posts WHERE is_visible = true
  `;
  const t = totals[0];
  if (t.all_posts === 0) {
    r.ok("no posts yet — nothing to audit");
    return r.summary();
  }
  const pct = t.uncategorized / t.all_posts;
  r.info("visible posts", `${t.all_posts} across ${t.sites} sites`);
  r.info("uncategorized share", `${(pct * 100).toFixed(1)}%`);

  if (pct > 0.15) r.fail("uncategorized share >15%", `${(pct * 100).toFixed(1)}%`);
  else if (pct > 0.05) r.warn("uncategorized share >5%", `${(pct * 100).toFixed(1)}%`);
  else r.ok("uncategorized share <=5%");

  const perSite = await sql`
    SELECT s.slug, s.display_name,
      COUNT(p.id)::int as total,
      COUNT(p.id) FILTER (WHERE p.category IS NULL OR p.category = '' OR p.category = 'Uncategorized')::int as blank
    FROM sites s
    JOIN posts p ON p.site_id = s.id AND p.is_visible = true
    GROUP BY s.slug, s.display_name
    HAVING COUNT(p.id) > 10
      AND COUNT(p.id) FILTER (WHERE p.category IS NULL OR p.category = '' OR p.category = 'Uncategorized') * 5 > COUNT(p.id)
    ORDER BY blank DESC LIMIT 5
  `;
  for (const row of perSite) {
    const sitePct = (row.blank / row.total) * 100;
    r.warn(`${row.slug}: ${sitePct.toFixed(0)}% uncategorized`, `${row.blank}/${row.total}`);
  }

  return r.summary();
}
