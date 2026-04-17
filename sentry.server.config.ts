import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0, // errors only — see client config for why
    environment: process.env.VERCEL_ENV || "development",
    // Expected errors we don't want to page on:
    ignoreErrors: [
      /Authentication required/,  // 401s from anon callers
      /Site not found/,           // 404s on bad URLs
      /Missing siteId/,           // 400s on bad payloads
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
