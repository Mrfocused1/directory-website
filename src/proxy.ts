import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Proxy for multi-tenant routing.
 *
 * Public URL format: buildmy.directory/<username> (path-based)
 *
 * Routing rules:
 * - buildmy.directory / www.buildmy.directory (root) → marketing + dashboard
 *   Next.js App Router resolves explicit routes (/login, /dashboard, /api, …)
 *   before the dynamic [tenant] catch-all, so no rewrite is needed — tenant
 *   pages live at /[tenant] directly.
 * - *.buildmy.directory (subdomain) — legacy format. We permanently redirect
 *   to the path form (e.g. demo.buildmy.directory → buildmy.directory/demo)
 *   to consolidate SEO and avoid split canonicals.
 * - Custom domains → tenant directory. We rewrite the domain to /[tenant]
 *   internally; the tenant is resolved from customDomain in the DB.
 */

// Subdomains that should NOT be redirected — they map to app functions.
const RESERVED_SUBDOMAINS = new Set([
  "api", "admin", "dashboard", "auth", "login", "signup", "www",
  "mail", "email", "blog", "help", "support", "docs", "status",
  "billing", "settings", "account", "onboarding",
  "app", "static", "cdn", "assets", "media",
]);

export default async function proxy(request: NextRequest) {
  // Refresh Supabase auth session on every request
  const sessionResponse = await updateSession(request);
  const url = request.nextUrl.clone();
  const hostname = (request.headers.get("host") || "").replace(/:\d+$/, ""); // strip port

  // Root domains that should show the marketing/dashboard site as-is
  const rootDomains = [
    "localhost",
    "buildmy.directory",
    "www.buildmy.directory",
  ];

  const isVercelUrl = hostname.endsWith(".vercel.app");
  const isRootDomain = isVercelUrl || rootDomains.includes(hostname);

  if (isRootDomain) {
    return sessionResponse;
  }

  // Legacy subdomain format → 301 redirect to path form
  if (hostname.endsWith(".buildmy.directory")) {
    let subdomain = hostname.replace(".buildmy.directory", "");
    if (subdomain.startsWith("www.")) subdomain = subdomain.slice(4);

    // Reserved subdomains (e.g. blog.buildmy.directory) bypass tenant logic
    if (subdomain && RESERVED_SUBDOMAINS.has(subdomain.toLowerCase())) {
      return sessionResponse;
    }

    if (subdomain) {
      // 301 to buildmy.directory/<subdomain><original-path>
      const redirectUrl = new URL(
        `https://buildmy.directory/${subdomain}${url.pathname}${url.search}`,
      );
      return NextResponse.redirect(redirectUrl, 301);
    }
  }

  // Custom domain — rewrite to /[tenant] on the root host. The [tenant]
  // route will resolve the custom domain to a site via the DB.
  url.pathname = `/${hostname}${url.pathname}`;
  url.hostname = "buildmy.directory";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
