import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";
import crypto from "crypto";

// POST /api/subscribe — Subscribe to a directory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, name, categories, frequency } = body;

    if (!siteId || !email?.trim()) {
      return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
    }

    // Stricter email validation — require at least 2 chars in TLD
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolvedSiteId = await resolveSiteId(siteId) || siteId;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if already subscribed
    const existing = await db.query.subscribers.findFirst({
      where: and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.email, normalizedEmail)),
    });

    if (existing) {
      // Update preferences
      await db.update(subscribers)
        .set({
          categories: categories || existing.categories,
          frequency: frequency || existing.frequency,
          isActive: true,
        })
        .where(eq(subscribers.id, existing.id));
      return NextResponse.json({ message: "Preferences updated" });
    }

    const unsubscribeToken = crypto.randomBytes(32).toString("hex");

    await db.insert(subscribers).values({
      siteId: resolvedSiteId,
      email: normalizedEmail,
      name: name?.trim() || null,
      categories: categories || [],
      frequency: frequency || "weekly",
      unsubscribeToken,
      isVerified: false,
      isActive: true,
    });

    // TODO: Send verification email with unsubscribeToken link

    return NextResponse.json({ message: "Subscribed successfully" }, { status: 201 });
  } catch (err) {
    console.error("[subscribe] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE /api/subscribe — Unsubscribe
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, token } = body;

    if (!siteId || (!email && !token)) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolvedSiteId = await resolveSiteId(siteId) || siteId;

    if (token) {
      // Unsubscribe via secure token (from email link)
      await db.update(subscribers)
        .set({ isActive: false })
        .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.unsubscribeToken, token)));
    } else if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      await db.update(subscribers)
        .set({ isActive: false })
        .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.email, normalizedEmail)));
    }

    return NextResponse.json({ message: "Unsubscribed" });
  } catch (err) {
    console.error("[subscribe] Unsubscribe error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET /api/subscribe?siteId=xxx — Get subscriber stats (for dashboard)
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ total: 0, active: 0, verified: 0, thisWeek: 0 });
  }

  const resolvedSiteId = await resolveSiteId(siteId) || siteId;

  const [totalResult] = await db.select({ count: count() })
    .from(subscribers)
    .where(eq(subscribers.siteId, resolvedSiteId));

  const [activeResult] = await db.select({ count: count() })
    .from(subscribers)
    .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.isActive, true)));

  const [verifiedResult] = await db.select({ count: count() })
    .from(subscribers)
    .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.isVerified, true)));

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const allSubs = await db.query.subscribers.findMany({
    where: eq(subscribers.siteId, resolvedSiteId),
  });
  const thisWeek = allSubs.filter((s) => new Date(s.createdAt) >= oneWeekAgo).length;

  return NextResponse.json({
    total: totalResult.count,
    active: activeResult.count,
    verified: verifiedResult.count,
    thisWeek,
  });
}
