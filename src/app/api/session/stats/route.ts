/**
 * GET /api/session/stats
 *
 * Aggregates the session_events table into plain numbers so we can
 * answer "how long does the IG session actually live?" with data
 * instead of guesses.
 *
 * Returns:
 *   - events: raw list (most recent first, capped)
 *   - lifespans: the gap between each `refreshed` and the next `died`
 *   - deadGaps: the gap between each `died` and the next `refreshed`
 *                (tells us how long we go unnoticed before refreshing)
 *   - summary: count, min/median/mean/max of each above in hours
 *
 * Auth: same recovery key as the recover endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessionEvents } from "@/db/schema";
import { desc } from "drizzle-orm";

const RECOVERY_KEY = process.env.SESSION_RECOVERY_KEY;

function stats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    count: values.length,
    minHours: +sorted[0].toFixed(2),
    medianHours: +median.toFixed(2),
    meanHours: +mean.toFixed(2),
    maxHours: +sorted[sorted.length - 1].toFixed(2),
  };
}

export async function GET(request: NextRequest) {
  if (!RECOVERY_KEY || request.headers.get("x-recovery-key") !== RECOVERY_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const events = await db
    .select()
    .from(sessionEvents)
    .orderBy(desc(sessionEvents.createdAt))
    .limit(200);

  // Chronological order makes pairing easier
  const chrono = [...events].reverse();

  const lifespansHours: number[] = [];
  const deadGapsHours: number[] = [];
  let lastRefresh: Date | null = null;
  let lastDied: Date | null = null;

  for (const e of chrono) {
    const t = new Date(e.createdAt);
    if (e.eventType === "refreshed") {
      if (lastDied) {
        deadGapsHours.push((t.getTime() - lastDied.getTime()) / 3_600_000);
        lastDied = null;
      }
      lastRefresh = t;
    } else if (e.eventType === "died") {
      if (lastRefresh) {
        lifespansHours.push((t.getTime() - lastRefresh.getTime()) / 3_600_000);
        lastRefresh = null;
      }
      lastDied = t;
    }
  }

  return NextResponse.json({
    events: events.slice(0, 50), // most recent 50
    lifespans: {
      ...stats(lifespansHours),
      values: lifespansHours.map((v) => +v.toFixed(2)),
    },
    deadGaps: {
      ...stats(deadGapsHours),
      values: deadGapsHours.map((v) => +v.toFixed(2)),
    },
  });
}
