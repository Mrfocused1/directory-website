import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api";
import { db } from "@/db";
import { adSlots, sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SLOT_TYPES } from "@/lib/advertising/slot-types";

export const dynamic = "force-dynamic";

// Verify the caller owns the given site, return site row or null
async function verifyOwnership(userId: string, siteId: string) {
  if (!db) return null;
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);
  return site ?? null;
}

// GET /api/advertising/slots?siteId=X
// Returns all 11 slot shapes zipped with any existing DB rows
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const owned = await verifyOwnership(user.id, siteId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(adSlots)
    .where(eq(adSlots.siteId, siteId));

  const rowByType = Object.fromEntries(rows.map((r) => [r.slotType, r]));

  // Zip the canonical 11-slot list with existing DB rows so the UI has a stable shape
  const slots = SLOT_TYPES.map((def) => {
    const row = rowByType[def.id];
    return {
      id: row?.id ?? null,
      siteId,
      slotType: def.id,
      enabled: row?.enabled ?? false,
      pricePerWeekCents: row?.pricePerWeekCents ?? def.defaultPriceCents,
      minWeeks: row?.minWeeks ?? 1,
      maxWeeks: row?.maxWeeks ?? 52,
      createdAt: row?.createdAt ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ slots });
}

// POST /api/advertising/slots
// Upserts a slot row for (siteId, slotType)
export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { siteId, slotType, enabled, pricePerWeekCents, minWeeks, maxWeeks } = body;
  if (!siteId || !slotType) {
    return NextResponse.json({ error: "siteId and slotType required" }, { status: 400 });
  }

  const owned = await verifyOwnership(user.id, siteId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const [saved] = await db
    .insert(adSlots)
    .values({
      siteId,
      slotType,
      enabled: enabled ?? false,
      pricePerWeekCents: pricePerWeekCents ?? null,
      minWeeks: minWeeks ?? 1,
      maxWeeks: maxWeeks ?? 52,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [adSlots.siteId, adSlots.slotType],
      set: {
        enabled: enabled ?? false,
        pricePerWeekCents: pricePerWeekCents ?? null,
        minWeeks: minWeeks ?? 1,
        maxWeeks: maxWeeks ?? 52,
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({ slot: saved });
}

// DELETE /api/advertising/slots?id=X
// Soft-disable — never hard-delete (would cascade to purchased ads)
export async function DELETE(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Verify ownership via join
  const [slot] = await db
    .select({ id: adSlots.id, siteId: adSlots.siteId })
    .from(adSlots)
    .where(eq(adSlots.id, id))
    .limit(1);

  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owned = await verifyOwnership(user.id, slot.siteId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(adSlots)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(adSlots.id, id));

  return NextResponse.json({ ok: true });
}
