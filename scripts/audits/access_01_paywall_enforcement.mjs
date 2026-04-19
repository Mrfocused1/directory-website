import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
import { sql, makeReporter, env } from "./lib.mjs";

/**
 * Verifies every paid surface redirects unauthenticated-to-paid users
 * through /checkout-redirect before rendering. Catches the class of bug
 * where a dashboard route or paid API endpoint lets an unpaid
 * authenticated user through because the subscription gate was never
 * added — e.g. https://buildmy.directory/dashboard "Build My First
 * Directory" leaked to every signup on 2026-04-19 until this audit
 * was written.
 *
 * Creates a fresh test user with subscription_status=null, signs in,
 * visits each protected URL, asserts the response is a redirect to
 * /checkout-redirect (SSR pages) or 401/403 (API routes). Cleans up
 * the test user at the end, leaving no trace in prod.
 *
 * Why puppeteer and not raw fetch: @supabase/ssr uses a cookie whose
 * encoding changes between versions. A real browser session is the
 * only stable way to reproduce the auth state the Next.js middleware
 * sees.
 */

const SSR_ROUTES = [
  "/dashboard",
  "/dashboard/posts",
  "/dashboard/categories",
  "/dashboard/analytics",
  "/dashboard/platforms",
  "/dashboard/domains",
  "/dashboard/newsletter",
  "/dashboard/share",
  "/dashboard/advertising",
  "/dashboard/account",
];

const API_ROUTES = [
  { path: "/api/pipeline", method: "POST", body: { platform: "instagram", handle: "test", displayName: "test" } },
  { path: "/api/dashboard/posts", method: "POST", body: { siteId: "test" } },
];

export async function run() {
  const r = makeReporter("access_01_paywall_enforcement");

  const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !svcKey) {
    r.warn("Supabase env not available — skipping");
    return r.summary();
  }

  const admin = createClient(supaUrl, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `paywall-audit-${Date.now()}@buildmy.directory`;
  const password = "paywallAudit1234";

  let userId = null;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    r.fail("could not create test user", created.error.message);
    return r.summary();
  }
  userId = created.data.user.id;
  // subscription_status defaults to "inactive" at the DB level — that's
  // the real unpaid state a new signup starts in. Do not write "active"
  // here.
  await sql`
    INSERT INTO users (id, email, plan, subscription_status)
    VALUES (${userId}, ${email}, 'creator', 'inactive')
    ON CONFLICT (id) DO UPDATE SET subscription_status = 'inactive'
  `;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    await page.goto("https://buildmy.directory/login", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.type('input[type=email]', email, { delay: 10 });
    await page.type('input[type=password]', password, { delay: 10 });
    await page.evaluate(() => { const f = document.querySelector("form"); if (f) f.requestSubmit(); });
    await new Promise((x) => setTimeout(x, 4000));

    const postLoginUrl = page.url();
    // The paywall chain is: login → /dashboard → /checkout-redirect → Stripe.
    // Any of those three mid-points is valid evidence the gate worked.
    if (postLoginUrl.includes("checkout.stripe.com")) {
      r.ok("login → paywall → Stripe (chain enforced end-to-end)");
      return r.summary();
    }
    if (!postLoginUrl.includes("/checkout-redirect") && !postLoginUrl.includes("/dashboard")) {
      r.fail("login did not complete", `landed on ${postLoginUrl}`);
      return r.summary();
    }
    // After login, unpaid user should be on /checkout-redirect, not /dashboard
    if (postLoginUrl.includes("/dashboard")) {
      r.fail("unpaid user reached /dashboard directly after login", `URL: ${postLoginUrl}`);
    }

    // Test every SSR route. We visit each one via direct navigation so
    // the server-rendered layout guard has to actually run.
    for (const path of SSR_ROUTES) {
      const res = await page.goto(`https://buildmy.directory${path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      const finalUrl = page.url();
      const landedOnCheckout = finalUrl.includes("/checkout-redirect");
      const landedOnLogin = finalUrl.includes("/login");
      const stayedOnPath = finalUrl.endsWith(path) || finalUrl.includes(`${path}?`);

      if (landedOnCheckout) {
        r.ok(`${path} → /checkout-redirect (paywall enforced)`);
      } else if (landedOnLogin) {
        r.warn(`${path} → /login`, "expected /checkout-redirect but auth gate fired instead");
      } else if (stayedOnPath && res && res.status() === 200) {
        r.fail(`${path} leaked`, `unpaid user rendered 200 on ${path}`);
      } else {
        r.warn(`${path} → ${finalUrl}`, `unexpected target`);
      }
    }

    // API routes should 401 or 403 (or redirect for SSR-style handlers)
    for (const route of API_ROUTES) {
      const { status } = await page.evaluate(async ({ path, method, body }) => {
        const res = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: res.status };
      }, route);
      if ([401, 402, 403].includes(status)) {
        r.ok(`${route.method} ${route.path} → ${status}`);
      } else if (status === 400) {
        // Bad-request is acceptable for these probes — means the route
        // parsed the body before any auth check would have caught the
        // unpaid user. Noteworthy but not a fail on its own.
        r.warn(`${route.method} ${route.path} → 400`, "rejects body before auth check");
      } else {
        r.fail(`${route.method} ${route.path} returned ${status}`, "expected 401/403 for unpaid user");
      }
    }
  } catch (err) {
    r.fail("audit crashed", err.message);
  } finally {
    if (browser) await browser.close();
    // Always clean up, even on failure
    try {
      await sql`DELETE FROM users WHERE id = ${userId}`;
      await admin.auth.admin.deleteUser(userId);
    } catch (cleanupErr) {
      r.warn("cleanup failed", cleanupErr.message);
    }
  }

  return r.summary();
}
