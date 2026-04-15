import { defineConfig } from "checkly";
import { Frequency } from "checkly/constructs";

/**
 * Checkly configuration — multi-region synthetic monitoring + latency
 * tracking for https://buildmy.directory.
 *
 * Two kinds of checks:
 *
 *  1. API checks every 5 min from 3 regions — homepage + key API
 *     endpoints. Alerts on 2 consecutive failures (dismisses transient
 *     blips from, e.g., Vercel cold starts).
 *
 *  2. Browser checks hourly — import scripts/test-agent/behavioral.mjs
 *     via separate .check.ts specs so each runs independently. Keeps
 *     us within the free-tier's 1,500 browser runs/mo (43 tests × 24
 *     runs/day × 1 region = 1,032/mo, leaves headroom).
 *
 * Deploy with: `npx checkly deploy`
 * Requires CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID in env.
 */

export default defineConfig({
  projectName: "buildmy-directory",
  logicalId: "buildmy-directory",
  repoUrl: "https://github.com/Mrfocused1/directory-website",
  checks: {
    // Budget math for Hobby tier (10k API + 1.5k browser runs/mo):
    //   6 API checks × 2 regions × 1 run/hr × 24 × 30 = 8,640 / 10,000
    //   1 browser check × 1 region × 1 run/hr × 24 × 30 = 720 / 1,500
    // ~14 % headroom on API, ~52 % on browser.
    //
    // Hourly cadence still catches prod outages within ~1 hour; the
    // Sentry alert rules catch crashes faster for paying-customer
    // paths. If we add more checks, bump to Team plan ($30/mo).
    locations: ["us-east-1", "eu-west-1"],
    tags: ["prod"],
    runtimeId: "2024.02",
    frequency: Frequency.EVERY_1H,
    checkMatch: "src/**/*.check.{js,ts}",
    browserChecks: {
      testMatch: "scripts/test-agent/*.check.ts",
      frequency: Frequency.EVERY_1H,
      locations: ["eu-west-1"],
    },
  },
  cli: {
    runLocation: "eu-west-1",
    // Slack/email alerts are wired up in the dashboard rather than
    // here — less churn when alert routing changes.
  },
});
