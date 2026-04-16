import { NextRequest, NextResponse } from "next/server";
import {
  addDomainToProject,
  removeDomainFromProject,
  getDomainConfig,
  isConfigured,
} from "@/lib/vercel-domains";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "bmd-verify-";
  for (let i = 0; i < 16; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// GET /api/domains?action=status&domain=yourdomain.com — Check verification status
export async function GET(request: NextRequest) {
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
  try {
    const body = await request.json();
    const { siteId, domain, action: domainAction } = body;

    if (!siteId || !domain) {
      return NextResponse.json({ error: "Missing siteId or domain" }, { status: 400 });
    }

    if (domainAction === "connect") {
      const token = generateToken();
      const cleanDomain = domain.toLowerCase().trim();

      // Add domain to Vercel project
      if (isConfigured()) {
        try {
          await addDomainToProject(cleanDomain);
        } catch (err) {
          console.error("Failed to add domain to Vercel:", err);
        }
      }

      return NextResponse.json({
        domain: {
          id: `dom-${Date.now()}`,
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
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE /api/domains — Remove a custom domain
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { domainId, domain } = body;
    if (!domainId) {
      return NextResponse.json({ error: "Missing domainId" }, { status: 400 });
    }

    if (domain && isConfigured()) {
      try {
        await removeDomainFromProject(domain);
      } catch (err) {
        console.error("Failed to remove domain from Vercel:", err);
      }
    }

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
