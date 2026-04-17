/**
 * Video Transcription Module — provider-agnostic.
 *
 * Reads TRANSCRIPTION_PROVIDER from env ("groq" | "deepgram"). Default
 * is "groq" (Whisper Large v3 via Groq's OpenAI-compatible endpoint,
 * ~7× cheaper than Deepgram for similar quality on short reels).
 *
 * Falls back to an empty transcript when the selected provider has no
 * credentials configured, so a missing key never breaks the pipeline.
 */

import { captureError } from "@/lib/error";

export type TranscriptResult = {
  text: string;
  duration: number;
  language: string;
  segments: {
    start: number;
    end: number;
    text: string;
  }[];
};

const EMPTY: TranscriptResult = { text: "", duration: 0, language: "en", segments: [] };

// Groq's Whisper endpoint accepts audio/video files up to 25 MB (free
// tier) / 100 MB (paid). Skip oversize files to avoid a guaranteed
// rejection.
const GROQ_MAX_BYTES = 25 * 1024 * 1024;

async function transcribeWithGroq(videoUrl: string): Promise<TranscriptResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return EMPTY;

  // Groq takes a multipart file upload, not a URL like Deepgram does.
  // Download the bytes first (Vercel Blob URLs are public), then forward.
  const srcController = new AbortController();
  const srcTimeout = setTimeout(() => srcController.abort(), 90_000);
  let videoBlob: Blob;
  try {
    const srcRes = await fetch(videoUrl, { signal: srcController.signal });
    if (!srcRes.ok) throw new Error(`source fetch HTTP ${srcRes.status}`);
    const len = Number(srcRes.headers.get("content-length") || 0);
    if (len && len > GROQ_MAX_BYTES) {
      throw new Error(
        `video is ${(len / 1024 / 1024).toFixed(1)} MB, exceeds Groq's 25 MB cap`,
      );
    }
    videoBlob = await srcRes.blob();
    if (videoBlob.size > GROQ_MAX_BYTES) {
      throw new Error(
        `video is ${(videoBlob.size / 1024 / 1024).toFixed(1)} MB, exceeds Groq's 25 MB cap`,
      );
    }
  } finally {
    clearTimeout(srcTimeout);
  }

  const form = new FormData();
  // Groq infers the mimetype from the filename extension; mp4 is safe
  // for both Instagram reels and TikTok downloads.
  form.append("file", videoBlob, "video.mp4");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");

  const uploadController = new AbortController();
  const uploadTimeout = setTimeout(() => uploadController.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: uploadController.signal,
    });
  } catch (err) {
    clearTimeout(uploadTimeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Groq request timed out after 3 minutes");
    }
    throw err;
  }
  clearTimeout(uploadTimeout);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Groq HTTP ${response.status}: ${body.slice(0, 200) || "(no body)"}`,
    );
  }

  let data: {
    text?: string;
    language?: string;
    duration?: number;
    segments?: { start: number; end: number; text: string }[];
  };
  try {
    data = await response.json();
  } catch {
    throw new Error("Groq returned invalid JSON");
  }

  return {
    text: data.text || "",
    duration: data.duration || 0,
    language: data.language || "en",
    segments: (data.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  };
}

async function transcribeWithDeepgram(videoUrl: string): Promise<TranscriptResult> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return EMPTY;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: videoUrl }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    clearTimeout(t);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Deepgram request timed out after 3 minutes");
    }
    throw err;
  }
  clearTimeout(t);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Deepgram HTTP ${response.status}: ${body.slice(0, 200) || "(no body)"}`,
    );
  }

  let data: {
    results?: {
      channels?: { alternatives?: { transcript?: string }[]; detected_language?: string }[];
      utterances?: { start: number; end: number; transcript: string }[];
    };
    metadata?: { duration?: number };
  };
  try {
    data = await response.json();
  } catch {
    throw new Error("Deepgram returned invalid JSON");
  }
  const result = data.results?.channels?.[0]?.alternatives?.[0];
  if (!result) return EMPTY;

  const segments = (data.results?.utterances || []).map((u) => ({
    start: u.start,
    end: u.end,
    text: u.transcript,
  }));

  return {
    text: result.transcript || "",
    duration: data.metadata?.duration || 0,
    language: data.results?.channels?.[0]?.detected_language || "en",
    segments,
  };
}

/**
 * Transcribe a video with retry + automatic fallback.
 *
 * Strategy (when primary = Groq):
 *   1. Try Groq (Whisper Large v3)
 *   2. If empty OR Groq throws → fall back to Deepgram if
 *      DEEPGRAM_API_KEY is set
 *   3. If everything fails → return EMPTY (never crash the pipeline)
 *
 * This covers the three common failure modes:
 *   - Music-only reels → Groq returns empty, Deepgram also returns
 *     empty (correct; there's nothing to transcribe)
 *   - Rate-limit / transient error → Deepgram catches it
 *   - Audio format Groq can't decode → Deepgram as second opinion
 */
export async function transcribeVideo(videoUrl: string): Promise<TranscriptResult> {
  if (!videoUrl) return EMPTY;
  const provider = (process.env.TRANSCRIPTION_PROVIDER || "groq").toLowerCase();

  if (provider === "deepgram") {
    return transcribeWithDeepgram(videoUrl);
  }

  // Primary: Groq
  let result: TranscriptResult;
  try {
    result = await transcribeWithGroq(videoUrl);
  } catch (err) {
    console.warn(
      `[transcriber] groq attempt 1 threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    result = EMPTY;
  }

  // If Groq returned empty text or threw, fall back to Deepgram
  if (!result.text && process.env.DEEPGRAM_API_KEY) {
    console.warn("[transcriber] groq empty/failed — falling back to deepgram");
    try {
      result = await transcribeWithDeepgram(videoUrl);
    } catch (err) {
      console.warn(
        `[transcriber] deepgram fallback also failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      result = EMPTY;
    }
  }

  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcribeBatch(
  videos: { postId: string; videoUrl: string }[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, TranscriptResult>> {
  const results = new Map<string, TranscriptResult>();

  for (let i = 0; i < videos.length; i++) {
    const { postId, videoUrl } = videos[i];
    try {
      const result = await transcribeVideo(videoUrl);
      results.set(postId, result);
      if (!result.text) {
        console.warn(
          `[transcriber] post ${postId}: all providers returned empty (likely music-only or silent reel)`,
        );
      }
    } catch (err) {
      captureError(err, { context: "transcriber-batch", postId, videoUrl });
      results.set(postId, EMPTY);
    }
    // Throttle: 1.5s between calls to avoid Groq rate limits when
    // processing a batch of videos in sequence.
    if (i < videos.length - 1) await sleep(1500);
    onProgress?.(i + 1, videos.length);
  }

  return results;
}
