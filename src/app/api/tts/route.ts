import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

const PIPER_URL = process.env.PIPER_TTS_URL || "";

const SUPPORTED_LANGS = ["en", "es", "fr", "de", "pt"];

/**
 * POST /api/tts
 * Body: { text: string, lang: string }
 * Returns: audio/wav binary
 *
 * Proxies to the self-hosted Piper TTS server.
 */
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, apiLimiter);
  if (limited) return limited;

  if (!PIPER_URL) {
    return NextResponse.json({ error: "TTS service not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { text, lang } = body;

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (!lang || !SUPPORTED_LANGS.includes(lang)) {
    return NextResponse.json(
      { error: `lang must be one of: ${SUPPORTED_LANGS.join(", ")}` },
      { status: 400 },
    );
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "text too long (max 5000 chars)" }, { status: 400 });
  }

  try {
    const res = await fetch(`${PIPER_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "TTS failed" }));
      return NextResponse.json(err, { status: res.status });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "public, max-age=86400", // cache for 24h
      },
    });
  } catch {
    return NextResponse.json({ error: "TTS service unavailable" }, { status: 502 });
  }
}
