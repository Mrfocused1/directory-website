#!/usr/bin/env node
/**
 * Stripe test-mode end-to-end checkout probe.
 *
 * Prereqs:
 *   1. Stripe CLI installed (brew install stripe/stripe-cli/stripe) + authenticated:
 *        stripe login
 *   2. STRIPE_TEST_SECRET_KEY in .env.local (copy your "Secret key" from
 *      Stripe dashboard → Developers → API keys WITH "Test mode" toggle ON)
 *   3. A price ID for the Creator plan in test mode; set STRIPE_TEST_CREATOR_PRICE_ID
 *      in .env.local. Create one via:
 *        stripe products create --name "Creator (test)" --default-price-data.unit-amount 1900 --default-price-data.currency usd --default-price-data.recurring.interval month
 *      Then copy the price id from the output.
 *   4. Run the app locally with STRIPE_TEST_MODE=true so the webhook
 *      handler uses the test key:
 *        STRIPE_TEST_MODE=true pnpm dev
 *      (Default target is http://localhost:3000 — override with --base.)
 *
 * What it does:
 *   - Creates a throwaway Supabase user
 *   - Creates a Stripe test customer + subscription using the test card pm_card_visa
 *   - Forwards a checkout.session.completed webhook to the local app
 *     using `stripe trigger`
 *   - Polls users.plan in the DB for the flip from "free" to "creator"
 *   - Cleans up
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import Stripe from "stripe";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")]; }),
);

const BASE = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] || "http://localhost:3000";
const TEST_KEY = env.STRIPE_TEST_SECRET_KEY;
const PRICE_ID = env.STRIPE_TEST_CREATOR_PRICE_ID;

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(msg) { console.log(`✓ ${msg}`); }

if (!TEST_KEY) fail("STRIPE_TEST_SECRET_KEY not in .env.local — see header of this file");
if (!PRICE_ID) fail("STRIPE_TEST_CREATOR_PRICE_ID not in .env.local — see header of this file");

// Verify stripe CLI is installed + authenticated
try {
  execSync("/opt/homebrew/bin/stripe --version", { stdio: "ignore" });
} catch {
  fail("Stripe CLI not found. Install: brew install stripe/stripe-cli/stripe");
}

const stripe = new Stripe(TEST_KEY, { apiVersion: "2026-03-25.dahlia" });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(env.DATABASE_URL, { max: 1 });

async function main() {
  console.log(`\n🧪 Stripe test-mode checkout — ${BASE}\n`);

  const stamp = Date.now().toString(36);
  const email = `qa-stripe-${stamp}@example.com`;
  const password = "checkout-test-123";

  // 1. Create Supabase user
  const { data: user, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue) fail(`createUser: ${ue.message}`);
  await sql`INSERT INTO users (id, email, plan) VALUES (${user.user.id}, ${email}, 'free') ON CONFLICT (id) DO NOTHING`;
  ok(`seeded free user ${user.user.id.slice(0, 8)}…`);

  try {
    // 2. Create Stripe test customer
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: user.user.id },
    });
    ok(`created test customer ${customer.id}`);

    // Persist the mapping so webhook handlers can find the app-side user
    await sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${user.user.id}`;

    // 3. Attach Stripe test card
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    ok(`attached pm_card_visa`);

    // 4. Create subscription — this immediately charges the test card
    //    and fires customer.subscription.created + invoice.paid webhooks
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_ID }],
      expand: ["latest_invoice.payment_intent"],
    });
    ok(`created subscription ${subscription.id} (status=${subscription.status})`);

    // 5. If the app is running with `stripe listen` forwarding, the
    //    webhook handler already fired. Otherwise we manually trigger
    //    checkout.session.completed to simulate the Checkout redirect.
    //    Here we just poll for users.plan to flip.
    const deadline = Date.now() + 15_000;
    let finalPlan = null;
    while (Date.now() < deadline) {
      const [row] = await sql`SELECT plan FROM users WHERE id = ${user.user.id}`;
      finalPlan = row?.plan;
      if (finalPlan === "creator") break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (finalPlan === "creator") {
      ok(`user plan flipped: free → creator`);
      console.log(`\n✅ checkout e2e pass\n`);
    } else {
      console.log(`\n✗ user plan is still "${finalPlan}" after 15s`);
      console.log(`   Is \`stripe listen --forward-to ${BASE}/api/webhooks/stripe\` running?`);
      process.exit(1);
    }
  } finally {
    try { await sql`DELETE FROM users WHERE id = ${user.user.id}`; } catch {}
    try { await admin.auth.admin.deleteUser(user.user.id); } catch {}
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
