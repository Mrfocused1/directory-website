import { sql, makeReporter } from "./lib.mjs";

async function head(url, ms = 4000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    clearTimeout(t);
    return res.status;
  } catch {
    return 0;
  }
}

export async function run() {
  const r = makeReporter("media_01_linkrot_sample");
  const sampleSize = 15;

  const sample = await sql`
    SELECT id, shortcode, media_url, thumb_url FROM posts
    WHERE is_visible = true
    AND (media_url IS NOT NULL OR thumb_url IS NOT NULL)
    ORDER BY random() LIMIT ${sampleSize}
  `;

  r.info("sampling posts for media health", `${sample.length}/${sampleSize}`);

  let broken = 0;
  let checked = 0;
  const results = [];
  for (const row of sample) {
    const url = row.media_url || row.thumb_url;
    if (!url) continue;
    checked++;
    const status = await head(url);
    results.push({ shortcode: row.shortcode, status });
    if (status === 0 || status >= 400) broken++;
  }

  const byStatus = results.reduce((acc, x) => { acc[x.status] = (acc[x.status] || 0) + 1; return acc; }, {});
  for (const [s, n] of Object.entries(byStatus)) r.info(`HTTP ${s}`, `${n}`);

  if (checked === 0) r.info("no visible posts had media URLs");
  else if (broken === 0) r.ok("sample: all media reachable");
  else {
    const pct = ((broken / checked) * 100).toFixed(0);
    if (pct > 20) r.fail(`${pct}% of sampled media broken`, `${broken}/${checked}`);
    else r.warn(`${pct}% of sampled media broken`, `${broken}/${checked}`);
  }

  return r.summary();
}
