import { sql, makeReporter } from "./lib.mjs";

export async function run() {
  const r = makeReporter("sec_03_api_key_hygiene");

  const total = await sql`SELECT COUNT(*)::int as n FROM api_keys`;
  r.info("total API keys issued", `${total[0].n}`);

  if (total[0].n === 0) {
    r.ok("no api_keys issued yet — nothing to audit");
    return r.summary();
  }

  const neverUsed = await sql`
    SELECT COUNT(*)::int as n FROM api_keys
    WHERE last_used_at IS NULL AND created_at < now() - interval '30 days'
  `;
  neverUsed[0].n === 0
    ? r.ok("no keys older than 30d that were never used")
    : r.warn("keys >30d old never used — candidates for revoke", `${neverUsed[0].n}`);

  const stale = await sql`
    SELECT COUNT(*)::int as n FROM api_keys
    WHERE last_used_at IS NOT NULL AND last_used_at < now() - interval '90 days'
  `;
  stale[0].n === 0 ? r.ok("no keys idle >90d") : r.warn("keys idle >90d", `${stale[0].n}`);

  const weakLabels = await sql`
    SELECT COUNT(*)::int as n FROM api_keys
    WHERE label IS NULL OR length(label) < 3 OR label ILIKE 'test%' OR label ILIKE 'temp%'
  `;
  weakLabels[0].n === 0 ? r.ok("all keys have descriptive labels") : r.warn("keys with weak/test labels", `${weakLabels[0].n}`);

  const dupHash = await sql`
    SELECT key_hash, COUNT(*)::int as n FROM api_keys GROUP BY key_hash HAVING COUNT(*) > 1
  `;
  dupHash.length === 0 ? r.ok("no duplicate key hashes") : r.fail("duplicate key hashes (rotation/collision bug)", `${dupHash.length}`);

  return r.summary();
}
