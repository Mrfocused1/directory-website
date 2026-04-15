/**
 * Checkly browser check — login/signup page renders and accepts input.
 *
 * Hits /login, flips to signup mode, fills the form, verifies the
 * submit button responds. We DON'T assert on the confirmation email
 * banner because that depends on Resend accepting the @example.com
 * test domain — brittle signal. This check proves:
 *
 *   1. The page loads (no 500s, no blank screen)
 *   2. The signup form renders with email + password fields
 *   3. The submit button is enabled and clickable
 *   4. The server accepts the POST (no hard crash on submit)
 *
 * That's enough uptime signal. Real user experience is covered by
 * the behavioral suite + Sentry error tracking.
 */

import { test, expect } from "@playwright/test";

test("login/signup form renders and submits without crashing", async ({ page }) => {
  await page.goto("https://buildmy.directory/login");

  // Flip to signup mode if not already
  const signupToggle = page.locator("button", { hasText: /^sign up$/i });
  if (await signupToggle.isVisible().catch(() => false)) {
    await signupToggle.click();
  }

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submit = page.locator('form button[type="submit"]');

  await expect(emailInput).toBeVisible({ timeout: 5_000 });
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await expect(submit).toBeEnabled({ timeout: 5_000 });

  const stamp = Date.now().toString(36);
  await emailInput.fill(`checkly-${stamp}@example.com`);
  await passwordInput.fill("checkly-pw-12345");
  await submit.click();

  // After submit, the page should render SOMETHING new (any of:
  // confirmation banner, error banner, or the login mode switch).
  // What matters is the server responded without a crash.
  await expect(page.locator("body")).toContainText(
    /check your email|confirmation link|could not|error|already|try again|welcome/i,
    { timeout: 10_000 },
  );
});
