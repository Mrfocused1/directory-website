/**
 * Video Transcription Module — powered by Deepgram
 *
 * Transcribes video content using Deepgram's Nova-2 model.
 * Falls back to empty transcript if Deepgram is not configured.
 */

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

export async function transcribeVideo(videoUrl: string): Promise<TranscriptResult> {
  if (!process.env.DEEPGRAM_API_KEY || !videoUrl) {
    return { text: "", duration: 0, language: "en", segments: [] };
  }

  // Deepgram-by-URL takes a few minutes for long videos. Cap so a hung
  // request doesn't burn the whole Vercel function budget.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
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
    // Surface the underlying reason so the runner / job log shows
    // what's actually wrong (REMOTE_CONTENT_ERROR for inaccessible
    // URLs, INVALID_AUTH for bad keys, etc.) instead of swallowing.
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

  if (!result) {
    return { text: "", duration: 0, language: "en", segments: [] };
  }

  // Build segments from utterances or paragraphs
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

export async function transcribeBatch(
  videos: { postId: string; videoUrl: string }[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, TranscriptResult>> {
  const results = new Map<string, TranscriptResult>();

  for (let i = 0; i < videos.length; i++) {
    const { postId, videoUrl } = videos[i];
    const result = await transcribeVideo(videoUrl);
    results.set(postId, result);
    onProgress?.(i + 1, videos.length);
  }

  return results;
}
