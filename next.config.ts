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
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  // Don't run the source-map upload step unless an auth token exists.
  // Prevents build errors when the project is added to Vercel before
  // any Sentry auth is configured.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
