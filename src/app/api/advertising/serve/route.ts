import { NextRequest } from "next/server";
import { db } from "@/db";
import { ads, adSlots } from "@/db/schema";
import { and, eq, lte, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const siteId = searchParams.get("siteId");
  const slotType = searchParams.get("slotType");

  if (!siteId || !slotType) {
    return Response.json({ ad: null }, { status: 400 });
  }

  if (!db) {
    return Response.json({ ad: null }, { status: 503 });
  }

  const now = new Date();

  const results = await db
    .select({
      id: ads.id,
      slotType: adSlots.slotType,
      assetUrl: ads.assetUrl,
      clickUrl: ads.clickUrl,
      headline: ads.headline,
      body: ads.body,
    })
    .from(ads)
    .innerJoin(adSlots, eq(ads.slotId, adSlots.id))
    .where(
      and(
        eq(ads.siteId, siteId),
        eq(adSlots.slotType, slotType),
        eq(adSlots.enabled, true),
        eq(ads.status, "active"),
        lte(ads.startsAt, now),
        gte(ads.endsAt, now),
      ),
    );

  if (results.length === 0) {
    return new Response(JSON.stringify({ ad: null }), {
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }

  // pick one at random among active ads
  const ad = results[Math.floor(Math.random() * results.length)];

  // derive asset type from URL extension
  const ext = ad.assetUrl?.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const assetType = ["mp4", "webm", "mov", "ogg"].includes(ext) ? "video" : "image";

  return new Response(
    JSON.stringify({
      ad: {
        id: ad.id,
        slotType: ad.slotType,
        assetType,
        assetUrl: ad.assetUrl,
        clickUrl: ad.clickUrl,
        headline: ad.headline,
        body: ad.body,
      },
    }),
    { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } },
  );
}
