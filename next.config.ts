import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apify-client does runtime `require(variable)` that Next's bundler
  // (webpack + turbopack) can't statically analyze. Ship it as an
  // external CJS module instead of bundling, so it loads normally at
  // runtime and the pipeline scraper actually works.
  serverExternalPackages: ["apify-client"],
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

export default nextConfig;
