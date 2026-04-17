/**
 * Talking Points Extractor
 *
 * Analyzes a video transcript to identify meaningful talking points —
 * when the speaker introduces a new tip, makes a numbered point,
 * changes topic, or transitions to a new argument.
 *
 * Uses Claude Haiku to parse the transcript against the timestamped
 * segments, returning curated talking points with accurate start times.
 *
 * Cost: ~$0.001 per post (Claude Haiku).
 */

type Segment = { start: number; end: number; text: string };

type TalkingPoint = { start: number; end: number; text: string };

/**
 * Extract talking points from transcript segments.
 * Returns curated points that represent actual topic changes,
 * numbered tips, listed reasons, new arguments, etc.
 */
export async function extractTalkingPoints(
  segments: Segment[],
  transcript: string,
): Promise<TalkingPoint[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || segments.length === 0) return segments;

  // Build a timestamped transcript for Claude to analyze
  const timestamped = segments.map(
    (s) => `[${fmtTime(s.start)}] ${s.text.trim()}`
  ).join("\n");

  const prompt = `You are analyzing a video transcript to identify TALKING POINTS — the key moments where the speaker transitions to a new topic, introduces a new tip/point/reason, or makes a significant shift in their argument.

Here is the timestamped transcript:

${timestamped.slice(0, 8000)}

Identify the TALKING POINTS. A talking point starts when the speaker:
- Introduces a numbered item ("number one", "first thing", "tip #2", "secondly", "the next thing")
- Lists a reason or argument ("one reason is", "another thing", "here's why")
- Shifts to a completely new topic or subtopic
- Opens or closes with an intro/outro ("today I'm going to talk about", "so to summarize")
- Makes a key claim or statement that anchors the next section

Rules:
- Each talking point should have a SHORT title (5-12 words) that summarizes what's discussed
- The title should NOT be a quote — rephrase it as a clear label
- Include the EXACT timestamp from the transcript where this point begins (use the [M:SS] format from the transcript)
- Aim for 3-8 talking points per video. Don't over-split — only mark genuine transitions
- If the speaker explicitly numbers their points ("tip 1", "reason 2"), follow their numbering
- If the video is short (<30s) with no clear structure, return just 1-2 broad talking points

Return a JSON array:
[
  { "time": "0:00", "title": "Brief description of what's discussed" },
  { "time": "0:15", "title": "Next major point or topic shift" }
]

Output ONLY the JSON array. No explanation.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return fallbackPoints(segments);

    const data = await res.json();
    const text = (data.content?.[0]?.text || "").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallbackPoints(segments);

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallbackPoints(segments);

    // Convert Claude's output to TalkingPoint format
    const points: TalkingPoint[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item.time !== "string" || typeof item.title !== "string") continue;

      const startSeconds = parseTime(item.time);

      // Find the nearest segment for accurate start/end
      const nearestSeg = segments.reduce((best, seg) =>
        Math.abs(seg.start - startSeconds) < Math.abs(best.start - startSeconds) ? seg : best
      );

      // End time = next point's start, or last segment's end
      const nextItem = parsed[i + 1];
      const endSeconds = nextItem ? parseTime(nextItem.time) : segments[segments.length - 1].end;

      points.push({
        start: nearestSeg.start,
        end: endSeconds,
        text: item.title.trim().slice(0, 200),
      });
    }

    return points.length > 0 ? points : fallbackPoints(segments);
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
