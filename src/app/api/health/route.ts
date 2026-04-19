import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Lightweight liveness probe. Used by uptime monitors (Checkly, etc.)
 * to know the app is reachable and the DB responds. Returns 503 if the
 * database errors; any other failures get a 200 so transient upstream
 * issues don't trigger alerts.
 */
export async function GET() {
  const started = Date.now();
  try {
    if (db) {
      await db.execute(sql`SELECT 1`);
    }
    return NextResponse.json({
      ok: true,
      dbLatencyMs: Date.now() - started,
      service: "buildmy.directory",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        service: "buildmy.directory",
        error: err instanceof Error ? err.message : "db error",
      },
      { status: 503 },
    );
  }
}
