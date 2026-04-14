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
 * Useful for suggesting categories to new users during onboarding.
 */
export async function detectCategories(captions: string[]): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY || captions.length === 0) {
    return ["General"];
  }

  try {
    const sample = captions.slice(0, 20).map((c, i) => `${i + 1}. ${c.slice(0, 200)}`).join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Analyze these social media post captions and suggest 3-6 content categories that best describe the themes. Respond with a JSON array of category names only, like ["Category1", "Category2"].\n\n${sample}`,
        }],
      }),
    });

    if (!response.ok) return ["General"];

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || "[]";

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const categories = JSON.parse(match[0]);
      if (Array.isArray(categories) && categories.length > 0) {
        return categories.filter((c: unknown) => typeof c === "string").slice(0, 8);
      }
    }

    return ["General"];
  } catch (error) {
    console.error("[categorizer] detectCategories error:", error);
    return ["General"];
  }
}
