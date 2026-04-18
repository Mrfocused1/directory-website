/**
 * SEO Watchdog — weekly check of published sites for SEO issues.
 * Auto-fixes posts whose titles are just truncated caption first lines.
 */

import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type Warning = { siteSlug: string; reason: string };

async function generateTitlesViaClaude(
  batch: { id: string; caption: string }[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!ANTHROPIC_API_KEY || batch.length === 0) return result;

  const prompt = `Generate a short, descriptive title (max 8 words) for each post caption below.
Return a JSON array of objects: [{"id":"...","title":"..."}]
Only return the JSON array.

${batch.map((p) => `{"id":"${p.id}","caption":${JSON.stringify(p.caption.slice(0, 300))}}`).join("\n")}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return result;
    const data = await res.json();
    const text = (data.content?.[0]?.text || "").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return result;
    const parsed = JSON.parse(match[0]) as { id: string; title: string }[];
    for (const item of parsed) {
      if (item.id && item.title) result.set(item.id, item.title.trim().slice(0, 120));
    }
  } catch {
    // ignore
  }
  return result;
}

export async function runSeoWatchdog() {
  console.log("[seo-watchdog] starting");
  if (!db) return { skipped: "db not configured" };

  const publishedSites = await db.query.sites.findMany({
    where: eq(sites.isPublished, true),
  });

  let sitesChecked = 0;
  let titlesFixes = 0;
  const warnings: Warning[] = [];

  for (const site of publishedSites) {
    sitesChecked++;

    if (!site.displayName || site.displayName.length <= 3) {
      warnings.push({ siteSlug: site.slug, reason: "displayName missing or too short (<= 3 chars)" });
    }
    if (!site.bio || site.bio.length <= 20) {
      warnings.push({ siteSlug: site.slug, reason: "bio missing or too short (<= 20 chars)" });
    }

    const visiblePosts = await db.query.posts.findMany({
      where: and(eq(posts.siteId, site.id), eq(posts.isVisible, true)),
      columns: { id: true, title: true, caption: true },
    });

    if (visiblePosts.length < 5) {
      warnings.push({ siteSlug: site.slug, reason: `thin content: only ${visiblePosts.length} visible posts` });
    }

    // Find posts where title looks like a truncated caption first line
    const needsTitleFix = visiblePosts.filter((p) => {
      const firstLine = (p.caption || "").split("\n")[0] || "";
      return (
        firstLine.length > 60 &&
        p.title === firstLine.slice(0, p.title.length)
      );
    });

    // Batch fix in groups of 20
    const BATCH = 20;
    for (let i = 0; i < needsTitleFix.length; i += BATCH) {
      const batch = needsTitleFix.slice(i, i + BATCH).map((p) => ({
        id: p.id,
        caption: p.caption || "",
      }));
      const titleMap = await generateTitlesViaClaude(batch);
      for (const [postId, newTitle] of titleMap) {
        await db.update(posts).set({ title: newTitle }).where(eq(posts.id, postId));
        titlesFixes++;
      }
    }
  }

  console.log(`[seo-watchdog] done — sitesChecked=${sitesChecked} titlesFixes=${titlesFixes} warnings=${warnings.length}`);
  return { sitesChecked, titlesFixes, warnings };
}
