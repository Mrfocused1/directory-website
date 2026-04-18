import { db } from "@/db";
import { pipelineJobs } from "@/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import type { ServiceCheck, HealthReport, ServiceStatus } from "./types";

/** Fetch with a timeout via AbortSignal */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Wrap a check function and catch errors into a ServiceCheck */
async function runCheck(
  service: ServiceCheck["service"],
  fn: () => Promise<{ status: ServiceStatus; latencyMs: number; message: string }>,
): Promise<ServiceCheck> {
  try {
    const result = await fn();
    return { service, ...result };
  } catch (err) {
    return {
      service,
      status: "down",
      latencyMs: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkScraper(): Promise<ServiceCheck> {
  return runCheck("scraper", async () => {
    const url = process.env.SCRAPER_VPS_URL;
    if (!url) return { status: "down", latencyMs: 0, message: "SCRAPER_VPS_URL not set" };
    const start = Date.now();
    const res = await fetchWithTimeout(`${url}/health`, 5_000);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, message: `HTTP ${res.status}` };
    return { status: "ok", latencyMs, message: "healthy" };
  });
}

export async function checkPiper(): Promise<ServiceCheck> {
  return runCheck("piper", async () => {
    const url = process.env.PIPER_TTS_URL;
    if (!url) return { status: "down", latencyMs: 0, message: "PIPER_TTS_URL not set" };
    const start = Date.now();
    const res = await fetchWithTimeout(`${url}/health`, 5_000);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, message: `HTTP ${res.status}` };
    return { status: "ok", latencyMs, message: "healthy" };
  });
}

export async function checkSearXNG(): Promise<ServiceCheck> {
  return runCheck("searxng", async () => {
    const url = process.env.SEARXNG_URL;
    if (!url) return { status: "down", latencyMs: 0, message: "SEARXNG_URL not set" };
    const start = Date.now();
    const res = await fetchWithTimeout(`${url}/search?q=test&format=json`, 8_000);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, message: `HTTP ${res.status}` };
    const data = await res.json() as { results?: unknown[] };
    const hasResults = Array.isArray(data?.results) && data.results.length > 0;
    return {
      status: hasResults ? "ok" : "degraded",
      latencyMs,
      message: hasResults ? `${data.results!.length} results` : "returned 0 results",
    };
  });
}

export async function checkLibreTranslate(): Promise<ServiceCheck> {
  return runCheck("libretranslate", async () => {
    const url = process.env.LIBRETRANSLATE_URL;
    if (!url) return { status: "down", latencyMs: 0, message: "LIBRETRANSLATE_URL not set" };
    const start = Date.now();
    const res = await fetchWithTimeout(`${url}/languages`, 5_000);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { status: "down", latencyMs, message: `HTTP ${res.status}` };
    return { status: "ok", latencyMs, message: "healthy" };
  });
}

export async function checkDatabase(): Promise<ServiceCheck> {
  return runCheck("database", async () => {
    if (!db) return { status: "down", latencyMs: 0, message: "DATABASE_URL not set" };
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    return { status: "ok", latencyMs, message: "reachable" };
  });
}

export async function checkApiKeys(): Promise<ServiceCheck[]> {
  const groqOk = !!process.env.GROQ_API_KEY;
  const anthropicOk = !!process.env.ANTHROPIC_API_KEY;
  return [
    {
      service: "groq" as const,
      status: groqOk ? "ok" : "down",
      latencyMs: 0,
      message: groqOk ? "key present" : "GROQ_API_KEY missing",
    },
    {
      service: "anthropic" as const,
      status: anthropicOk ? "ok" : "down",
      latencyMs: 0,
      message: anthropicOk ? "key present" : "ANTHROPIC_API_KEY missing",
    },
  ];
}

export async function checkStalePipelines(): Promise<ServiceCheck> {
  return runCheck("pipeline", async () => {
    if (!db) return { status: "down", latencyMs: 0, message: "db not available" };
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const start = Date.now();
    const stale = await db
      .select({ id: pipelineJobs.id })
      .from(pipelineJobs)
      .where(
        and(
          eq(pipelineJobs.status, "running"),
          lt(pipelineJobs.createdAt, thirtyMinsAgo),
        ),
      );
    const latencyMs = Date.now() - start;
    if (stale.length === 0) return { status: "ok", latencyMs, message: "no stale pipelines" };
    return {
      status: "degraded",
      latencyMs,
      message: `${stale.length} pipeline job(s) stuck for >30 min`,
    };
  });
}

/** Run all checks in parallel and compute the overall worst status */
export async function runAllChecks(): Promise<HealthReport> {
  const [
    scraper,
    piper,
    searxng,
    libretranslate,
    database,
    pipeline,
    ...apiKeyChecks
  ] = await Promise.all([
    checkScraper(),
    checkPiper(),
    checkSearXNG(),
    checkLibreTranslate(),
    checkDatabase(),
    checkStalePipelines(),
    checkApiKeys(),
  ]);

  // checkApiKeys() returns an array — flatten it out
  const keyChecks = apiKeyChecks.flat() as ServiceCheck[];
  const services: ServiceCheck[] = [scraper, piper, searxng, libretranslate, database, pipeline, ...keyChecks];

  const statusRank: Record<ServiceStatus, number> = { ok: 0, degraded: 1, down: 2 };
  const worst = services.reduce<ServiceStatus>((acc, s) => {
    return statusRank[s.status] > statusRank[acc] ? s.status : acc;
  }, "ok");

  return {
    overall: worst,
    services,
    timestamp: new Date().toISOString(),
  };
}
