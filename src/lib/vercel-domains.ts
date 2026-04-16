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
