import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("content_01_duplicate_posts");

  const dupShort = await sql`
    SELECT site_id, shortcode, COUNT(*)::int as n
    FROM posts
    WHERE shortcode IS NOT NULL
    GROUP BY site_id, shortcode HAVING COUNT(*) > 1
  `;
  dupShort.length === 0
    ? r.ok("no duplicate (site_id, shortcode)")
    : r.fail("duplicate posts by (site_id, shortcode)", `${dupShort.length} pairs`);

  const blankCaption = await sql`
    SELECT COUNT(*)::int as n FROM posts
    WHERE (caption IS NULL OR caption = '') AND is_visible = true
  `;
  blankCaption[0].n === 0
    ? r.ok("no visible posts with blank caption")
    : r.warn("visible posts with blank caption", `${blankCaption[0].n}`);

  const identicalCaptions = await sql`
    SELECT site_id, LEFT(caption, 100) as sig, COUNT(*)::int as n
    FROM posts
    WHERE caption IS NOT NULL AND length(caption) > 30 AND is_visible = true
    GROUP BY site_id, LEFT(caption, 100) HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 10
  `;
  identicalCaptions.length === 0
    ? r.ok("no near-identical captions within a site")
    : r.warn(`${identicalCaptions.length} site(s) have posts sharing first 100 chars of caption`);

  return r.summary();
}
