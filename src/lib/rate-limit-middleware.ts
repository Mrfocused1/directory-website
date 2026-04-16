import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** Auth endpoints (signup, reset-password): 5 req/min */
export const authLimiter = rateLimit({ windowMs: 60_000, max: 5 });

/** Email-sending endpoints (subscribe, contact): 3 req/min */
export const emailLimiter = rateLimit({ windowMs: 60_000, max: 3 });

/** General public API endpoints: 30 req/min */
export const apiLimiter = rateLimit({ windowMs: 60_000, max: 30 });

/**
 * Extract the client IP from a request and check it against a limiter.
 * Returns a 429 NextResponse if the limit is exceeded, or null if OK.
 */
export function checkRateLimit(
  request: NextRequest,
  limiter: ReturnType<typeof rateLimit>,
): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const result = limiter.check(ip);

  if (result.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  return null;
}
