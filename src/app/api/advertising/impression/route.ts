import { NextRequest } from "next/server";
import { db } from "@/db";
import { adImpressions } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { captureError } from "@/lib/error";

export const dynamic = "force-dynamic";

// in-memory dedup: sessionId+adId -> last impression timestamp
// resets on cold start, which is fine — the 30s window is best-effort
const recentImpressions = new Map<string, number>();

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { adId, path, sessionId } = body ?? {};

  if (!adId || typeof adId !== "string") {
    return new Response(null, { status: 400 });
  }

  const key = `${sessionId ?? "anon"}:${adId}`;
  const last = recentImpressions.get(key) ?? 0;
  const now = Date.now();

  if (now - last < 30_000) {
    // dedup within 30s — still return 204 so client doesn't retry
    return new Response(null, { status: 204 });
  }

  recentImpressions.set(key, now);

  // fire and forget — don't await, return 204 immediately
  if (db) {
    db.insert(adImpressions)
      .values({ adId, sessionId: sessionId ?? null, path: path ?? null })
      .catch((err) => captureError(err, { context: "ad-impression-insert", adId }));
  }

  return new Response(null, { status: 204 });
}
