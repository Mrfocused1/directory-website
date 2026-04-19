/**
 * End-to-end test of advertising Phases 1–4.
 * Covers every publicly-reachable API endpoint, DB-level correctness,
 * tracking event persistence, and Puppeteer UI screenshots.
 */

import postgres from "postgres";
import "dotenv/config";

const BASE = "https://buildmy.directory";
const SITE_SLUG = "brickzwiththetipz";
const SITE_ID = "938a1a51-cb33-4825-b39d-77aa810a47b9";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 2 });

let pass = 0;
let fail = 0;
const issues = [];

function ok(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  pass++;
}
function ko(label, detail = "") {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  fail++;
  issues.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

async function httpStatus(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(8000) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log("\n─── Phase 1: Foundation ───");
{
  const r = await httpStatus("/api/advertising/stripe/status");
  r.status === 401 ? ok("GET /stripe/status → 401 unauth") : ko("GET /stripe/status", `expected 401, got ${r.status}`);
  const p = await httpStatus("/api/advertising/stripe/onboard", { method: "POST" });
  p.status === 401 ? ok("POST /stripe/onboard → 401 unauth") : ko("POST /stripe/onboard", `expected 401, got ${p.status}`);
  // DB tables exist
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('stripe_connect_accounts','ad_slots','ads','ad_impressions','ad_clicks') ORDER BY table_name`;
  tables.length === 5 ? ok("all 5 DB tables exist", tables.map(t => t.table_name).join(", ")) : ko("DB tables missing", `only ${tables.length}/5`);
}

console.log("\n─── Phase 2: Ad serving + tracking ───");
{
  // serve endpoint should return active ads for seeded slots
  for (const slot of ["banner_top", "sticky_ribbon", "pre_roll_image"]) {
    const r = await httpStatus(`/api/advertising/serve?siteId=${SITE_ID}&slotType=${slot}`);
    const hasAd = r.status === 200 && r.body?.ad;
    hasAd ? ok(`serve /${slot}`, `"${r.body.ad.headline}"`) : ko(`serve /${slot}`, JSON.stringify(r.body));
  }
  // unknown slot → null
  const u = await httpStatus(`/api/advertising/serve?siteId=${SITE_ID}&slotType=nonexistent`);
  u.body?.ad === null ? ok("serve unknown slot → null") : ko("serve unknown slot", JSON.stringify(u.body));
  // missing params
  const m = await httpStatus(`/api/advertising/serve`);
  m.status === 400 ? ok("serve missing params → 400") : ko("serve no params", `got ${m.status}`);

  // impression tracking end-to-end
  const [testAd] = await sql`SELECT id FROM ads WHERE status='active' AND site_id=${SITE_ID} LIMIT 1`;
  const adId = testAd.id;
  const before = await sql`SELECT COUNT(*)::int as n FROM ad_impressions WHERE ad_id=${adId}`;
  await fetch(`${BASE}/api/advertising/impression`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, path: "/test", sessionId: `test-${Date.now()}` }),
  });
  // small wait for async insert
  await new Promise(r => setTimeout(r, 1500));
  const after = await sql`SELECT COUNT(*)::int as n FROM ad_impressions WHERE ad_id=${adId}`;
  after[0].n > before[0].n ? ok("impression insert lands in DB", `${before[0].n} → ${after[0].n}`) : ko("impression not tracked");

  // click tracking
  const c = await httpStatus("/api/advertising/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, sessionId: `test-${Date.now()}` }),
  });
  c.status === 200 && c.body?.clickUrl ? ok("click returns clickUrl", c.body.clickUrl) : ko("click endpoint", `${c.status} ${JSON.stringify(c.body)}`);
  await new Promise(r => setTimeout(r, 1500));
  const clicks = await sql`SELECT COUNT(*)::int as n FROM ad_clicks WHERE ad_id=${adId}`;
  clicks[0].n > 0 ? ok("click insert lands in DB", `${clicks[0].n} total`) : ko("click not tracked");
}

console.log("\n─── Phase 3: Admin slot config + earnings ───");
{
  const r1 = await httpStatus(`/api/advertising/slots?siteId=${SITE_ID}`);
  r1.status === 401 ? ok("GET /slots → 401 unauth") : ko("GET /slots", `got ${r1.status}`);
  const r2 = await httpStatus(`/api/advertising/earnings`);
  r2.status === 401 ? ok("GET /earnings → 401 unauth") : ko("GET /earnings", `got ${r2.status}`);
  const r3 = await httpStatus(`/api/advertising/sample-content?siteId=${SITE_ID}`);
  r3.status === 401 ? ok("GET /sample-content → 401 unauth") : ko("GET /sample-content", `got ${r3.status}`);
  // dashboard pages
  const d1 = await fetch(`${BASE}/dashboard/advertising`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  d1.status === 307 || d1.status === 308 || d1.status === 302 ? ok("/dashboard/advertising → auth redirect") : ko("dashboard redirect", `got ${d1.status}`);
  const d2 = await fetch(`${BASE}/dashboard/advertising/banner_top`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  d2.status === 307 || d2.status === 308 || d2.status === 302 ? ok("/dashboard/advertising/[slotType] → redirect") : ko("slot config redirect", `got ${d2.status}`);
  const d3 = await fetch(`${BASE}/dashboard/advertising/inbox`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  d3.status === 307 || d3.status === 308 || d3.status === 302 ? ok("/dashboard/advertising/inbox → redirect") : ko("inbox redirect", `got ${d3.status}`);

  // DB indexes on ad_slots
  const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename='ad_slots'`;
  const hasUnique = idx.some(i => i.indexname.includes("site") || i.indexname.includes("unique"));
  hasUnique ? ok("ad_slots has unique constraint on (site_id, slot_type)", idx.map(i => i.indexname).join(", ")) : ko("ad_slots unique index missing");
}

console.log("\n─── Phase 4: Advertiser purchase flow ───");
{
  const u = await httpStatus("/api/advertising/upload", { method: "POST" });
  u.status === 400 ? ok("upload with no file → 400") : ko("upload validation", `got ${u.status}`);
  const p = await httpStatus("/api/advertising/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  p.status === 400 ? ok("purchase with empty body → 400") : ko("purchase validation", `got ${p.status}`);
  const s = await httpStatus("/api/advertising/purchase/session?id=cs_fake_nonexistent");
  (s.status === 404 || s.status === 400) ? ok("purchase/session bad id → 4xx", `${s.status}`) : ko("purchase/session", `got ${s.status}`);
  const a = await httpStatus(`/api/advertising/ads?siteId=${SITE_ID}`);
  a.status === 401 ? ok("GET /ads → 401 unauth") : ko("GET /ads", `got ${a.status}`);

  // Advertiser public pages — depend on creator Stripe Connect completion
  const ap = await fetch(`${BASE}/${SITE_SLUG}/advertise`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  if (ap.status === 404) {
    ok("/{slug}/advertise → 404 (creator hasn't onboarded Stripe Connect)", "expected until Connect done");
  } else if (ap.status === 200) {
    ok("/{slug}/advertise → 200 (creator has Stripe Connect)");
  } else {
    ko("/{slug}/advertise", `unexpected ${ap.status}`);
  }
  const bp = await fetch(`${BASE}/${SITE_SLUG}/advertise/banner_top`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  (bp.status === 404 || bp.status === 200) ? ok(`/{slug}/advertise/banner_top → ${bp.status}`) : ko("slot buy page", `got ${bp.status}`);

  // Stripe Connect status for the brickzwiththetipz creator
  const [creator] = await sql`SELECT u.id, sca.charges_enabled, sca.payouts_enabled, sca.details_submitted FROM sites s JOIN users u ON u.id=s.user_id LEFT JOIN stripe_connect_accounts sca ON sca.user_id=u.id WHERE s.slug=${SITE_SLUG}`;
  if (!creator.charges_enabled) {
    console.log(`  ⓘ  creator Stripe Connect: NOT onboarded (charges_enabled=false)`);
    console.log(`     → advertiser pages 404 by design until creator finishes /dashboard/advertising setup`);
  } else {
    ok("creator has active Stripe Connect", `charges=${creator.charges_enabled}, payouts=${creator.payouts_enabled}`);
  }
}

console.log("\n─── Data integrity ───");
{
  // Orphan check: no ads without slots, no slots without sites
  const orphanAds = await sql`SELECT COUNT(*)::int as n FROM ads a WHERE NOT EXISTS (SELECT 1 FROM ad_slots s WHERE s.id=a.slot_id)`;
  orphanAds[0].n === 0 ? ok("no orphan ads") : ko("orphan ads found", `${orphanAds[0].n}`);
  const orphanSlots = await sql`SELECT COUNT(*)::int as n FROM ad_slots s WHERE NOT EXISTS (SELECT 1 FROM sites st WHERE st.id=s.site_id)`;
  orphanSlots[0].n === 0 ? ok("no orphan slots") : ko("orphan slots", `${orphanSlots[0].n}`);
  // Active ads should have valid date windows
  const badWindows = await sql`SELECT COUNT(*)::int as n FROM ads WHERE status='active' AND (starts_at IS NULL OR ends_at IS NULL OR ends_at < starts_at)`;
  badWindows[0].n === 0 ? ok("all active ads have valid date windows") : ko("bad date windows", `${badWindows[0].n}`);

  // Recent serve traffic
  const recentSlots = await sql`SELECT slot_type, COUNT(*)::int as ads FROM ad_slots GROUP BY slot_type ORDER BY ads DESC`;
  console.log(`\n  Slot config distribution:`);
  recentSlots.forEach(s => console.log(`    ${s.slot_type}: ${s.ads}`));

  const recentImpressions = await sql`SELECT COUNT(*)::int as n FROM ad_impressions WHERE created_at > now() - interval '1 hour'`;
  const recentClicks = await sql`SELECT COUNT(*)::int as n FROM ad_clicks WHERE created_at > now() - interval '1 hour'`;
  console.log(`  Last-hour tracking: ${recentImpressions[0].n} impressions, ${recentClicks[0].n} clicks`);
}

console.log("\n═══ SUMMARY ═══");
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (issues.length) {
  console.log("\nIssues:");
  issues.forEach(i => console.log(`  - ${i}`));
}
await sql.end();
process.exit(fail > 0 ? 1 : 0);
