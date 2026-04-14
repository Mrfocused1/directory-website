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

  try {
    const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&utterances=true", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: videoUrl }),
    });

    if (!response.ok) {
      console.error("[transcriber] Deepgram error:", response.status, await response.text());
      return { text: "", duration: 0, language: "en", segments: [] };
    }

    const data = await response.json();
    const result = data.results?.channels?.[0]?.alternatives?.[0];

    if (!result) {
      return { text: "", duration: 0, language: "en", segments: [] };
    }

    // Build segments from utterances or paragraphs
    const segments = (data.results?.utterances || []).map((u: { start: number; end: number; transcript: string }) => ({
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
  } catch (error) {
    console.error("[transcriber] Error:", error);
    return { text: "", duration: 0, language: "en", segments: [] };
  }
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
