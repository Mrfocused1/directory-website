-- Reject active ads that have no creative (no asset_url). These shouldn't
-- have been activated in the first place — they render as blank space and
-- the advertiser paid for nothing. Flagged by money_04_billing_truthfulness.

BEGIN;

UPDATE ads
SET status = 'rejected',
    updated_at = now()
WHERE status = 'active'
  AND (asset_url IS NULL OR asset_url = '');

-- Verify: should now be zero rows
SELECT COUNT(*) AS remaining_bad
FROM ads
WHERE status = 'active' AND (asset_url IS NULL OR asset_url = '');

COMMIT;
