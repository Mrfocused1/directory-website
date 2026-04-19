import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("content_04_reference_health");

  const total = await sql`SELECT COUNT(*)::int as n FROM "references"`;
  r.info("references total", `${total[0].n}`);

  if (total[0].n === 0) {
    r.ok("no references yet");
    return r.summary();
  }

  const noUrl = await sql`
    SELECT COUNT(*)::int as n FROM "references"
    WHERE (url IS NULL OR url = '') AND (video_id IS NULL OR video_id = '')
  `;
  noUrl[0].n === 0
    ? r.ok("every reference has either url or video_id")
    : r.fail("references with neither url nor video_id", `${noUrl[0].n}`);

  const noTitle = await sql`SELECT COUNT(*)::int as n FROM "references" WHERE title IS NULL OR title = ''`;
  noTitle[0].n === 0 ? r.ok("every reference has a title") : r.warn("references without title", `${noTitle[0].n}`);

  const postsNoRefs = await sql`
    SELECT COUNT(*)::int as n FROM posts p
    WHERE p.is_visible = true
    AND NOT EXISTS (SELECT 1 FROM "references" r WHERE r.post_id = p.id)
  `;
  r.info("visible posts with zero references", `${postsNoRefs[0].n}`);

  const byKind = await sql`
    SELECT kind, COUNT(*)::int as n FROM "references" GROUP BY kind ORDER BY n DESC
  `;
  for (const row of byKind) r.info(`kind=${row.kind ?? "null"}`, `${row.n}`);

  const nonEn = await sql`
    SELECT COUNT(*)::int as n FROM "references"
    WHERE url ~* '\.(ru|cn|jp|kr|br|fr|de|es|it|pl)(/|$)'
  `;
  nonEn[0].n === 0
    ? r.ok("no references on obviously non-English TLDs")
    : r.warn("references with non-English TLDs", `${nonEn[0].n}`);

  return r.summary();
}
