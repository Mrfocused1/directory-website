/**
 * Checkly browser check — full signup flow in a real browser.
 *
 * Hits /login, flips to signup mode, submits with a dummy email,
 * verifies the "check your email" confirmation renders. One
 * behavioral assertion per hour from eu-west-1.
 *
 * Intentionally uses a never-confirmed email so we don't pollute
 * the users table. The /api/auth/signup endpoint creates the auth
 * row, but without clicking the confirmation link the user never
 * reaches /dashboard.
 */

import { test, expect } from "@playwright/test";

test("signup form produces confirmation state", async ({ page }) => {
  await page.goto("https://buildmy.directory/login");

  // Flip to signup mode if not already
  const signupBtn = page.locator("button", { hasText: /^sign up$/i });
  if (await signupBtn.isVisible().catch(() => false)) {
    await signupBtn.click();
  }

  const stamp = Date.now().toString(36);
  await page.locator('input[type="email"]').fill(`checkly-${stamp}@example.com`);
  await page.locator('input[type="password"]').fill("checkly-pw-12345");
  await page.locator('form button[type="submit"]').click();

  // Expect the confirmation message within 10s
  await expect(page.locator("body")).toContainText(/check your email|confirmation link/i, {
    timeout: 10_000,
  });
});
