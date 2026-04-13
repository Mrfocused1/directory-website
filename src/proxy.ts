import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for subdomain-based multi-tenant routing.
 *
 * Routes:
 * - buildmy.directory / www.buildmy.directory (root) → marketing / dashboard pages
 * - *.buildmy.directory (subdomain) → tenant directory
 * - Custom domains → tenant directory (via DNS + lookup)
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = (request.headers.get("host") || "").replace(/:\d+$/, ""); // strip port

  // Root domains that should show the marketing/dashboard site
  const rootDomains = [
    "localhost",
    "buildmy.directory",
    "www.buildmy.directory",
  ];

  // Also treat Vercel preview/production URLs as root
  const isVercelUrl = hostname.endsWith(".vercel.app");

  // Check if this is a root domain request
  const isRootDomain = isVercelUrl || rootDomains.includes(hostname);

  if (isRootDomain) {
    return NextResponse.next();
  }

  // Extract subdomain from *.buildmy.directory
  let tenant: string | null = null;

  if (hostname.endsWith(".buildmy.directory")) {
    tenant = hostname.replace(".buildmy.directory", "");
  }

  // If not a subdomain, it might be a custom domain
  if (!tenant) {
    // In production: look up custom domain in the database
    tenant = hostname;
  }

  // Rewrite to the tenant directory
  if (tenant) {
    url.pathname = `/d/${tenant}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
