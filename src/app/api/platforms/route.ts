import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { platformConnections, sites, users } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { ownedSiteId } from "@/db/utils";
import { getApiUser } from "@/lib/supabase/api";
import { getPlan, type PlanId, type Platform } from "@/lib/plans";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

// GET /api/platforms?siteId=xxx — List platform connections for a site
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
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
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
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

    // Enforce per-plan accountsPerPlatform limit
    const validPlanIds = ["free", "creator", "pro", "agency"];
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { plan: true },
    });
    const planId = (validPlanIds.includes(dbUser?.plan as string) ? dbUser!.plan : "creator") as PlanId;
    const planConfig = getPlan(planId);
    const platformLimit = planConfig.accountsPerPlatform[platform as Platform];

    const [{ count: existingCount }] = await db
      .select({ count: count() })
      .from(platformConnections)
      .where(and(
        eq(platformConnections.siteId, resolvedSiteId),
        eq(platformConnections.platform, platform),
      ));

    if (existingCount >= platformLimit) {
      return NextResponse.json(
        platformLimit === 0
          ? { error: `${platform} is not available on the ${planConfig.name} plan. Please upgrade.` }
          : { error: `${platform} account limit reached (${platformLimit} max on ${planConfig.name} plan). Upgrade for more.` },
        { status: 403 },
      );
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
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
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

    if (action === "update_handle") {
      const rawHandle = typeof body.handle === "string" ? body.handle.trim() : "";
      if (!rawHandle) {
        return NextResponse.json({ error: "Missing handle" }, { status: 400 });
      }
      if (!/^@?[a-zA-Z0-9_.-]+$/.test(rawHandle) || rawHandle.length > 128) {
        return NextResponse.json({ error: "Invalid handle format" }, { status: 400 });
      }
      const cleanHandle = rawHandle.replace(/^@/, "");
      // Prevent collision with another connection on the same site+platform
      const collision = await db.query.platformConnections.findFirst({
        where: and(
          eq(platformConnections.siteId, conn.siteId),
          eq(platformConnections.platform, conn.platform),
          eq(platformConnections.handle, cleanHandle),
        ),
      });
      if (collision && collision.id !== conn.id) {
        return NextResponse.json({ error: "Another connection already uses that handle" }, { status: 409 });
      }
      await db.update(platformConnections)
        .set({
          handle: cleanHandle,
          displayName: cleanHandle,
          // Wipe fetched metadata so the next sync repopulates for the new handle
          avatarUrl: null,
          followerCount: null,
          syncStatus: "idle",
        })
        .where(eq(platformConnections.id, connectionId));
      return NextResponse.json({ handle: cleanHandle });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[platforms] PATCH error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
