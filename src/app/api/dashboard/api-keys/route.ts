import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { generateApiKey } from "@/lib/api-auth";
import { hasFeature, type PlanId } from "@/lib/plans";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);

async function requireApiAccess(userId: string) {
  if (!db) return null;
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { plan: true },
  });
  const plan = (VALID_PLANS.has(u?.plan as string) ? u!.plan : "free") as PlanId;
  return hasFeature(plan, "api_access") ? plan : null;
}

// GET /api/dashboard/api-keys — list the caller's keys (without exposing raw key)
export async function GET() {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const plan = await requireApiAccess(user.id);
  if (!plan) {
    return NextResponse.json(
      { error: "API access requires the Agency plan", keys: [] },
      { status: 403 },
    );
  }

  const rows = await db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, user.id),
    orderBy: [desc(apiKeys.createdAt)],
  });

  return NextResponse.json({
    keys: rows.map((k) => ({
      id: k.id,
      label: k.label,
      prefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
}

// POST /api/dashboard/api-keys — create a new key (returns raw value ONE time)
export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const plan = await requireApiAccess(user.id);
  if (!plan) {
    return NextResponse.json({ error: "API access requires the Agency plan" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (label.length > 64) return NextResponse.json({ error: "Label too long" }, { status: 400 });

  // Enforce max 10 active keys per user to prevent abuse
  const existing = await db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, user.id),
  });
  if (existing.length >= 10) {
    return NextResponse.json({ error: "Max 10 API keys. Revoke an unused one." }, { status: 400 });
  }

  const { raw, hash, prefix } = generateApiKey();

  const [created] = await db.insert(apiKeys).values({
    userId: user.id,
    label,
    keyPrefix: prefix,
    keyHash: hash,
  }).returning();

  return NextResponse.json({
    key: raw, // shown ONCE — client must copy it now
    id: created.id,
    label: created.label,
    prefix: created.keyPrefix,
    createdAt: created.createdAt.toISOString(),
  }, { status: 201 });
}

// DELETE /api/dashboard/api-keys?id=xxx — revoke a key
export async function DELETE(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const result = await db.delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
