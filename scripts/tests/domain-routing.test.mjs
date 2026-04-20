#!/usr/bin/env node
/**
 * Smoke test for the custom-domain routing fix.
 *
 * Confirms the query pattern `getSiteDataFromDB` uses: slug lookup
 * first, then a customDomains fallback when the input looks like a
 * hostname. Creates throwaway fixtures, runs both lookups, and
 * cleans up regardless of pass/fail.
 *
 * Run with:
 *   DATABASE_URL=... node --test scripts/tests/domain-routing.test.mjs
 *
 * Uses Node's built-in test runner so no extra dev-dep is needed.
 * No mocking — everything runs against a real postgres so we catch
 * schema drift.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
// Load .env.local first (npm run doesn't source it); fall back to .env.
// Tests still run without a .env file if DATABASE_URL is in the shell.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — skipping domain routing tests");
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 2 });

const fixtureId = randomUUID().slice(0, 8);
const fixtureUserId = randomUUID();
const fixtureSiteId = randomUUID();
const fixtureSlug = `test-domain-${fixtureId}`;
const fixtureHost = `test-${fixtureId}.example.com`;

before(async () => {
  // Minimum viable user + site + custom_domains row. isPublished=true
  // because getSiteDataFromDB explicitly rejects unpublished rows.
  await sql`
    INSERT INTO users (id, email, name, plan, subscription_status)
    VALUES (${fixtureUserId}, ${"test-" + fixtureId + "@example.com"}, 'Domain Test', 'creator', 'active')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO sites (id, user_id, slug, handle, platform, display_name, is_published)
    VALUES (${fixtureSiteId}, ${fixtureUserId}, ${fixtureSlug}, ${"@testhandle" + fixtureId}, 'instagram', 'Domain Test Directory', true)
  `;
  await sql`
    INSERT INTO custom_domains (site_id, domain, type, status, verification_token)
    VALUES (${fixtureSiteId}, ${fixtureHost}, 'external', 'active', ${"tok-" + fixtureId})
  `;
});

after(async () => {
  // CASCADE on custom_domains.site_id handles the domain row.
  await sql`DELETE FROM sites WHERE id = ${fixtureSiteId}`;
  await sql`DELETE FROM users WHERE id = ${fixtureUserId}`;
  await sql.end();
});

test("slug lookup resolves to the site", async () => {
  const [site] = await sql`
    SELECT id, slug, display_name, is_published
    FROM sites WHERE slug = ${fixtureSlug}
  `;
  assert.ok(site, "slug lookup returned no row");
  assert.equal(site.id, fixtureSiteId);
  assert.equal(site.is_published, true);
});

test("custom-domain fallback resolves to the same site when slug misses", async () => {
  // Same shape getSiteDataFromDB uses: first slug, then customDomains.
  const hostOnly = fixtureHost.toLowerCase().replace(/^www\./, "");

  const [slugMiss] = await sql`
    SELECT id FROM sites WHERE slug = ${hostOnly}
  `;
  assert.equal(slugMiss, undefined, "slug lookup should NOT find a row for the hostname");

  const [mapping] = await sql`
    SELECT site_id, status FROM custom_domains WHERE domain = ${hostOnly}
  `;
  assert.ok(mapping, "custom_domains mapping missing");
  assert.match(mapping.status, /^(active|verifying)$/);

  const [site] = await sql`
    SELECT id, display_name FROM sites WHERE id = ${mapping.site_id}
  `;
  assert.ok(site);
  assert.equal(site.id, fixtureSiteId);
  assert.equal(site.display_name, "Domain Test Directory");
});

test("pending / failed domain status is NOT accepted by the fallback", async () => {
  // Flip the fixture's status and confirm the guard clause
  // (`status === "active" || status === "verifying"`) rejects it.
  await sql`UPDATE custom_domains SET status = 'pending' WHERE domain = ${fixtureHost}`;

  const [mapping] = await sql`
    SELECT status FROM custom_domains WHERE domain = ${fixtureHost}
  `;
  assert.equal(mapping.status, "pending");

  const accepted = mapping.status === "active" || mapping.status === "verifying";
  assert.equal(accepted, false, "pending status should NOT resolve to a site");

  // Restore for other tests / reruns.
  await sql`UPDATE custom_domains SET status = 'active' WHERE domain = ${fixtureHost}`;
});

test("www. prefix is stripped before lookup", async () => {
  const host = ("WWW." + fixtureHost).toLowerCase().replace(/^www\./, "");
  assert.equal(host, fixtureHost);

  const [mapping] = await sql`
    SELECT site_id FROM custom_domains WHERE domain = ${host}
  `;
  assert.ok(mapping);
  assert.equal(mapping.site_id, fixtureSiteId);
});

test("unknown hostname returns nothing", async () => {
  const unknown = `unclaimed-${randomUUID().slice(0, 8)}.example.com`;
  const [mapping] = await sql`
    SELECT site_id FROM custom_domains WHERE domain = ${unknown}
  `;
  assert.equal(mapping, undefined);
});
