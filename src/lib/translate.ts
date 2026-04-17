/**
 * LibreTranslate integration for multi-language transcript translation.
 *
 * The LibreTranslate instance is expected to be self-hosted and referenced
 * via the LIBRETRANSLATE_URL env var (no trailing slash).
 */

export interface SupportedLanguage {
  code: string;
  name: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "pt", name: "Portuguese" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
];

/**
 * Translate text to the given target language via LibreTranslate.
 * Returns the original text on any failure (timeout, network error, missing config).
 */
export async function translateText(
  text: string,
  targetLang: string,
): Promise<string> {
  const baseUrl = process.env.LIBRETRANSLATE_URL;
  if (!baseUrl) {
    console.warn("[translate] LIBRETRANSLATE_URL is not configured");
    return text;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${baseUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "en",
        target: targetLang,
        format: "text",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        `[translate] LibreTranslate returned ${res.status}: ${await res.text().catch(() => "")}`,
      );
      return text;
    }

    const data = (await res.json()) as { translatedText?: string };
    return data.translatedText ?? text;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error("[translate] Request timed out after 10s");
    } else {
      console.error("[translate] Request failed:", err);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
