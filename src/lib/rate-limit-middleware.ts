import { NextRequest, NextResponse } from "next/server";
import { createLimiter } from "@/lib/rate-limit";

/** Auth endpoints (signup, reset-password): 5 req/min */
export const authLimiter = createLimiter({ max: 5, window: "1m", prefix: "auth" });

/** Email-sending endpoints (subscribe, contact): 3 req/min */
export const emailLimiter = createLimiter({ max: 3, window: "1m", prefix: "email" });

/** General public API endpoints: 30 req/min */
export const apiLimiter = createLimiter({ max: 30, window: "1m", prefix: "api" });

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
