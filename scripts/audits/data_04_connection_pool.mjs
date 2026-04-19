import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("data_04_connection_pool");

  try {
    const [activity] = await sql`
      SELECT COUNT(*) FILTER (WHERE state = 'active')::int as active,
             COUNT(*) FILTER (WHERE state = 'idle')::int as idle,
             COUNT(*)::int as total
      FROM pg_stat_activity
    `;
    r.info(`active connections`, `${activity.active}`);
    r.info(`idle connections`, `${activity.idle}`);
    r.info(`total connections`, `${activity.total}`);

    try {
      const [maxc] = await sql`SHOW max_connections`;
      const max = parseInt(maxc.max_connections, 10);
      const ratio = activity.total / max;
      r.info("max_connections", `${max}`);
      r.info("pool usage", `${(ratio * 100).toFixed(1)}%`);
      if (ratio > 0.8) r.fail("pool >80% utilized", `${activity.total}/${max}`);
      else if (ratio > 0.6) r.warn("pool >60% utilized", `${activity.total}/${max}`);
      else r.ok("pool utilization healthy");
    } catch {
      r.info("SHOW max_connections not permitted on pooled connection");
    }
  } catch (err) {
    r.warn("pg_stat_activity query failed", err.message);
  }

  return r.summary();
}
