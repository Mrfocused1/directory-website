/**
 * Video Transcription Module
 *
 * Transcribes video content using AI services.
 * Previously used local faster-whisper — for SaaS scale,
 * we use cloud APIs instead.
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
  // TODO: Implement using one of these services:
  //
  // Option A (recommended): Deepgram
  //   - Fast, accurate, cost-effective
  //   - const { result } = await deepgram.listen.prerecorded.transcribeUrl({ url: videoUrl }, { model: 'nova-2', smart_format: true })
  //   - Returns word-level timestamps
  //
  // Option B: AssemblyAI
  //   - Great accuracy, good for long content
  //   - const transcript = await client.transcripts.transcribe({ audio_url: videoUrl })
  //
  // Option C: OpenAI Whisper API
  //   - Simple API, good accuracy
  //   - Must download video first (accepts file upload, not URL)
  //   - const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1' })

  console.log(`[transcriber] Would transcribe: ${videoUrl}`);
  return {
    text: "",
    duration: 0,
    language: "en",
    segments: [],
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
