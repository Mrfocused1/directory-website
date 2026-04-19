/**
 * Talking Points Extractor
 *
 * Analyzes a video transcript to identify meaningful talking points —
 * when the speaker introduces a new tip, makes a numbered point,
 * changes topic, or transitions to a new argument.
 *
 * Uses Groq's free-tier Llama-3.3-70B (no Anthropic API spend) to parse
 * the timestamped transcript and return curated talking points with
 * accurate start times.
 *
 * Cost: $0 on Groq free tier (rate-limited ~30 req/min on llama-3.3-70b).
 *
 * Guards learned the hard way on propertybykazy 2026-04-19:
 *   - Reject titles > 150 chars — Groq sometimes pastes raw transcript
 *     back instead of emitting a label.
 *   - Reject outputs where every start time collapses to the same value
 *     (happens when raw Whisper segments are coarse and the LLM anchors
 *     everything to a single boundary).
 *   - Use Groq's exact M:SS timestamp as the segment start, not the
 *     nearest raw-segment boundary — snapping collapses multiple points
 *     onto the same coarse timestamp.
 */

type Segment = { start: number; end: number; text: string };

type TalkingPoint = { start: number; end: number; text: string };

/**
 * Extract talking points from transcript segments.
 * Returns curated points that represent actual topic changes,
 * numbered tips, listed reasons, new arguments, etc.
 *
 * Falls back to merged raw segments on any failure.
 */
export async function extractTalkingPoints(
  segments: Segment[],
  transcript: string,
): Promise<TalkingPoint[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || segments.length === 0) return fallbackPoints(segments);

  const timestamped = segments.map(
    (s) => `[${fmtTime(s.start)}] ${(s.text || "").trim()}`,
  ).join("\n").slice(0, 8000);

  const prompt = `You are analysing a timestamped video transcript. Identify 3-8 TALKING POINTS — the key moments the speaker transitions to a new topic, introduces a new tip, starts a numbered step, or makes a significant argument shift.

Timestamped transcript:

${timestamped}

Full transcript (for keyword anchoring):
${(transcript || "").slice(0, 2500)}

Rules:
- Title: a SHORT LABEL (5-12 words). NOT a direct quote — rephrase as a clear description.
- Time: M:SS timestamp from the timestamped transcript above. If "step 3" is spoken 30s into a [0:00]-[1:09] segment, output "0:30".
- Aim for 3-8 points. If the speaker numbers steps ("step one", "step two"), follow their numbering exactly.
- Short videos (<30s of audio) with no clear structure → 1-2 broad points.
- Include key facts: prices, percentages, durations (e.g. "Step 3 — Bridging loan 3-24 months", "£36k finance cost at 0.8%/month").
- Spread timestamps across the audio, don't cluster them all at the start.

Return ONLY a JSON array, no prose:
[
  { "time": "0:00", "title": "Brief label for what starts here" },
  { "time": "0:15", "title": "Next major point" }
]`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 800,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return fallbackPoints(segments);

    const data = await res.json();
    const text: string = (data.choices?.[0]?.message?.content || "").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallbackPoints(segments);

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallbackPoints(segments);

    const maxAudio = segments[segments.length - 1].end;
    const points: TalkingPoint[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (typeof item?.time !== "string" || typeof item?.title !== "string") continue;

      const title = item.title.trim();
      // Guard 1: reject titles > 150 chars — Groq occasionally pastes raw transcript
      if (title.length > 150) continue;

      const startSeconds = Math.min(parseTime(item.time), maxAudio);
      const nextItem = parsed[i + 1];
      const endSeconds = nextItem
        ? Math.min(parseTime(nextItem.time), maxAudio)
        : maxAudio;

      points.push({
        start: startSeconds,
        end: endSeconds,
        text: title.slice(0, 200),
      });
    }

    if (points.length === 0) return fallbackPoints(segments);

    // Guard 2: reject if all start times collapsed to the same value
    // (happens when raw Whisper segments are coarse and the LLM anchors
    // everything to a single boundary). Fall back to the old merger.
    const uniqueStarts = new Set(points.map((p) => Math.round(p.start)));
    if (points.length > 1 && uniqueStarts.size === 1) {
      return fallbackPoints(segments);
    }

    return points;
  } catch {
    return fallbackPoints(segments);
  }
}

/** Fallback: merge raw segments into ~30s chunks (the old behavior) */
function fallbackPoints(segments: Segment[]): TalkingPoint[] {
  if (segments.length === 0) return [];
  const points: TalkingPoint[] = [];
  let chunkStart = segments[0].start;
  let chunkTexts: string[] = [];

  for (const seg of segments) {
    if (seg.start - chunkStart >= 30 && chunkTexts.length > 0) {
      points.push({
        start: chunkStart,
        end: seg.start,
        text: chunkTexts.join(" ").slice(0, 200),
      });
      chunkStart = seg.start;
      chunkTexts = [];
    }
    chunkTexts.push(seg.text.trim());
  }
  if (chunkTexts.length > 0) {
    points.push({
      start: chunkStart,
      end: segments[segments.length - 1].end,
      text: chunkTexts.join(" ").slice(0, 200),
    });
  }
  return points;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTime(str: string): number {
  const parts = str.replace(/^\[|\]$/g, "").split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return Number(str) || 0;
}
