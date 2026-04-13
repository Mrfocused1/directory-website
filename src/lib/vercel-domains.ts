/**
 * Vercel Domains API — domain search, registration, and project configuration.
 *
 * This replaces ResellerClub as the domain registrar. Vercel handles:
 *   - Domain availability search
 *   - Domain registration (charged to Vercel account)
 *   - DNS + SSL auto-configuration
 *
 * Required env vars:
 *   VERCEL_PROJECT_ID  – your Vercel project ID
 *   VERCEL_TEAM_ID     – your Vercel team ID
 *   VERCEL_API_TOKEN   – bearer token with domain permissions
 */

const PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? "";
const TEAM_ID = process.env.VERCEL_TEAM_ID ?? "";
const API_TOKEN = process.env.VERCEL_API_TOKEN ?? "";

const BASE = "https://api.vercel.com";

function teamQuery(): string {
  return TEAM_ID ? `teamId=${TEAM_ID}` : "";
}

function appendTeam(url: string): string {
  const tq = teamQuery();
  if (!tq) return url;
  return url.includes("?") ? `${url}&${tq}` : `${url}?${tq}`;
}

async function vercelFetch(path: string, init?: RequestInit) {
  const url = appendTeam(`${BASE}${path}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Vercel API ${init?.method ?? "GET"} ${path} returned non-JSON (${res.status}): ${text}`);
  }
  if (!res.ok) {
    throw new Error(
      `Vercel API ${init?.method ?? "GET"} ${path} failed (${res.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

// ─── Domain Availability & Pricing ──────────────────────────────────

export type DomainAvailability = {
  domain: string;
  available: boolean;
  price: number; // cents
  renewal: number; // cents
  period: number; // years
};

/**
 * Check if a specific domain is available for purchase.
 */
export async function checkDomainAvailability(domain: string): Promise<DomainAvailability> {
  const data = await vercelFetch(`/v4/domains/status?name=${encodeURIComponent(domain)}`);
  return {
    domain,
    available: data.available === true,
    price: 0, // Will be filled by getDomainPrice
    renewal: 0,
    period: 1,
  };
}

/**
 * Get the price for a domain.
 */
export async function getDomainPrice(domain: string): Promise<{ price: number; period: number }> {
  const data = await vercelFetch(`/v4/domains/price?name=${encodeURIComponent(domain)}`);
  // Vercel returns price in USD (e.g. 9.99)
  return {
    price: Math.round((data.price ?? 0) * 100), // convert to cents
    period: data.period ?? 1,
  };
}

export type SearchResult = {
  domain: string;
  tld: string;
  available: boolean;
  price: number; // cents
  renewal: number; // cents
  priceFormatted: string;
  renewalFormatted: string;
};

// Popular TLDs to check by default
const POPULAR_TLDS = [
  "com", "co", "io", "org", "net", "xyz", "me", "directory",
  "app", "dev", "store", "online", "tech", "site", "shop",
];

/**
 * Search domain availability across multiple TLDs.
 * Checks each TLD in parallel for speed.
 */
export async function searchDomains(
  sld: string,
  tlds?: string[],
): Promise<SearchResult[]> {
  const tldsToCheck = tlds ?? POPULAR_TLDS;

  const results = await Promise.allSettled(
    tldsToCheck.map(async (tld): Promise<SearchResult> => {
      const domain = `${sld}.${tld}`;
      const [availability, pricing] = await Promise.all([
        checkDomainAvailability(domain),
        getDomainPrice(domain).catch(() => ({ price: 0, period: 1 })),
      ]);

      const priceCents = pricing.price;
      return {
        domain,
        tld: `.${tld}`,
        available: availability.available,
        price: priceCents,
        renewal: priceCents, // Vercel renewal is typically same as registration
        priceFormatted: `$${(priceCents / 100).toFixed(2)}`,
        renewalFormatted: `$${(priceCents / 100).toFixed(2)}/yr`,
      };
    }),
  );

  const successful: SearchResult[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    }
  }

  // Sort: available first, then by price
  successful.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.price - b.price;
  });

  return successful;
}

// ─── Domain Registration ────────────────────────────────────────────

export type RegisterResult = {
  domain: string;
  created: boolean;
};

/**
 * Purchase/register a domain through Vercel.
 * The cost is charged to your Vercel team billing.
 */
export async function purchaseDomain(domain: string): Promise<RegisterResult> {
  const data = await vercelFetch("/v5/domains/buy", {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  return {
    domain,
    created: data.created === true || data.purchased === true,
  };
}

// ─── Project Domain Management ──────────────────────────────────────

/**
 * Add a domain to the Vercel project.
 * Vercel will automatically provision SSL once DNS propagates.
 */
export async function addDomainToProject(domain: string) {
  return vercelFetch(
    `/v10/projects/${PROJECT_ID}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
  );
}

/**
 * Remove a domain from the Vercel project.
 */
export async function removeDomainFromProject(domain: string) {
  return vercelFetch(
    `/v9/projects/${PROJECT_ID}/domains/${domain}`,
    { method: "DELETE" },
  );
}

/**
 * Check domain configuration status on Vercel.
 */
export async function getDomainConfig(domain: string) {
  return vercelFetch(`/v6/domains/${domain}/config`);
}

/**
 * Verify a domain on the Vercel project.
 */
export async function verifyDomain(domain: string) {
  return vercelFetch(
    `/v9/projects/${PROJECT_ID}/domains/${domain}/verify`,
    { method: "POST" },
  );
}

/**
 * Validate that Vercel credentials are configured.
 */
export function isConfigured(): boolean {
  return Boolean(PROJECT_ID && API_TOKEN);
}
