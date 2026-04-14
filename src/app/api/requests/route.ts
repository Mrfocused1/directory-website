import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contentRequests, requestVotes } from "@/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";

// GET /api/requests?siteId=xxx&sort=votes|newest|status&sessionId=xxx
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  const sort = request.nextUrl.searchParams.get("sort") || "votes";
  const status = request.nextUrl.searchParams.get("status");
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ requests: [] });
  }

  const resolvedSiteId = await resolveSiteId(siteId);
  if (!resolvedSiteId) {
    return NextResponse.json({ requests: [] });
  }

  let query = db.select().from(contentRequests).where(eq(contentRequests.siteId, resolvedSiteId)).$dynamic();

  if (status && status !== "all") {
    query = query.where(and(eq(contentRequests.siteId, resolvedSiteId), eq(contentRequests.status, status)));
  }

  if (sort === "newest") {
    query = query.orderBy(desc(contentRequests.createdAt));
  } else {
    // Default: pinned first, then by votes
    query = query.orderBy(desc(contentRequests.isPinned), desc(contentRequests.voteCount));
  }

  const rows = await query;

  // Check which requests this session has voted on
  let votedIds = new Set<string>();
  if (sessionId) {
    const votes = await db.select({ requestId: requestVotes.requestId })
      .from(requestVotes)
      .where(eq(requestVotes.sessionId, sessionId));
    votedIds = new Set(votes.map((v) => v.requestId));
  }

  const requests = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    authorName: r.authorName,
    status: r.status,
    isPinned: r.isPinned,
    voteCount: r.voteCount,
    hasVoted: votedIds.has(r.id),
    creatorNote: r.creatorNote,
    completedPostShortcode: r.completedPostShortcode,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ requests });
}

// POST /api/requests — Submit a new content request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, title, description, authorName } = body;

    if (!siteId || !title?.trim()) {
      return NextResponse.json({ error: "Missing siteId or title" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolvedSiteId = await resolveSiteId(siteId);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const [newRequest] = await db.insert(contentRequests).values({
      siteId: resolvedSiteId,
      title: title.trim(),
      description: description?.trim() || null,
      authorName: authorName?.trim() || null,
      status: "open",
      isPinned: false,
      voteCount: 1,
    }).returning();

    return NextResponse.json({
      request: {
        id: newRequest.id,
        title: newRequest.title,
        description: newRequest.description,
        authorName: newRequest.authorName,
        status: newRequest.status,
        isPinned: newRequest.isPinned,
        voteCount: newRequest.voteCount,
        hasVoted: true,
        creatorNote: newRequest.creatorNote,
        completedPostShortcode: newRequest.completedPostShortcode,
        createdAt: newRequest.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[requests] Create error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH /api/requests — Vote or update status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, action, sessionId, ...updates } = body;

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const existing = await db.query.contentRequests.findFirst({
      where: eq(contentRequests.id, requestId),
    });
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    let didVote = false;

    if (action === "vote") {
      if (!sessionId) {
        return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
      }

      // Check if already voted
      const existingVote = await db.query.requestVotes.findFirst({
        where: and(eq(requestVotes.requestId, requestId), eq(requestVotes.sessionId, sessionId)),
      });

      if (existingVote) {
        // Unvote
        await db.delete(requestVotes).where(eq(requestVotes.id, existingVote.id));
        await db.update(contentRequests)
          .set({ voteCount: sql`GREATEST(0, ${contentRequests.voteCount} - 1)` })
          .where(eq(contentRequests.id, requestId));
        didVote = false;
      } else {
        // Vote
        await db.insert(requestVotes).values({ requestId, sessionId });
        await db.update(contentRequests)
          .set({ voteCount: sql`${contentRequests.voteCount} + 1` })
          .where(eq(contentRequests.id, requestId));
        didVote = true;
      }
    } else if (action === "update_status") {
      await db.update(contentRequests)
        .set({
          status: updates.status || existing.status,
          creatorNote: updates.creatorNote !== undefined ? updates.creatorNote : existing.creatorNote,
          isPinned: updates.isPinned !== undefined ? updates.isPinned : existing.isPinned,
          updatedAt: new Date(),
        })
        .where(eq(contentRequests.id, requestId));
    }

    // Fetch updated record
    const updated = await db.query.contentRequests.findFirst({
      where: eq(contentRequests.id, requestId),
    });

    return NextResponse.json({
      request: updated ? {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        authorName: updated.authorName,
        status: updated.status,
        isPinned: updated.isPinned,
        voteCount: updated.voteCount,
        hasVoted: didVote,
        creatorNote: updated.creatorNote,
        completedPostShortcode: updated.completedPostShortcode,
        createdAt: updated.createdAt.toISOString(),
      } : null,
    });
  } catch (err) {
    console.error("[requests] Patch error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
