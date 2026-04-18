/**
 * Category Rebalancer — flags thin/bloated categories and re-categorizes
 * "Uncategorized" posts using Claude Haiku.
 */

import { db } from "@/db";
import { sites, posts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type Suggestion = { siteSlug: string; category: string; count: number; suggestion: string };

async function assignCategories(
  batch: { id: string; caption: string; title: string }[],
  existingCategories: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!ANTHROPIC_API_KEY || batch.length === 0 || existingCategories.length === 0) return result;

  const prompt = `Assign each post to the best matching category from the list below.
Return a JSON array: [{"id":"...","category":"..."}]
Only return the JSON array.

Available categories: ${JSON.stringify(existingCategories)}

Posts:
${batch.map((p) => JSON.stringify({ id: p.id, title: p.title, caption: p.caption.slice(0, 200) })).join("\n")}`;

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
        max_tokens: Math.min(200 * batch.length, 2048),
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return result;
    const data = await res.json();
    const text = (data.content?.[0]?.text || "").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return result;
    const parsed = JSON.parse(match[0]) as { id: string; category: string }[];
    for (const item of parsed) {
      if (item.id && item.category && existingCategories.includes(item.category)) {
        result.set(item.id, item.category);
      }
    }
  } catch {
    // ignore
  }
  return result;
}

export async function runCategoryRebalancer() {
  console.log("[category-rebalancer] starting");
  if (!db) return { skipped: "db not configured" };

  const publishedSites = await db.query.sites.findMany({
    where: eq(sites.isPublished, true),
    columns: { id: true, slug: true, categories: true },
  });

  let sitesChecked = 0;
  let postsRecategorized = 0;
  const suggestions: Suggestion[] = [];

  for (const site of publishedSites) {
    sitesChecked++;

    // Get category distribution
    const rows = await db
      .select({ category: posts.category, count: sql<number>`count(*)` })
      .from(posts)
      .where(and(eq(posts.siteId, site.id), eq(posts.isVisible, true)))
      .groupBy(posts.category);

    const existingCategories = rows
      .map((r) => r.category)
      .filter((c) => c && c !== "Uncategorized");

    for (const row of rows) {
      const count = Number(row.count);
      if (row.category !== "Uncategorized" && count === 1) {
        suggestions.push({ siteSlug: site.slug, category: row.category, count, suggestion: "only 1 post — consider merging with another category" });
      }
      if (row.category !== "Uncategorized" && count > 80) {
        suggestions.push({ siteSlug: site.slug, category: row.category, count, suggestion: "over 80 posts — consider splitting into sub-categories" });
      }
    }

    // Re-categorize "Uncategorized" posts if more than 5 and we have other categories
    const uncategorizedRow = rows.find((r) => r.category === "Uncategorized");
    const uncategorizedCount = Number(uncategorizedRow?.count ?? 0);

    if (uncategorizedCount > 5 && existingCategories.length > 0) {
      const uncatPosts = await db.query.posts.findMany({
        where: and(
          eq(posts.siteId, site.id),
          eq(posts.isVisible, true),
          eq(posts.category, "Uncategorized"),
        ),
        columns: { id: true, caption: true, title: true },
      });

      const BATCH = 20;
      for (let i = 0; i < uncatPosts.length; i += BATCH) {
        const batch = uncatPosts.slice(i, i + BATCH);
        const catMap = await assignCategories(batch, existingCategories);
        for (const [postId, category] of catMap) {
          await db.update(posts).set({ category }).where(eq(posts.id, postId));
          postsRecategorized++;
        }
      }
      console.log(`[category-rebalancer] site ${site.slug}: recategorized ${postsRecategorized} uncategorized posts`);
    }
  }

  console.log(`[category-rebalancer] done — sitesChecked=${sitesChecked} postsRecategorized=${postsRecategorized} suggestions=${suggestions.length}`);
  return { sitesChecked, postsRecategorized, suggestions };
}
