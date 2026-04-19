import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { revalidateTenantBySiteId } from "@/lib/cache";
import { uploadBuffer, deleteFile } from "@/lib/pipeline/storage";
import { getPlan, type PlanId } from "@/lib/plans";
import crypto from "node:crypto";

/**
 * GET /api/dashboard/posts?siteId=xxx
 * Returns posts for a site owned by the authenticated user.
 */
export async function GET(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Same ordering as the public directory so the dashboard list
  // mirrors what visitors actually see.
  const rows = await db.query.posts.findMany({
    where: eq(posts.siteId, siteId),
    orderBy: (p, { desc, asc }) => [
      desc(p.isFeatured),
      asc(p.sortOrder),
      desc(p.takenAt),
    ],
    limit: 500,
  });

  return NextResponse.json({
    posts: rows.map((p) => ({
      id: p.id,
      shortcode: p.shortcode,
      type: p.type,
      title: p.title,
      caption: p.caption,
      category: p.category,
      thumbUrl: p.thumbUrl,
      mediaUrl: p.mediaUrl,
      platformUrl: p.platformUrl,
      takenAt: p.takenAt?.toISOString() ?? null,
      isVisible: p.isVisible,
      isFeatured: p.isFeatured,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/dashboard/posts
 *
 * Manual-upload endpoint — the creator hand-builds a post with
 * their own thumbnail + media + caption + title + category, instead
 * of (or in addition to) the scraper pipeline. Available to every
 * plan. Does NOT consume any Apify/Groq/Anthropic budget.
 *
 * Request is multipart/form-data with these fields:
 *   siteId     string  required — must be owned by the caller
 *   caption    string  required
 *   title      string  optional — defaults to first 80 chars of caption
 *   category   string  optional — defaults to "Uncategorized"
 *   platformUrl string optional — link to the original social post
 *   type       "image"|"video" — inferred from media file if omitted
 *   thumbnail  file    required (≤ 5 MB, image/*)
 *   media      file    optional (≤ 100 MB, image/* or video/*)
 *
 * The 100 MB cap is our own guard, not R2's — R2 supports 5 TB/file.
 * We enforce it so a user can't run up storage cost uploading a
 * 4K feature film.
 *
 * sortOrder = max(existing) + 1 so new posts always append.
 * Post count is capped at the plan's postLimit.
 */
const MAX_THUMB_BYTES = 5 * 1024 * 1024;   // 5 MB
const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // 100 MB
const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);

// Allowlisted file extensions — validated server-side from the filename,
// NOT from the client-supplied MIME type which can be spoofed.
const THUMB_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const MEDIA_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm"]);

/** Extract lowercase extension from a filename, or empty string if none. */
function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export async function POST(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const siteId = String(form.get("siteId") || "");
  const caption = String(form.get("caption") || "").trim();
  const titleRaw = String(form.get("title") || "").trim();
  const categoryRaw = String(form.get("category") || "").trim();
  const platformUrl = String(form.get("platformUrl") || "").trim() || null;
  const typeRaw = String(form.get("type") || "").trim();
  const thumbFile = form.get("thumbnail");
  const mediaFile = form.get("media");

  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: "Missing or invalid siteId" }, { status: 400 });
  }
  if (!caption) {
    return NextResponse.json({ error: "Caption is required" }, { status: 400 });
  }
  if (caption.length > 5000) {
    return NextResponse.json({ error: "Caption too long (max 5000 chars)" }, { status: 400 });
  }
  if (!(thumbFile instanceof File) || thumbFile.size === 0) {
    return NextResponse.json({ error: "Thumbnail file is required" }, { status: 400 });
  }
  if (thumbFile.size > MAX_THUMB_BYTES) {
    return NextResponse.json({ error: "Thumbnail too large (max 5 MB)" }, { status: 400 });
  }
  // Validate file extension from the filename (not the client-supplied MIME type).
  const thumbExt = getFileExtension(thumbFile.name);
  if (!THUMB_EXTENSIONS.has(thumbExt)) {
    return NextResponse.json(
      { error: `Thumbnail file type not allowed. Accepted: ${[...THUMB_EXTENSIONS].join(", ")}` },
      { status: 400 },
    );
  }
  if (mediaFile instanceof File && mediaFile.size > 0) {
    if (mediaFile.size > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: "Media too large (max 100 MB)" }, { status: 400 });
    }
    const mediaExt = getFileExtension(mediaFile.name);
    if (!MEDIA_EXTENSIONS.has(mediaExt)) {
      return NextResponse.json(
        { error: `Media file type not allowed. Accepted: ${[...MEDIA_EXTENSIONS].join(", ")}` },
        { status: 400 },
      );
    }
  }

  // Ownership — the site must belong to the caller.
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true, slug: true, userId: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Plan-scoped post cap.
  const ownerRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { plan: true },
  });
  const planId: PlanId = (VALID_PLANS.has(ownerRow?.plan as string) ? ownerRow!.plan : "creator") as PlanId;
  const plan = getPlan(planId);
  if (plan.postLimit > 0) {
    const [{ c }] = await db
      .select({ c: sql<number>`cast(count(*) as int)` })
      .from(posts)
      .where(eq(posts.siteId, siteId));
    if (c >= plan.postLimit) {
      return NextResponse.json(
        {
          error: `${plan.name} plan is capped at ${plan.postLimit} posts. Upgrade or delete something first.`,
          reason: "post_limit_reached",
          limit: plan.postLimit,
        },
        { status: 403 },
      );
    }
  }

  // Infer post type from media file if not explicitly provided.
  let postType: "video" | "image" | "carousel" = "image";
  if (typeRaw === "video" || typeRaw === "image" || typeRaw === "carousel") {
    postType = typeRaw;
  } else if (mediaFile instanceof File && mediaFile.type.startsWith("video/")) {
    postType = "video";
  }

  // Shortcode: derive a random-ish id so the manual post has a stable
  // public URL even if the scraper later ingests something with the
  // same shortcode (we prefix with "m-" so these are never mistaken
  // for real Instagram shortcodes).
  const shortcode = "m-" + crypto.randomBytes(6).toString("base64url");
  const title = (titleRaw || caption.split("\n")[0] || "Untitled").slice(0, 80);
  const category = categoryRaw || "Uncategorized";

  // Upload thumbnail (required) + media (optional) to the active
  // provider. Paths mirror the pipeline layout so the public page
  // renders identically.
  let thumbUrl = "";
  let mediaUrl: string | null = null;
  try {
    const thumbBuf = Buffer.from(await thumbFile.arrayBuffer());
    const uploadThumbExt = getFileExtension(thumbFile.name) || "jpg";
    thumbUrl = await uploadBuffer(
      `sites/${site.slug}/thumbs/${shortcode}.${uploadThumbExt}`,
      thumbBuf,
      thumbFile.type,
    );
    if (!thumbUrl) throw new Error("thumbnail upload returned empty URL");

    if (mediaFile instanceof File && mediaFile.size > 0) {
      const mediaBuf = Buffer.from(await mediaFile.arrayBuffer());
      const uploadMediaExt = getFileExtension(mediaFile.name) || "mp4";
      mediaUrl = await uploadBuffer(
        `sites/${site.slug}/media/${shortcode}.${uploadMediaExt}`,
        mediaBuf,
        mediaFile.type,
      );
      if (!mediaUrl) mediaUrl = null; // non-fatal, thumbnail alone is enough
    }
  } catch (err) {
    console.error("[posts:manual-upload] storage failed:", err);
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
  }

  // sortOrder: MAX + 1 so the new post appends.
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${posts.sortOrder}), -1)` })
    .from(posts)
    .where(eq(posts.siteId, siteId));
  const nextSortOrder = (maxRow?.max ?? -1) + 1;

  const [created] = await db
    .insert(posts)
    .values({
      siteId,
      shortcode,
      type: postType,
      caption,
      title,
      category,
      takenAt: new Date(),
      thumbUrl,
      mediaUrl,
      platformUrl,
      isVisible: true,
      sortOrder: nextSortOrder,
    })
    .returning();

  await revalidateTenantBySiteId(siteId);

  return NextResponse.json({ post: created }, { status: 201 });
}

/**
 * PATCH /api/dashboard/posts?id=xxx
 * Updates title/caption/category/isVisible for a post owned by the caller.
 */
export async function PATCH(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Ownership check via site join
  const existing = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    columns: { id: true, siteId: true },
  });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, existing.siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if ("title" in body) {
    const v = body.title;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "title must be a string or null" }, { status: 400 });
    }
    if (typeof v === "string" && v.length > 500) {
      return NextResponse.json({ error: "title too long" }, { status: 400 });
    }
    updates.title = v === null ? null : v.trim() || null;
  }

  if ("caption" in body) {
    const v = body.caption;
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({ error: "caption must be a string or null" }, { status: 400 });
    }
    if (typeof v === "string" && v.length > 10000) {
      return NextResponse.json({ error: "caption too long" }, { status: 400 });
    }
    updates.caption = v === null ? null : v.trim() || null;
  }

  if ("category" in body) {
    const v = body.category;
    if (typeof v !== "string" || !v.trim()) {
      return NextResponse.json({ error: "category must be a non-empty string" }, { status: 400 });
    }
    if (v.length > 64) return NextResponse.json({ error: "category too long" }, { status: 400 });
    updates.category = v.trim();
  }

  if ("isVisible" in body) {
    if (typeof body.isVisible !== "boolean") {
      return NextResponse.json({ error: "isVisible must be a boolean" }, { status: 400 });
    }
    updates.isVisible = body.isVisible;
  }

  if ("isFeatured" in body) {
    if (typeof body.isFeatured !== "boolean") {
      return NextResponse.json({ error: "isFeatured must be a boolean" }, { status: 400 });
    }
    updates.isFeatured = body.isFeatured;
  }

  if ("transcriptSegments" in body) {
    // Plan-gated: edit_talking_points (Pro+)
    const owner = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { plan: true },
    });
    const { hasFeature } = await import("@/lib/plans");
    const planId = (["creator", "pro", "agency", "free"].includes(owner?.plan as string) ? owner!.plan : "creator") as "free" | "creator" | "pro" | "agency";
    if (!hasFeature(planId, "edit_talking_points")) {
      return NextResponse.json({ error: "Editing talking points requires Creator plan or above", reason: "plan_feature_missing" }, { status: 403 });
    }

    const v = body.transcriptSegments;
    if (v !== null && !Array.isArray(v)) {
      return NextResponse.json({ error: "transcriptSegments must be an array or null" }, { status: 400 });
    }
    if (Array.isArray(v)) {
      for (const seg of v) {
        if (typeof seg.start !== "number" || typeof seg.end !== "number" || typeof seg.text !== "string") {
          return NextResponse.json({ error: "Each segment must have start (number), end (number), text (string)" }, { status: 400 });
        }
      }
    }
    updates.transcriptSegments = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const [updated] = await db.update(posts).set(updates).where(eq(posts.id, id)).returning();
  if (updated) await revalidateTenantBySiteId(updated.siteId);
  return NextResponse.json({ post: updated });
}

/**
 * DELETE /api/dashboard/posts?id=xxx
 * Deletes a post owned by the caller.
 */
export async function DELETE(request: NextRequest) {
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    columns: { id: true, siteId: true, thumbUrl: true, mediaUrl: true },
  });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, existing.siteId), eq(sites.userId, user.id)),
    columns: { id: true },
  });
  if (!site) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Best-effort cleanup of stored media before removing the DB row.
  await Promise.all([
    existing.thumbUrl ? deleteFile(existing.thumbUrl) : Promise.resolve(),
    existing.mediaUrl ? deleteFile(existing.mediaUrl) : Promise.resolve(),
  ]);

  await db.delete(posts).where(eq(posts.id, id));
  await revalidateTenantBySiteId(existing.siteId);
  return NextResponse.json({ deleted: true });
}
