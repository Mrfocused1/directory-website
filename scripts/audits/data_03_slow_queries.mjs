import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("data_03_slow_queries");

  try {
    const [ext] = await sql`SELECT 1 AS ok FROM pg_extension WHERE extname='pg_stat_statements'`;
    if (!ext) {
      r.info("pg_stat_statements not installed", "cannot measure slow queries on Supabase pooled connection");
      return r.summary();
    }
  } catch (err) {
    r.info("pg_stat_statements unavailable", err.message);
    return r.summary();
  }

  try {
    const top = await sql`
      SELECT LEFT(query, 80) as q, calls, ROUND(total_exec_time::numeric, 1) as total_ms,
             ROUND(mean_exec_time::numeric, 1) as mean_ms
      FROM pg_stat_statements
      WHERE query NOT ILIKE 'BEGIN%' AND query NOT ILIKE 'COMMIT%' AND query NOT ILIKE 'SET %'
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `;
    r.info("top 10 queries by mean time (ms)");
    for (const row of top) r.info(`${row.mean_ms}ms mean, ${row.calls} calls`, row.q);
    const slow = top.filter((row) => Number(row.mean_ms) > 500);
    if (slow.length > 0) r.warn(`${slow.length} queries with mean_ms > 500`);
    else r.ok("no query with mean_ms > 500");
  } catch (err) {
    r.warn("stat query failed", err.message);
  }

  return r.summary();
}
