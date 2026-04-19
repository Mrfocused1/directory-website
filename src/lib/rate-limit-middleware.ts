import { NextRequest, NextResponse } from "next/server";
import { createLimiter } from "@/lib/rate-limit";

/** Auth endpoints (signup, reset-password): 5 req/min */
export const authLimiter = createLimiter({ max: 5, window: "1m", prefix: "auth" });

/** Email-sending endpoints (subscribe, contact): 3 req/min */
export const emailLimiter = createLimiter({ max: 3, window: "1m", prefix: "email" });

/** General public API endpoints: 30 req/min */
export const apiLimiter = createLimiter({ max: 30, window: "1m", prefix: "api" });

/**
 * Per-site sync throttle: 1 manual sync per hour.
 * Key on siteId so each creator can sync their own site once per hour
 * regardless of IP. Daily cron runs in parallel and bypasses this
 * limiter (it calls runSync directly via Inngest).
 */
export const siteSyncLimiter = createLimiter({ max: 1, window: "1h", prefix: "site-sync" });

/**
 * Ad creative uploads: 5 per IP per hour.
 * Prevents storage abuse from unauthenticated public upload endpoint.
 */
export const adUploadLimiter = createLimiter({ max: 5, window: "1h", prefix: "ad-upload" });

/**
 * Ad purchase (Stripe Checkout creation): 3 per IP per hour.
 * A legitimate advertiser rarely creates more than one session per slot.
 */
export const adPurchaseLimiter = createLimiter({ max: 3, window: "1h", prefix: "ad-purchase" });

/**
 * Extract the client IP from a request and check it against a limiter.
 * Returns a 429 NextResponse if the limit is exceeded, or null if OK.
 */
export async function checkRateLimit(
  request: NextRequest,
  limiter: ReturnType<typeof createLimiter>,
): Promise<NextResponse | null> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const result = await limiter.limit(ip);

  if (!result.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
        },
      },
    );
  }

  return null;
}
