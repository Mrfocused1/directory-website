/**
 * Lightweight in-memory sliding-window rate limiter.
 * No external dependencies — uses a plain Map with automatic cleanup.
 */

interface RateLimitOptions {
  /** Time window in milliseconds (default: 60 000 = 1 minute) */
  windowMs?: number;
  /** Max requests allowed per window (default: 10) */
  max?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 10;
  const store = new Map<string, RateLimitEntry>();

  // Auto-clean expired entries every 60 seconds to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Allow the timer to not block Node from exiting
  if (cleanup.unref) {
    cleanup.unref();
  }

  function check(ip: string): RateLimitResult {
    const now = Date.now();
    const entry = store.get(ip);

    // No existing entry or window expired — start fresh
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + windowMs;
      store.set(ip, { count: 1, resetAt });
      return { limited: false, remaining: max - 1, resetAt };
    }

    // Within window — increment
    entry.count += 1;

    if (entry.count > max) {
      return { limited: true, remaining: 0, resetAt: entry.resetAt };
    }

    return { limited: false, remaining: max - entry.count, resetAt: entry.resetAt };
  }

  return { check };
}
