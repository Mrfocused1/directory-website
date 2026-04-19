import Stripe from "stripe";

/**
 * Picks the Stripe key at import time:
 *   - STRIPE_TEST_MODE=true → use STRIPE_TEST_SECRET_KEY
 *   - otherwise → STRIPE_SECRET_KEY (live)
 *
 * Test-mode keys start with `sk_test_...` and charge no real money;
 * they're isolated from your live Stripe account. Flipping the env
 * var in Vercel previews lets us run end-to-end checkout tests
 * without touching production billing.
 */
const useTest = process.env.STRIPE_TEST_MODE === "true";
const KEY = useTest
  ? process.env.STRIPE_TEST_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;

// Use fetch-based HTTP client on serverless — Node's default https agent
// reuses TCP connections that Stripe's side closes between warm
// invocations, producing StripeConnectionError on the next request.
const stripe = KEY
  ? new Stripe(KEY, {
      apiVersion: "2026-03-25.dahlia",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

export { stripe };
export const isStripeTestMode = useTest;
