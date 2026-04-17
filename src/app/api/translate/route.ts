import { NextRequest, NextResponse } from "next/server";
import { translateText, SUPPORTED_LANGUAGES } from "@/lib/translate";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit-middleware";

/**
 * POST /api/translate
 *
 * Translates text to the requested target language via LibreTranslate.
 * Body: { text: string; targetLang: string }
 * Returns: { translated: string }
 */
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, apiLimiter);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { text, targetLang } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required and must be a string" },
        { status: 400 },
      );
    }

    if (!targetLang || typeof targetLang !== "string") {
      return NextResponse.json(
        { error: "targetLang is required and must be a string" },
        { status: 400 },
      );
    }

    const validCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
    if (!validCodes.includes(targetLang)) {
      return NextResponse.json(
        { error: `Unsupported language. Supported: ${validCodes.join(", ")}` },
        { status: 400 },
      );
    }

    // Cap input length to avoid abuse (transcripts shouldn't exceed ~50k chars)
    if (text.length > 50_000) {
      return NextResponse.json(
        { error: "Text too long (max 50,000 characters)" },
        { status: 400 },
      );
    }

    const translated = await translateText(text, targetLang);

    return NextResponse.json({ translated });
  } catch (err) {
    console.error("[api/translate] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
