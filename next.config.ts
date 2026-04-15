import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Vercel Blob storage for uploaded media
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        // Cloudflare R2 or S3 (when you switch storage)
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        // Instagram CDN for profile pictures
        protocol: "https",
        hostname: "*.cdninstagram.com",
      },
      {
        // TikTok CDN
        protocol: "https",
        hostname: "*.tiktokcdn.com",
      },
    ],
  },
};

// Sentry is a no-op until NEXT_PUBLIC_SENTRY_DSN is set in the
// Vercel environment. Safe to ship before any account exists —
// withSentryConfig wraps the build but the SDK itself short-circuits
// when no DSN is present.
//
// EU region: our Sentry org lives on de.sentry.io. The SDK reads the
// DSN's hostname so events auto-route, but the CLI used for source-map
// upload at build time needs SENTRY_URL set explicitly — otherwise it
// hits sentry.io and 401s. Default to EU; override in Vercel if
// needed.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  sentryUrl: process.env.SENTRY_URL || "https://de.sentry.io/",
  sourcemaps: {
    // Don't run the source-map upload step unless an auth token exists.
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
