// Re-categorize already-published sites with niche-specific Claude
// prompts. Runs against captions already in the DB — no Apify spend.
//
// Usage: node scripts/backfill-categories.mjs [siteSlug]
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.match(/^[A-Z_]+=/))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const sql = postgres(env.DATABASE_URL, { max: 1 });
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;

async function callClaude(content, max_tokens = 200) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "";
}

async function detectCategories(captions) {
  const sample = captions.slice(0, 30).map((c, i) => `${i + 1}. ${c.slice(0, 250)}`).join("\n\n");
  const text = await callClaude(
    `You are organizing a creator's content into a searchable directory.

Below are ${captions.length > 30 ? "30 sample" : ""} captions from one creator's social media posts. Your job:

STEP 1 — In one sentence to yourself, identify the creator's specific niche (e.g. "UK personal-finance / accounting" or "Latin American street food"). Look at the topics, the vocabulary, the entities mentioned.

STEP 2 — Produce 4–7 category names that:
  • Are SPECIFIC to that niche (not generic — never use "General", "Updates", "Featured", "Other", "Tips", "Content")
  • Are 1–3 words each (e.g. "Tax Strategy", "Property Investment", "Wealth Mindset")
  • Together cover ALL the posts in the sample
  • Each post should fit clearly into exactly ONE category
  • Match the creator's actual vocabulary where possible

STEP 3 — Output ONLY a JSON array, no preamble. Like: ["Tax Strategy", "Property Investment", "Business Building", "Wealth Mindset"]

Captions:
${sample}`,
    400,
  );
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return ["General"];
  const REJECT = new Set([
    "general", "updates", "featured", "other", "misc", "miscellaneous",
    "tips", "content", "uncategorized", "posts",
  ]);
  return JSON.parse(m[0])
    .filter((c) => typeof c === "string")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.length <= 32 && !REJECT.has(c.toLowerCase()))
    .slice(0, 8);
}

async function categorizeOne(caption, transcript, categories) {
  const text = await callClaude(
    `Categorize this social media post into exactly one of these categories: ${categories.join(", ")}

Caption: ${(caption || "").slice(0, 500)}
${transcript ? `Transcript: ${transcript.slice(0, 500)}` : ""}

Respond with ONLY the category name, nothing else.`,
    50,
  );
  const matched = categories.find((c) => c.toLowerCase() === text.toLowerCase());
  return matched || categories[0];
}

const targetSlug = process.argv[2] || null;
const sites = targetSlug
  ? await sql`SELECT id, slug, handle FROM sites WHERE slug = ${targetSlug}`
  : await sql`SELECT id, slug, handle FROM sites WHERE is_published = true`;

console.log(`Backfilling categories for ${sites.length} site(s)\n`);

for (const s of sites) {
  console.log(`──── ${s.slug} (@${s.handle}) ────`);
  const posts = await sql`SELECT id, caption, transcript FROM posts WHERE site_id = ${s.id}`;
  if (posts.length === 0) {
    console.log(`  (no posts)`);
    continue;
  }
  const captions = posts.map((p) => p.caption || "").filter(Boolean);
  console.log(`  detecting niche categories from ${captions.length} captions…`);
  let cats;
  try {
    cats = await detectCategories(captions);
  } catch (e) {
    console.log(`  detectCategories failed: ${e.message}`);
    continue;
  }
  console.log(`  → categories: ${cats.join(", ")}`);

  // Always include "Uncategorized" as a fallback
  if (!cats.includes("Uncategorized")) cats = [...cats, "Uncategorized"];

  await sql`UPDATE sites SET categories = ${cats}::jsonb WHERE id = ${s.id}`;

  console.log(`  categorizing ${posts.length} posts…`);
  let updated = 0;
  for (const p of posts) {
    try {
      const cat = await categorizeOne(p.caption, p.transcript, cats);
      await sql`UPDATE posts SET category = ${cat} WHERE id = ${p.id}`;
      updated++;
    } catch (e) {
      console.log(`    skip ${p.id.slice(0, 8)}: ${e.message?.slice(0, 60)}`);
    }
  }
  console.log(`  → ${updated}/${posts.length} posts updated\n`);
}

await sql.end();
console.log("Done.");
