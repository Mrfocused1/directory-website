/**
 * Broken Link Healer — checks article reference URLs and repairs or removes broken ones.
 */

import { db } from "@/db";
import { references } from "@/db/schema";
import { eq, isNotNull, sql } from "drizzle-orm";

const SEARXNG_URL = process.env.SEARXNG_URL || "";
const MAX_URLS_PER_RUN = 200;
const HEAD_TIMEOUT_MS = 5_000;
const RATE_LIMIT_MS = 500;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkUrl(url: string): Promise<"ok" | "broken"> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 BuildMyDirectoryBot/1.0 (+https://buildmy.directory)" },
      });
      if (res.status === 404 || res.status === 410) return "broken";
      return "ok";
    } finally {
      clearTimeout(t);
    }
  } catch {
    return "broken";
  }
}

async function findReplacement(title: string): Promise<string | null> {
  if (!SEARXNG_URL) return null;
  try {
    const params = new URLSearchParams({ q: title, format: "json", categories: "general" });
    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.results || []) as { url?: string; title?: string }[];
    const first = results.find((r) => r.url && r.title);
    return first?.url ?? null;
  } catch {
    return null;
  }
}

export async function runBrokenLinkHealer() {
  console.log("[broken-link-healer] starting");
  if (!db) return { skipped: "db not configured" };

  const articleRefs = await db.query.references.findMany({
    where: (ref, { and, eq, isNotNull }) => and(eq(ref.kind, "article"), isNotNull(ref.url)),
    columns: { id: true, url: true, title: true },
    limit: MAX_URLS_PER_RUN,
  });

  let checked = 0;
  let broken = 0;
  let replaced = 0;
  let deleted = 0;

  for (const ref of articleRefs) {
    if (!ref.url) continue;
    const status = await checkUrl(ref.url);
    checked++;

    if (status === "broken") {
      broken++;
      console.log(`[broken-link-healer] broken URL: ${ref.url} (title: "${ref.title}")`);

      const replacement = await findReplacement(ref.title);
      if (replacement) {
        await db.update(references).set({ url: replacement }).where(eq(references.id, ref.id));
        console.log(`[broken-link-healer] replaced with: ${replacement}`);
        replaced++;
      } else {
        await db.delete(references).where(eq(references.id, ref.id));
        console.log(`[broken-link-healer] deleted reference (no replacement found)`);
        deleted++;
      }
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`[broken-link-healer] done — checked=${checked} broken=${broken} replaced=${replaced} deleted=${deleted}`);
  return { checked, broken, replaced, deleted };
}
