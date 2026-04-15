import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { references, posts, sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";

/**
 * /api/dashboard/posts/[postId]/references
 *
 * Owner-gated CRUD for a post's references. Used by the post editor
 * in the /dashboard/posts modal so creators can curate the
 * "Sources & references" list shown in their public directory.
 */

async function ensurePostOwnership(postId: string, userId: string) {
  if (!db) return null;
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    columns: { id: true, siteId: true },
  });
  if (!post) return null;
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, post.siteId), eq(sites.userId, userId)),
    columns: { id: true },
  });
  return site ? post : null;
}

function validateRefBody(body: Record<string, unknown>): { error?: string; data?: {
  kind: "youtube" | "article";
  title: string;
  url: string | null;
  videoId: string | null;
  note: string | null;
} } {
  const kind = body.kind;
  if (kind !== "youtube" && kind !== "article") {
    return { error: "kind must be 'youtube' or 'article'" };
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "title is required" };
  if (title.length > 200) return { error: "title too long (max 200)" };

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;

  if (kind === "article") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return { error: "article references require a url" };
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { error: "url must be http(s)" };
      }
    } catch {
      return { error: "invalid url" };
    }
    return { data: { kind, title, url, videoId: null, note } };
  }

  // YouTube — needs either a videoId (11-char) OR a url.
  const rawVid = typeof body.videoId === "string" ? body.videoId.trim() : "";
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  let videoId: string | null = null;
  let url: string | null = null;

  if (rawVid && /^[A-Za-z0-9_-]{11}$/.test(rawVid)) {
    videoId = rawVid;
  } else if (rawUrl) {
    // Try to extract a videoId from the URL first
    const ytId = rawUrl.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytId) {
      videoId = ytId[1];
    } else {
      try {
        const u = new URL(rawUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return { error: "url must be http(s)" };
        }
        url = rawUrl;
      } catch {
        return { error: "invalid url" };
      }
    }
  } else {
    return { error: "youtube references require either a videoId or a url" };
  }
  return { data: { kind, title, url, videoId, note } };
}

// GET /api/dashboard/posts/[postId]/references
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { postId } = await params;
  const post = await ensurePostOwnership(postId, user.id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const rows = await db.query.references.findMany({
    where: eq(references.postId, postId),
    orderBy: (r, { asc }) => [asc(r.sortOrder), asc(r.id)],
  });
  return NextResponse.json({
    references: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      url: r.url,
      videoId: r.videoId,
      note: r.note,
    })),
  });
}

// POST /api/dashboard/posts/[postId]/references — create
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { postId } = await params;
  const post = await ensurePostOwnership(postId, user.id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const validated = validateRefBody(body);
  if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });

  const [created] = await db.insert(references).values({
    postId,
    ...validated.data!,
  }).returning();

  return NextResponse.json({
    reference: {
      id: created.id,
      kind: created.kind,
      title: created.title,
      url: created.url,
      videoId: created.videoId,
      note: created.note,
    },
  }, { status: 201 });
}

// PATCH /api/dashboard/posts/[postId]/references?refId=xxx
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { postId } = await params;
  const post = await ensurePostOwnership(postId, user.id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const refId = request.nextUrl.searchParams.get("refId");
  if (!refId) return NextResponse.json({ error: "Missing refId" }, { status: 400 });

  const existing = await db.query.references.findFirst({
    where: and(eq(references.id, refId), eq(references.postId, postId)),
  });
  if (!existing) return NextResponse.json({ error: "Reference not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const validated = validateRefBody(body);
  if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });

  const [updated] = await db
    .update(references)
    .set(validated.data!)
    .where(eq(references.id, refId))
    .returning();

  return NextResponse.json({
    reference: {
      id: updated.id,
      kind: updated.kind,
      title: updated.title,
      url: updated.url,
      videoId: updated.videoId,
      note: updated.note,
    },
  });
}

// DELETE /api/dashboard/posts/[postId]/references?refId=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { postId } = await params;
  const post = await ensurePostOwnership(postId, user.id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const refId = request.nextUrl.searchParams.get("refId");
  if (!refId) return NextResponse.json({ error: "Missing refId" }, { status: 400 });

  const result = await db
    .delete(references)
    .where(and(eq(references.id, refId), eq(references.postId, postId)))
    .returning({ id: references.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Reference not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
