import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { platformConnections, sites } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ownedSiteId } from "@/db/utils";
import { getApiUser } from "@/lib/supabase/api";

// GET /api/platforms?siteId=xxx — List platform connections for a site
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ connections: [] });
  }

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const resolvedSiteId = await ownedSiteId(siteId, user.id);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const connections = await db.query.platformConnections.findMany({
      where: eq(platformConnections.siteId, resolvedSiteId),
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
  } catch (error) {
    console.error("[platforms] GET error:", error);
    return NextResponse.json({ connections: [] });
  }
}

// POST /api/platforms — Connect a new platform to a site
export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, platform, handle } = body;

    if (!siteId || !platform || !handle) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validPlatforms = ["instagram", "tiktok", "youtube"];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    // Validate handle format
    if (!/^@?[a-zA-Z0-9_.-]+$/.test(handle) || handle.length > 128) {
      return NextResponse.json({ error: "Invalid handle format" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Verify the user owns the target site
    const resolvedSiteId = await ownedSiteId(siteId, user.id);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cleanHandle = handle.replace(/^@/, "");

    // Insert the platform connection
    const [connection] = await db.insert(platformConnections).values({
      siteId: resolvedSiteId,
      platform,
      handle: cleanHandle,
      displayName: cleanHandle,
      isConnected: true,
      syncStatus: "idle",
    }).onConflictDoNothing({
      target: [platformConnections.siteId, platformConnections.platform, platformConnections.handle],
    }).returning();

    if (!connection) {
      // Conflict — connection already exists. Return existing.
      const existing = await db.query.platformConnections.findFirst({
        where: and(
          eq(platformConnections.siteId, resolvedSiteId),
          eq(platformConnections.platform, platform),
          eq(platformConnections.handle, cleanHandle),
        ),
      });
      return NextResponse.json({ connection: existing, message: "Already connected" });
    }

    return NextResponse.json({
      connection: {
        id: connection.id,
        platform: connection.platform,
        handle: connection.handle,
        displayName: connection.displayName,
        avatarUrl: connection.avatarUrl,
        followerCount: connection.followerCount,
        postCount: connection.postCount ?? 0,
        isConnected: connection.isConnected,
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
        syncStatus: connection.syncStatus,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[platforms] POST error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH /api/platforms — Sync or disconnect a platform
export async function PATCH(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, action } = body;

    if (!connectionId || !action) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Look up connection and verify the user owns the parent site
    const conn = await db.query.platformConnections.findFirst({
      where: eq(platformConnections.id, connectionId),
    });
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, conn.siteId),
      columns: { userId: true },
    });
    if (!site || site.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "sync") {
      await db.update(platformConnections)
        .set({ syncStatus: "syncing" })
        .where(eq(platformConnections.id, connectionId));
      // TODO: Kick off scrape pipeline (Inngest event) for this connection
      return NextResponse.json({ syncStatus: "syncing", message: "Sync started" });
    }

    if (action === "disconnect") {
      await db.update(platformConnections)
        .set({ isConnected: false })
        .where(eq(platformConnections.id, connectionId));
      return NextResponse.json({ isConnected: false });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[platforms] PATCH error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
