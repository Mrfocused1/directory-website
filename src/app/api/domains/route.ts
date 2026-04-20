import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customDomains, sites, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { hasFeature, type PlanId } from "@/lib/plans";
import {
  addDomainToProject,
  removeDomainFromProject,
  getDomainConfig,
  getProjectDomain,
  isConfigured,
} from "@/lib/vercel-domains";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);

function generateToken(): string {
  return "bmd-verify-" + crypto.randomBytes(32).toString("hex");
}

/**
 * Validates that a domain string is a safe, public, fully-qualified domain.
 * Rejects localhost, IP addresses, internal hostnames, and single-label
 * domains (no TLD).
 */
function validateDomain(domain: string): string | null {
  const d = domain.toLowerCase().trim();

  // Must contain at least one dot (rejects single-label / no TLD)
  if (!d.includes(".")) return "Domain must include a TLD (e.g. example.com)";

  // Reject localhost variants
  if (d === "localhost" || d.endsWith(".localhost"))
    return "localhost is not allowed";

  // Reject IP addresses (v4 and v6-ish)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return "IP addresses are not allowed";
  if (d.startsWith("[") || /^[0-9a-f:]+$/i.test(d))
    return "IP addresses are not allowed";

  // Reject internal / reserved hostnames
  const reservedTlds = [".local", ".internal", ".test", ".example", ".invalid", ".onion"];
  if (reservedTlds.some((tld) => d.endsWith(tld)))
    return "Reserved or internal domains are not allowed";

  // Basic RFC-ish character check
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d))
    return "Invalid domain format";

  return null; // valid
}

async function resolveUserPlan(userId: string): Promise<PlanId> {
  if (!db) return "free";
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { plan: true },
  });
  return (VALID_PLANS.has(userRow?.plan as string) ? userRow!.plan : "creator") as PlanId;
}

// GET /api/domains?action=status&domain=yourdomain.com — Check verification status
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const planId = await resolveUserPlan(user.id);
  if (!hasFeature(planId, "custom_domain")) {
    return NextResponse.json(
      { error: "Custom domains are not available on your plan.", reason: "plan_feature_missing" },
      { status: 403 },
    );
  }

  const action = request.nextUrl.searchParams.get("action");

  if (action === "status") {
    const domain = request.nextUrl.searchParams.get("domain");
    if (!domain) {
      return NextResponse.json({ error: "Missing domain" }, { status: 400 });
    }

    if (isConfigured()) {
      try {
        const config = await getDomainConfig(domain);
        const verified = config?.configured === true;
        // Persist the verified state back to the DB — otherwise
        // custom_domains.status stays "pending" forever and the
        // public routing fallback (which now accepts every non-
        // failed status) keeps serving fresh DNS-propagated domains
        // without ever flipping to "active" for the creator UI.
        await db
          .update(customDomains)
          .set({
            status: verified ? "active" : "verifying",
            dnsVerified: verified,
            sslProvisioned: verified,
            updatedAt: new Date(),
          })
          .where(eq(customDomains.domain, domain.toLowerCase()));
        return NextResponse.json({
          domain,
          status: verified ? "active" : "pending",
          dnsVerified: verified,
          sslProvisioned: verified,
          misconfigured: config?.misconfigured ?? false,
        });
      } catch {
        // Fall through to basic response
      }
    }

    return NextResponse.json({
      domain,
      status: "pending",
      dnsVerified: false,
      sslProvisioned: false,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// POST /api/domains — Connect an external domain (BYO)
// Domain purchases now go through /api/domains/checkout → Stripe → webhook
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const planId = await resolveUserPlan(user.id);
  if (!hasFeature(planId, "custom_domain")) {
    return NextResponse.json(
      { error: "Custom domains are not available on your plan.", reason: "plan_feature_missing" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { siteId, domain, action: domainAction } = body;

    if (!siteId || !domain) {
      return NextResponse.json({ error: "Missing siteId or domain" }, { status: 400 });
    }

    if (domainAction === "connect") {
      const cleanDomain = domain.toLowerCase().trim();

      // Validate domain
      const validationError = validateDomain(cleanDomain);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      // Ownership check — make sure the caller owns this site
      const site = await db.query.sites.findFirst({
        where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
        columns: { id: true },
      });
      if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

      // Idempotency — if this domain is already on the caller's own
      // site in our DB, return the existing row instead of 500'ing
      // on the unique constraint. If it's on a DIFFERENT site owned
      // by this user (not allowed), 409.
      const existing = await db.query.customDomains.findFirst({
        where: eq(customDomains.domain, cleanDomain),
      });
      if (existing) {
        if (existing.siteId === siteId) {
          return NextResponse.json({
            domain: {
              id: existing.id,
              domain: existing.domain,
              type: existing.type,
              status: existing.status,
              verificationToken: existing.verificationToken,
              dnsVerified: existing.dnsVerified,
              sslProvisioned: existing.sslProvisioned,
            },
            dnsRecords: [
              { type: "CNAME", name: "www", value: "cname.vercel-dns.com", purpose: "Points your domain to our servers" },
              { type: "A", name: "@", value: "76.76.21.21", purpose: "Points your root domain to our servers" },
              { type: "TXT", name: "@", value: existing.verificationToken, purpose: "Verifies you own this domain" },
            ],
            alreadyConnected: true,
          });
        }
        return NextResponse.json(
          { error: "This domain is already connected to another one of your directories." },
          { status: 409 },
        );
      }

      const token = generateToken();

      // Add domain to Vercel project. Idempotent: if the domain is
      // already on OUR project (from a previous attempt or a manual
      // Vercel-dashboard add), we skip the add call. If Vercel
      // rejects because it's on ANOTHER project, we surface the
      // conflict so the creator knows to detach it there first.
      if (isConfigured()) {
        let alreadyOnOurProject = false;
        try {
          const existingOnVercel = await getProjectDomain(cleanDomain);
          alreadyOnOurProject = existingOnVercel !== null;
        } catch (err) {
          // Probe failed; fall through to the add and let the
          // error path below handle any real conflict.
          console.warn("getProjectDomain probe failed:", err instanceof Error ? err.message : err);
        }

        if (!alreadyOnOurProject) {
          try {
            await addDomainToProject(cleanDomain);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("Failed to add domain to Vercel:", msg);
            if (/already|taken|409/i.test(msg)) {
              return NextResponse.json(
                {
                  error:
                    "This domain is registered to another Vercel project. Remove it from that project (or transfer it) and try again.",
                },
                { status: 409 },
              );
            }
            return NextResponse.json(
              { error: "Failed to register the domain with our host. Try again in a minute." },
              { status: 502 },
            );
          }
        }
      }

      // Persist to DB
      const [inserted] = await db
        .insert(customDomains)
        .values({
          siteId,
          domain: cleanDomain,
          type: "external",
          status: "pending",
          verificationToken: token,
          dnsVerified: false,
          sslProvisioned: false,
        })
        .returning();

      return NextResponse.json({
        domain: {
          id: inserted.id,
          domain: cleanDomain,
          type: "external",
          status: "pending",
          verificationToken: token,
          dnsVerified: false,
          sslProvisioned: false,
        },
        dnsRecords: [
          {
            type: "CNAME",
            name: "www",
            value: "cname.vercel-dns.com",
            purpose: "Points your domain to our servers",
          },
          {
            type: "A",
            name: "@",
            value: "76.76.21.21",
            purpose: "Points your root domain to our servers",
          },
          {
            type: "TXT",
            name: "@",
            value: token,
            purpose: "Verifies you own this domain",
          },
        ],
        message: "Add these DNS records to verify your domain.",
      }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    // Preserve the real error server-side so we can diagnose — the
    // previous `catch {}` was swallowing Drizzle / Vercel failures and
    // returning a generic "Invalid request" with no breadcrumb.
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    console.error(`[POST /api/domains] unhandled ${name}: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    return NextResponse.json(
      { error: "Invalid request", detail: msg.slice(0, 200) },
      { status: 400 },
    );
  }
}

// DELETE /api/domains — Remove a custom domain
export async function DELETE(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const planId = await resolveUserPlan(user.id);
  if (!hasFeature(planId, "custom_domain")) {
    return NextResponse.json(
      { error: "Custom domains are not available on your plan.", reason: "plan_feature_missing" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { domainId, domain } = body;
    if (!domainId) {
      return NextResponse.json({ error: "Missing domainId" }, { status: 400 });
    }

    // Verify ownership: the domain must belong to a site the caller owns
    const domainRow = await db.query.customDomains.findFirst({
      where: eq(customDomains.id, domainId),
      columns: { id: true, siteId: true, domain: true },
    });
    if (!domainRow) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, domainRow.siteId), eq(sites.userId, user.id)),
      columns: { id: true },
    });
    if (!site) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    // Remove from Vercel
    const domainToRemove = domain || domainRow.domain;
    if (domainToRemove && isConfigured()) {
      try {
        await removeDomainFromProject(domainToRemove);
      } catch (err) {
        console.error("Failed to remove domain from Vercel:", err);
      }
    }

    // Delete from DB
    await db.delete(customDomains).where(eq(customDomains.id, domainId));

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
