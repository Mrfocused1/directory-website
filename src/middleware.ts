import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware for subdomain-based multi-tenant routing.
 *
 * Routes:
 * - buildmy.directory (root) → marketing / dashboard pages
 * - *.buildmy.directory (subdomain) → tenant directory
 * - Custom domains → tenant directory (via DNS + lookup)
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";

  // Define the root domains (add production domain when deployed)
  const rootDomains = [
    "localhost:3000",
    "localhost:3001",
    "localhost:3002",
    "buildmy.directory",
    "www.buildmy.directory",
  ];

  // Check if this is a root domain request (marketing/dashboard)
  const isRootDomain = rootDomains.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );

  // Extract subdomain
  let tenant: string | null = null;

  for (const root of rootDomains) {
    if (hostname.endsWith(`.${root}`) && hostname !== root) {
      tenant = hostname.replace(`.${root}`, "");
      break;
    }
  }

  // If it's not a root domain and not a known subdomain, it might be a custom domain
  if (!isRootDomain && !tenant) {
    // In production: look up custom domain in the database
    // For now, treat unknown hosts as potential custom domains
    // You'd cache this lookup in a KV store for performance
    tenant = hostname; // Will be resolved in the page handler
  }

  // If we have a tenant, rewrite to the tenant directory
  if (tenant && !tenant.includes("localhost")) {
    // Rewrite /anything to /[tenant]/anything
    url.pathname = `/d/${tenant}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip middleware for static files, api routes, and Next.js internals
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
