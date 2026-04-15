import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client for event capture from route handlers.
 * Lazy-initialized so unset-env is a true no-op (null return).
 */

const KEY = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!KEY) return null;
  if (client) return client;
  client = new PostHog(KEY, {
    host: HOST,
    // flushAt=1 sends every event immediately — acceptable at our
    // volume (single-digit events per request). Batching is only worth
    // it above ~100 req/s.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

/**
 * Capture a server-side event. Safe to call without a PostHog account —
 * returns immediately when KEY is unset.
 */
export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const c = getClient();
  if (!c) return;
  c.capture({ distinctId, event, properties });
}
