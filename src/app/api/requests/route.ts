import { NextRequest, NextResponse } from "next/server";
import { getMockRequests, type ContentRequest } from "@/lib/requests/mock-data";

// In-memory store for demo (replaced by DB in production)
let requests: ContentRequest[] = getMockRequests();

// GET /api/requests?siteId=xxx&sort=votes|newest|status
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  const sort = request.nextUrl.searchParams.get("sort") || "votes";
  const status = request.nextUrl.searchParams.get("status");

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  let filtered = [...requests];

  // Filter by status
  if (status && status !== "all") {
    filtered = filtered.filter((r) => r.status === status);
  }

  // Sort
  if (sort === "newest") {
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === "votes") {
    // Pinned first, then by votes
    filtered.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.voteCount - a.voteCount;
    });
  }

  return NextResponse.json({ requests: filtered });
}

// POST /api/requests — Submit a new content request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, title, description, authorName } = body;

    if (!siteId || !title?.trim()) {
      return NextResponse.json({ error: "Missing siteId or title" }, { status: 400 });
    }

    const newRequest: ContentRequest = {
      id: `req-${Date.now()}`,
      title: title.trim(),
      description: description?.trim() || null,
      authorName: authorName?.trim() || null,
      status: "open",
      isPinned: false,
      voteCount: 1,
      hasVoted: true,
      creatorNote: null,
      completedPostShortcode: null,
      createdAt: new Date().toISOString(),
    };

    requests = [newRequest, ...requests];

    return NextResponse.json({ request: newRequest }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH /api/requests — Vote or update status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, action, ...updates } = body;

    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (action === "vote") {
      if (requests[idx].hasVoted) {
        // Unvote
        requests[idx] = { ...requests[idx], voteCount: Math.max(0, requests[idx].voteCount - 1), hasVoted: false };
      } else {
        requests[idx] = { ...requests[idx], voteCount: requests[idx].voteCount + 1, hasVoted: true };
      }
    } else if (action === "update_status") {
      // Creator actions
      requests[idx] = {
        ...requests[idx],
        status: updates.status || requests[idx].status,
        creatorNote: updates.creatorNote !== undefined ? updates.creatorNote : requests[idx].creatorNote,
        isPinned: updates.isPinned !== undefined ? updates.isPinned : requests[idx].isPinned,
        updatedAt: new Date().toISOString(),
      };
    }

    return NextResponse.json({ request: requests[idx] });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
