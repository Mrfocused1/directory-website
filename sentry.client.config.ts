import * as Sentry from "@sentry/nextjs";

// Env-gated: Sentry is a no-op until NEXT_PUBLIC_SENTRY_DSN is set
// in Vercel. Adding the DSN flips every file in this directory on
// without a code change.
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    // Errors only: performance monitoring shares the 5k/mo free quota
    // with errors, and we'd rather see the crashes than the traces.
    tracesSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    // Don't send noise: favicons, source maps, cancelled RSC prefetches.
    ignoreErrors: [
      /favicon/i,
      /sourcemap/i,
      /Failed to load resource/i,
      /ERR_ABORTED.*_rsc=/,
      /ResizeObserver loop/i,
    ],
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }
      return event;
    },
  });
}
