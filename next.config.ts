import type { NextConfig } from "next";

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

export default nextConfig;
