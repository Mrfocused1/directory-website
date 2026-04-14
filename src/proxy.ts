import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Proxy for subdomain-based multi-tenant routing.
 *
 * Routes:
 * - buildmy.directory / www.buildmy.directory (root) → marketing / dashboard pages
 * - *.buildmy.directory (subdomain) → tenant directory
 * - Custom domains → tenant directory (via DNS + lookup)
 */
export default async function proxy(request: NextRequest) {
  // Refresh Supabase auth session on every request
  const sessionResponse = await updateSession(request);
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
    return sessionResponse;
  }

  // Extract subdomain from *.buildmy.directory
  let tenant: string | null = null;

  if (hostname.endsWith(".buildmy.directory")) {
    tenant = hostname.replace(".buildmy.directory", "");
    // Strip www prefix if present (e.g., www.demo.buildmy.directory)
    if (tenant.startsWith("www.")) {
      tenant = tenant.slice(4);
    }
  }

  // If not a subdomain, it might be a custom domain
  if (!tenant) {
    // In production: look up custom domain in the database
    tenant = hostname;
  }

  // Rewrite to the tenant directory on the root domain
  if (tenant) {
    url.pathname = `/d/${tenant}${url.pathname}`;
    // Rewrite to the root domain so the request doesn't loop through the proxy
    if (hostname.endsWith('.buildmy.directory')) {
      url.hostname = 'buildmy.directory';
    }
    // For local dev and Vercel previews, the hostname is already correct
    return NextResponse.rewrite(url);
  }

  return sessionResponse;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
