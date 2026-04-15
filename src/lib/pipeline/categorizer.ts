/**
 * Auto-Categorization Module — powered by Claude API
 *
 * Two approaches: keyword-based (fast, free) and LLM-based (smart, costs per call).
 */

export type CategoryResult = {
  category: string;
  confidence: number;
};

/**
 * Keyword-based categorization using regex patterns.
 * Fast and free — good for known content domains.
 */
export function categorizeByKeywords(
  caption: string,
  transcript: string | null,
  categoryRules: Record<string, string[]>,
): CategoryResult {
  const text = `${caption} ${transcript || ""}`.toLowerCase();

  let bestCategory = "Uncategorized";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(categoryRules)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return {
    category: bestCategory,
    confidence: bestScore > 0 ? Math.min(bestScore / 3, 1) : 0,
  };
}

/**
 * LLM-based categorization using Claude Haiku.
 * More accurate for diverse content — costs ~$0.0003 per call.
 */
export async function categorizeWithLLM(
  caption: string,
  transcript: string | null,
  availableCategories: string[],
): Promise<CategoryResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { category: availableCategories[0] || "Uncategorized", confidence: 0 };
  }

  try {
    const content = `Categorize this social media post into exactly one of these categories: ${availableCategories.join(", ")}

Caption: ${caption.slice(0, 500)}
${transcript ? `Transcript: ${transcript.slice(0, 500)}` : ""}

Respond with ONLY the category name, nothing else.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      console.error("[categorizer] Claude API error:", response.status);
      return { category: availableCategories[0] || "Uncategorized", confidence: 0 };
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text?.trim() || "";

    // Match against available categories (case-insensitive)
    const matched = availableCategories.find(
      (c) => c.toLowerCase() === answer.toLowerCase(),
    );

    return {
      category: matched || availableCategories[0] || "Uncategorized",
      confidence: matched ? 0.9 : 0.3,
    };
  } catch (error) {
    console.error("[categorizer] Error:", error);
    return { category: availableCategories[0] || "Uncategorized", confidence: 0 };
  }
}

/**
 * Detect categories from a set of post captions using Claude.
 *
 * The prompt now forces the model to identify the creator's niche
 * first, then propose category names that are *specific to that niche*
 * (e.g. for a UK accountant: "Tax Strategy", "Property Investment",
 * "Business Building" — not generic "Updates", "General", "Featured").
 *
 * Constraints communicated to the model:
 *  - Categories are 1-3 words max
 *  - Cover ALL the posts in the sample, not just the most common topic
 *  - Niche-specific, not generic content-type labels
 *  - Each post should be likely to fit exactly one category
 */
export async function detectCategories(captions: string[]): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY || captions.length === 0) {
    return ["General"];
  }

  try {
    const sample = captions
      .slice(0, 30)
      .map((c, i) => `${i + 1}. ${c.slice(0, 250)}`)
      .join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `You are organizing a creator's content into a searchable directory.

Below are ${captions.length > 30 ? "30 sample" : ""} captions from one creator's social media posts. Your job:

STEP 1 — In one sentence to yourself, identify the creator's specific niche (e.g. "UK personal-finance / accounting" or "Latin American street food" or "Gen-Z mental health coaching"). Look at the topics, the vocabulary, the entities mentioned.

STEP 2 — Produce 4–7 category names that:
  • Are SPECIFIC to that niche (not generic — never use "General", "Updates", "Featured", "Other", "Tips", "Content")
  • Are 1–3 words each (e.g. "Tax Strategy", "Property Investment", "Wealth Mindset")
  • Together cover ALL the posts in the sample, not just the most common topic
  • Each post should fit clearly into exactly ONE category
  • Match the creator's actual vocabulary where possible

STEP 3 — Output ONLY a JSON array, no preamble, no explanation. Like: ["Tax Strategy", "Property Investment", "Business Building", "Wealth Mindset"]

Captions:
${sample}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn("[categorizer] detectCategories HTTP", response.status);
      return ["General"];
    }

    const data = await response.json();
    const text = (data.content?.[0]?.text || "").trim();
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const categories = JSON.parse(match[0]);
        if (Array.isArray(categories) && categories.length > 0) {
          // Reject any generic fallback strings the model may have slipped in
          const REJECT = new Set([
            "general", "updates", "featured", "other", "misc",
            "miscellaneous", "tips", "content", "uncategorized", "posts",
          ]);
          const cleaned = categories
            .filter((c: unknown): c is string => typeof c === "string")
            .map((c) => c.trim())
            .filter((c) => c.length > 0 && c.length <= 32)
            .filter((c) => !REJECT.has(c.toLowerCase()))
            .slice(0, 8);
          if (cleaned.length > 0) return cleaned;
        }
      } catch {
        // Fall through to default
      }
    }

    return ["General"];
  } catch (error) {
    console.error("[categorizer] detectCategories error:", error);
    return ["General"];
  }
}
