import { NextRequest, NextResponse } from "next/server";

// Mock TLD pricing (in production, query registrar API)
const TLD_PRICING: Record<string, { available: boolean; price: number; renewal: number }> = {
  ".com": { available: true, price: 1299, renewal: 1499 },
  ".co": { available: true, price: 2499, renewal: 2999 },
  ".io": { available: true, price: 3999, renewal: 4999 },
  ".org": { available: true, price: 999, renewal: 1299 },
  ".net": { available: true, price: 1199, renewal: 1399 },
  ".xyz": { available: true, price: 299, renewal: 1299 },
  ".me": { available: true, price: 1999, renewal: 2499 },
  ".directory": { available: true, price: 2999, renewal: 3499 },
};

// Domains that are "taken" for demo purposes
const TAKEN_DOMAINS = ["google.com", "facebook.com", "amazon.com", "apple.com", "example.com"];

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "bmd-verify-";
  for (let i = 0; i < 16; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// GET /api/domains?action=search&q=yourname — Search domain availability
// GET /api/domains?action=status&domain=yourdomain.com — Check verification status
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "search") {
    const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    if (!query) {
      return NextResponse.json({ error: "Missing search query" }, { status: 400 });
    }

    // Strip any existing TLD
    const baseName = query.replace(/\.[a-z]+$/, "").replace(/[^a-z0-9-]/g, "");
    if (!baseName || baseName.length < 2) {
      return NextResponse.json({ error: "Invalid domain name" }, { status: 400 });
    }

    // Check multiple TLDs
    const results = Object.entries(TLD_PRICING).map(([tld, pricing]) => {
      const domain = `${baseName}${tld}`;
      const isTaken = TAKEN_DOMAINS.includes(domain);
      return {
        domain,
        tld,
        available: !isTaken,
        price: pricing.price,
        renewal: pricing.renewal,
        priceFormatted: `$${(pricing.price / 100).toFixed(2)}`,
        renewalFormatted: `$${(pricing.renewal / 100).toFixed(2)}/yr`,
      };
    });

    // Sort: available first, then by price
    results.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.price - b.price;
    });

    return NextResponse.json({ results, query: baseName });
  }

  if (action === "status") {
    const domain = request.nextUrl.searchParams.get("domain");
    if (!domain) {
      return NextResponse.json({ error: "Missing domain" }, { status: 400 });
    }

    // TODO: In production, do actual DNS lookup to verify CNAME/TXT records
    // For demo, return a mock status
    return NextResponse.json({
      domain,
      status: "pending",
      dnsVerified: false,
      sslProvisioned: false,
      records: {
        cname: { expected: "proxy.buildmy.directory", found: null, verified: false },
        txt: { expected: `bmd-verify-${domain.replace(/\./g, "")}`, found: null, verified: false },
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// POST /api/domains — Register/connect a domain
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, domain, action: domainAction } = body;

    if (!siteId || !domain) {
      return NextResponse.json({ error: "Missing siteId or domain" }, { status: 400 });
    }

    if (domainAction === "purchase") {
      // TODO: In production, call registrar API to purchase domain
      // const order = await resellerClub.registerDomain(domain, { nameservers: [...] });

      const token = generateToken();
      return NextResponse.json({
        domain: {
          id: `dom-${Date.now()}`,
          domain,
          type: "purchased",
          status: "active",
          verificationToken: token,
          dnsVerified: true,
          sslProvisioned: true,
          purchasePrice: body.price || 1299,
          renewalPrice: body.renewal || 1499,
          expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        },
        message: "Domain purchased and configured automatically!",
      }, { status: 201 });
    }

    if (domainAction === "connect") {
      // BYO domain — generate verification token and return DNS instructions
      const token = generateToken();
      const cleanDomain = domain.toLowerCase().trim();

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
            value: "proxy.buildmy.directory",
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
    const { domainId } = body;
    if (!domainId) {
      return NextResponse.json({ error: "Missing domainId" }, { status: 400 });
    }
    // TODO: In production, release domain from registrar if purchased, remove DNS
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
