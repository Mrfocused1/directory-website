import { sql, makeReporter } from "./lib.mjs";

/**
 * Detects state-machine transitions that entered a state but never left
 * it. The sweep-stuck-states Inngest cron fires every 5 min to clear
 * these, but if the cron itself has stopped running (or a new state
 * machine is added without being swept), this audit catches it.
 *
 * Read-only — this audit never writes. For the remediation, see
 * src/lib/inngest/stuck-states.ts.
 */
export async function run() {
  const r = makeReporter("state_01_stuck_transitions");

  // 1. Pipeline jobs "running" > 15 min (the cron runs at 10 min; 15 gives margin)
  const [stalePipelines] = await sql`
    SELECT COUNT(*)::int AS n FROM pipeline_jobs
    WHERE status = 'running'
      AND started_at < now() - interval '15 minutes'
  `;
  stalePipelines.n === 0
    ? r.ok("no pipeline_jobs stuck 'running' past 15 min")
    : r.fail("pipeline_jobs stuck in 'running'", `${stalePipelines.n} job(s)`);

  // 2. Ads stuck 'pending_review' past starts_at
  const [stalePending] = await sql`
    SELECT COUNT(*)::int AS n FROM ads
    WHERE status = 'pending_review'
      AND starts_at < now()
  `;
  stalePending.n === 0
    ? r.ok("no ads stuck 'pending_review' past starts_at")
    : r.fail("ads pending_review past starts_at", `${stalePending.n} — sweep cron not running?`);

  // 3. Ads "active" past ends_at — same finding as money_04 but framed as stuck state
  const [staleActive] = await sql`
    SELECT COUNT(*)::int AS n FROM ads
    WHERE status = 'active'
      AND ends_at < now()
  `;
  staleActive.n === 0
    ? r.ok("no ads 'active' past ends_at")
    : r.fail("ads active past ends_at", `${staleActive.n} — should be 'expired'`);

  // 4. custom_domains stuck 'pending' > 30 days — no auto-verify cron today
  const [staleDomains] = await sql`
    SELECT COUNT(*)::int AS n FROM custom_domains
    WHERE status = 'pending' AND created_at < now() - interval '30 days'
  `;
  staleDomains.n === 0
    ? r.ok("no custom_domains stuck 'pending' >30d")
    : r.warn("custom_domains stuck 'pending' >30d", `${staleDomains.n} — needs manual verify`);

  // 5. Unverified subscribers > 30 days — verification email probably lost
  const [unverifiedStale] = await sql`
    SELECT COUNT(*)::int AS n FROM subscribers
    WHERE is_verified = false AND created_at < now() - interval '30 days'
  `;
  unverifiedStale.n === 0
    ? r.ok("no subscribers stuck unverified >30d")
    : r.warn("subscribers unverified >30d (likely abandoned)", `${unverifiedStale.n}`);

  // 6. Cron-itself health: if sweep-stuck-states is running, #2 and #3
  // should be rare. If these are non-zero, the cron is broken.

  return r.summary();
}
