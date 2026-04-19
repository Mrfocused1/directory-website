/**
 * Backfill users.stripe_customer_id for paid users missing one.
 *
 * Flagged by money_01_subscription_drift.
 *
 * Default mode: DRY RUN — looks up each user's email in Stripe and prints
 * what it WOULD write. No DB writes, no Stripe writes, only reads.
 * Pass --apply to actually write the customer IDs into the users row.
 *
 *   node scripts/audits/fixes/stripe-backfill-customer-ids.mjs
 *   node scripts/audits/fixes/stripe-backfill-customer-ids.mjs --apply
 *
 * Stripe cost: one customers.search call per affected user. Search is free.
 */

import { sql } from "../lib.mjs";
import Stripe from "stripe";

const apply = process.argv.includes("--apply");
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey) {
  console.error("STRIPE_SECRET_KEY not set — load from .env.local before running");
  process.exit(1);
}

const stripe = new Stripe(stripeKey);

const users = await sql`
  SELECT id, email, plan, created_at
  FROM users
  WHERE plan != 'free'
    AND subscription_status = 'active'
    AND stripe_customer_id IS NULL
  ORDER BY created_at
`;

console.log(`Found ${users.length} paid users with no stripe_customer_id`);
console.log(apply ? "MODE: APPLY (will write DB)" : "MODE: DRY RUN (reads only)");
console.log("");

let wouldWrite = 0;
let notFound = 0;
let ambiguous = 0;

for (const u of users) {
  const redacted = `${u.email.slice(0, 3)}***@${u.email.split("@")[1]}`;
  try {
    const result = await stripe.customers.search({ query: `email:"${u.email}"` });
    if (result.data.length === 0) {
      console.log(`  × ${redacted} — no Stripe customer found`);
      notFound++;
      continue;
    }
    if (result.data.length > 1) {
      console.log(`  ! ${redacted} — ${result.data.length} Stripe customers (ambiguous, skipping)`);
      ambiguous++;
      continue;
    }
    const customer = result.data[0];
    console.log(`  ✓ ${redacted} → ${customer.id}${apply ? " (writing)" : " (would write)"}`);
    wouldWrite++;
    if (apply) {
      await sql`UPDATE users SET stripe_customer_id = ${customer.id}, updated_at = now() WHERE id = ${u.id}`;
    }
  } catch (err) {
    console.log(`  ! ${redacted} — lookup failed: ${err.message}`);
  }
}

console.log("");
console.log(`Matched:     ${wouldWrite}`);
console.log(`Not found:   ${notFound}`);
console.log(`Ambiguous:   ${ambiguous}`);
if (!apply && wouldWrite > 0) console.log(`\nRe-run with --apply to write ${wouldWrite} customer IDs into the DB.`);

await sql.end();
