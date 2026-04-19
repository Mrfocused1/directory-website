import { NextRequest } from "next/server";
import { db } from "@/db";
import { ads, adClicks } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { adId, sessionId } = body ?? {};

  if (!adId || typeof adId !== "string") {
    return Response.json({ error: "adId required" }, { status: 400 });
  }

  if (!db) {
    return Response.json({ error: "db unavailable" }, { status: 503 });
  }

  const [ad] = await db
    .select({ clickUrl: ads.clickUrl })
    .from(ads)
    .where(eq(ads.id, adId))
    .limit(1);

  if (!ad) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // fire and forget
  db.insert(adClicks)
    .values({ adId, sessionId: sessionId ?? null })
    .catch((err) => console.error("[ad click] insert failed:", err));

  return Response.json({ clickUrl: ad.clickUrl });
}
