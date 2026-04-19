# Data-level audit findings — manual review required

Generated 2026-04-19 from `scripts/audits/run-all.mjs`. These 3 FAILs cannot be
auto-fixed because they require live Stripe API calls or human judgment about
test vs real data. Review each, then run the matching SQL from `./sql/` if you
agree with the plan.

## 1. Five paid users missing `stripe_customer_id`

| email (redacted) | created | plan |
|---|---|---|
| nis***@buildmy.directory | 2026-04-17 | creator |
| aud***@test.com | 2026-04-17 | creator |
| the***@gmail.com | 2026-04-17 | creator |
| pik***@gmail.com | 2026-04-18 | creator |
| ahk***@gmail.com | 2026-04-19 | creator |

**Why it matters:** without `stripe_customer_id`, `/api/billing/portal`,
invoice emails, and cancellation flows silently skip these users.

**Likely causes:**
- Manually promoted in SQL (bypassed the checkout flow that sets the FK).
- Or: checkout.session.completed webhook dropped the customer ID lookup.

**Choose a fix per row:**
- If they're real paying customers → call Stripe `customers.search` by email,
  write the returned ID into the row. Script: `./stripe-backfill-customer-ids.mjs`
  (read-only by default, requires `--apply` to write).
- If they're test/internal accounts → either revoke the plan or leave the row
  but flip `subscription_status` to `inactive`.
- If you're not sure → look up each email in Stripe Dashboard manually first.

## 2. One active ad without `asset_url`

```
id       = 62ce94be-…
site     = brickzwiththetipz
headline = "Limited time offer"
amount   = $50.00
status   = active
```

This is almost certainly the Phase 2 dev-seeded ad (inserted via SQL during
sticky-ribbon testing, not via the upload endpoint). An ad with no
`asset_url` renders empty and shouldn't be served. Fix: mark it rejected.

Run: `psql "$DATABASE_URL" -f ./sql/001_reject_orphan_ads.sql`

## 3. Active ad on a creator without Stripe Connect

- `brickzwiththetipz` has active ads, but the creator has no
  `stripe_connect_accounts` row (`charges_enabled = false`).
- You already know this one — Connect onboarding is a pending todo for that
  site. Nothing to fix in SQL; just finish onboarding in the UI:
  `/dashboard/advertising` → "Start earning" → follow the Stripe flow.

---

## Recommendation

1. Run `./sql/001_reject_orphan_ads.sql` to clean up finding 2.
2. Eyeball finding 1's emails in your Stripe dashboard and decide per row.
   If you want to auto-backfill, run the script (write mode requires opt-in).
3. Finish Stripe Connect onboarding for brickzwiththetipz to close finding 3.

After each, re-run `node scripts/audits/run-all.mjs` — FAIL count should drop.
