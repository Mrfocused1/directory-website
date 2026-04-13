import { NextRequest, NextResponse } from "next/server";

// In-memory store for demo
const subscribers = new Map<string, { email: string; name: string | null; categories: string[]; frequency: string; siteId: string; createdAt: string }>();

// POST /api/subscribe — Subscribe to a directory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, name, categories, frequency } = body;

    if (!siteId || !email?.trim()) {
      return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const key = `${siteId}:${email.toLowerCase().trim()}`;

    if (subscribers.has(key)) {
      // Update preferences
      const existing = subscribers.get(key)!;
      subscribers.set(key, {
        ...existing,
        categories: categories || existing.categories,
        frequency: frequency || existing.frequency,
      });
      return NextResponse.json({ message: "Preferences updated" });
    }

    subscribers.set(key, {
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      categories: categories || [],
      frequency: frequency || "weekly",
      siteId,
      createdAt: new Date().toISOString(),
    });

    // TODO: In production:
    // 1. Insert into subscribers table
    // 2. Generate unsubscribe token
    // 3. Send verification email
    // 4. Only mark as verified after they click the link

    return NextResponse.json({ message: "Subscribed successfully" }, { status: 201 });
  } catch {
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

    // TODO: In production, verify unsubscribe token
    // await db.update(subscribers).set({ isActive: false }).where(eq(subscribers.unsubscribeToken, token));

    if (email) {
      const key = `${siteId}:${email.toLowerCase().trim()}`;
      subscribers.delete(key);
    }

    return NextResponse.json({ message: "Unsubscribed" });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET /api/subscribe?siteId=xxx — Get subscriber stats (for dashboard)
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  // In production, query from DB
  // For demo, return mock counts
  return NextResponse.json({
    total: 13,
    active: 11,
    verified: 12,
    thisWeek: 3,
  });
}
