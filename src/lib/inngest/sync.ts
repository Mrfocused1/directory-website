/**
 * Self-healing Inngest registration.
 *
 * Each Vercel deployment creates a new Lambda image — and Inngest
 * Cloud doesn't know about our app's functions until something on
 * the new deployment hits PUT /api/inngest. Without that, any
 * `inngest.send()` from the app silently goes into the void
 * (Inngest Cloud accepts the event but has no consumer registered
 * for the new build).
 *
 * Solution: before the first `inngest.send()` of a Lambda's lifetime,
 * fire PUT /api/inngest against the same origin to sync function
 * definitions. The PUT is idempotent (Inngest returns
 * `modified: false` if nothing changed), and we memoize per-Lambda
 * so we don't add latency to subsequent requests.
 *
 * This piggybacks on whatever request is already running, so users
 * only see the ~200ms registration overhead on the very first
 * pipeline POST after a deploy. Every subsequent request is free.
 */

let registrationPromise: Promise<void> | null = null;

export function ensureInngestRegistered(origin: string): Promise<void> {
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    try {
      const res = await fetch(`${origin}/api/inngest`, {
        method: "PUT",
        // 5s ceiling — if Inngest can't respond, we still proceed and let
        // the event drop rather than hang the user's request indefinitely.
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.warn(
          `[inngest] auto-register returned ${res.status} — events may be dropped until manual sync`,
        );
      }
    } catch (err) {
      console.warn(
        "[inngest] auto-register failed (best-effort):",
        err instanceof Error ? err.message : err,
      );
    }
  })();
  return registrationPromise;
}
