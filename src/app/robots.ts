import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // App-only surfaces we don't want in search results
        disallow: [
          "/dashboard/",
          "/onboarding",
          "/login",
          "/forgot-password",
          "/auth/",
          "/admin",
          "/api/",
          "/embed/",
          "/*/unsubscribe",
          "/*/preferences",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
