import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { platformConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/platforms?siteId=xxx — List platform connections for a site
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ connections: [] });
  }

  const connections = await db.query.platformConnections.findMany({
    where: eq(platformConnections.siteId, siteId),
  });

  return NextResponse.json({
    connections: connections.map((c) => ({
      id: c.id,
      platform: c.platform,
      handle: c.handle,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      followerCount: c.followerCount,
      postCount: c.postCount ?? 0,
      isConnected: c.isConnected,
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      syncStatus: c.syncStatus,
    })),
  });
}

// POST /api/platforms — Connect a new platform
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, platform, handle } = body;

    if (!siteId || !platform || !handle) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validPlatforms = ["instagram", "tiktok", "youtube"];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    // TODO: In production:
    // 1. Verify the handle exists on the platform
    // 2. Create platformConnections record
    // 3. Kick off initial scrape pipeline for this platform

    return NextResponse.json({
      connection: {
        id: `pc-${Date.now()}`,
        platform,
        handle: handle.replace(/^@/, ""),
        displayName: handle.replace(/^@/, ""),
        avatarUrl: null,
        followerCount: null,
        postCount: 0,
        isConnected: true,
        lastSyncAt: null,
        syncStatus: "idle",
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH /api/platforms — Sync or disconnect a platform
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, action } = body;

    if (!connectionId || !action) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (action === "sync") {
      // TODO: Kick off scrape pipeline for this platform connection
      return NextResponse.json({ syncStatus: "syncing", message: "Sync started" });
    }

    if (action === "disconnect") {
      // TODO: Set isConnected = false, optionally remove posts
      return NextResponse.json({ isConnected: false });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
