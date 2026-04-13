/**
 * Auto-Categorization Module
 *
 * Automatically categorizes posts based on their content.
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
 * LLM-based categorization.
 * More accurate for diverse content — costs per call.
 */
export async function categorizeWithLLM(
  caption: string,
  transcript: string | null,
  availableCategories: string[],
): Promise<CategoryResult> {
  // TODO: Implement with Claude API or OpenAI
  //
  // const message = await anthropic.messages.create({
  //   model: 'claude-haiku-4-5-20251001',
  //   max_tokens: 50,
  //   messages: [{
  //     role: 'user',
  //     content: `Categorize this social media post into one of these categories: ${availableCategories.join(', ')}
  //
  //     Caption: ${caption}
  //     ${transcript ? `Transcript: ${transcript}` : ''}
  //
  //     Respond with just the category name.`
  //   }]
  // });

  console.log(`[categorizer] Would categorize with LLM. Categories: ${availableCategories.join(", ")}`);
  return {
    category: availableCategories[0] || "Uncategorized",
    confidence: 0,
  };
}

/**
 * Detect categories from a set of posts.
 * Useful for suggesting categories to new users during onboarding.
 */
export async function detectCategories(
  captions: string[],
): Promise<string[]> {
  // TODO: Use LLM to analyze a sample of captions and suggest categories
  //
  // const message = await anthropic.messages.create({
  //   model: 'claude-haiku-4-5-20251001',
  //   max_tokens: 200,
  //   messages: [{
  //     role: 'user',
  //     content: `Analyze these social media post captions and suggest 3-6 content categories that best describe the themes:
  //
  //     ${captions.slice(0, 20).map((c, i) => `${i + 1}. ${c.slice(0, 200)}`).join('\n')}
  //
  //     Respond with a JSON array of category names.`
  //   }]
  // });

  return ["Business", "Education", "Current Affairs"];
}
