/**
 * Rate limiter backed by Upstash Redis (persistent across serverless
 * cold starts) with in-memory fallback for local dev.
 *
 * Upstash free tier: 10,000 commands/day — covers ~3,000 rate-limited
 * requests per day (each check = ~3 Redis commands).
 *
 * Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * When not set, falls back to in-memory Map (works in dev, resets on cold start).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimiterConfig = {
  /** Requests allowed per window */
  max: number;
  /** Window duration string (e.g. "60s", "1m", "1h") */
  window: string;
  /** Prefix for Redis keys */
  prefix: string;
};

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Create a rate limiter. Uses Upstash Redis if configured,
 * otherwise falls back to in-memory (ephemeral but functional).
 */
export function createLimiter(config: LimiterConfig) {
  if (redisUrl && redisToken) {
    // Production: persistent across cold starts
    return new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      limiter: Ratelimit.slidingWindow(config.max, config.window as Parameters<typeof Ratelimit.slidingWindow>[1]),
      prefix: `ratelimit:${config.prefix}`,
      analytics: false,
    });
  }

  // Dev fallback: in-memory (same interface)
  const store = new Map<string, { count: number; resetAt: number }>();
  const windowMs = parseWindow(config.window);

  // Cleanup expired entries periodically
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  return {
    async limit(identifier: string) {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || now >= entry.resetAt) {
        store.set(identifier, { count: 1, resetAt: now + windowMs });
        return { success: true, remaining: config.max - 1, reset: now + windowMs, limit: config.max };
      }

      entry.count += 1;
      if (entry.count > config.max) {
        return { success: false, remaining: 0, reset: entry.resetAt, limit: config.max };
      }
      return { success: true, remaining: config.max - entry.count, reset: entry.resetAt, limit: config.max };
    },
  };
}

function parseWindow(w: string): number {
  const match = w.match(/^(\d+)(s|m|h)$/);
  if (!match) return 60_000;
  const n = parseInt(match[1]);
  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60_000;
    case "h": return n * 3_600_000;
    default: return 60_000;
  }
}
