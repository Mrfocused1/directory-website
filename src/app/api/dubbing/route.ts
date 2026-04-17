import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites, users, dubbedVideos } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { hasFeature, type PlanId } from "@/lib/plans";
import { generateDubbedAudio } from "@/lib/dubbing/dubbing-service";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);
const SUPPORTED_LANGS = ["es", "fr", "pt"];

/**
 * POST /api/dubbing
 * Body: { siteId: string, postId: string, targetLang: string }
 * Returns: { audioUrl: string, cached: boolean }
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;

  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { siteId, postId, targetLang } = body;

  if (!siteId || !postId || !targetLang) {
    return NextResponse.json({ error: "Missing siteId, postId, or targetLang" }, { status: 400 });
  }
  if (!SUPPORTED_LANGS.includes(targetLang)) {
    return NextResponse.json({ error: `Unsupported language: ${targetLang}` }, { status: 400 });
  }

  // Plan check
  const ownerRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { plan: true },
  });
  const planId = (VALID_PLANS.has(ownerRow?.plan as string) ? ownerRow!.plan : "free") as PlanId;
  if (!hasFeature(planId, "dubbing")) {
    return NextResponse.json({ error: "Dubbing requires Pro plan or above" }, { status: 403 });
  }

  // Verify ownership
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true, slug: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Get post
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.siteId, siteId)),
    columns: { id: true, shortcode: true, mediaUrl: true, transcript: true },
  });
  if (!post || !post.mediaUrl) {
    return NextResponse.json({ error: "Post not found or has no video" }, { status: 404 });
  }
  if (!post.transcript) {
    return NextResponse.json({ error: "Post has no transcript" }, { status: 400 });
  }

  // Check cache
  const cached = await db.query.dubbedVideos.findFirst({
    where: and(eq(dubbedVideos.postId, postId), eq(dubbedVideos.lang, targetLang)),
  });
  if (cached?.status === "completed" && cached.audioUrl) {
    return NextResponse.json({
      audioUrl: cached.audioUrl,
      videoUrl: cached.videoUrl ?? null,
      cached: true,
    });
  }
  if (cached?.status === "processing") {
    return NextResponse.json({ error: "Dubbing already in progress" }, { status: 409 });
  }

  // Mark as processing
  let rowId: string;
  if (cached) {
    await db.update(dubbedVideos).set({ status: "processing" }).where(eq(dubbedVideos.id, cached.id));
    rowId = cached.id;
  } else {
    const [row] = await db.insert(dubbedVideos).values({ postId, lang: targetLang, status: "processing" }).returning({ id: dubbedVideos.id });
    rowId = row.id;
  }

  // Generate
  try {
    const result = await generateDubbedAudio({
      siteSlug: site.slug,
      postShortcode: post.shortcode,
      videoUrl: post.mediaUrl,
      transcript: post.transcript,
      targetLang,
    });

    await db.update(dubbedVideos).set({
      status: "completed",
      audioUrl: result.audioUrl,
      videoUrl: result.videoUrl,
    }).where(eq(dubbedVideos.id, rowId));

    return NextResponse.json({
      audioUrl: result.audioUrl,
      videoUrl: result.videoUrl,
      cached: false,
    });
  } catch (err) {
    console.error("[dubbing] Failed:", err);
    await db.update(dubbedVideos).set({ status: "failed" }).where(eq(dubbedVideos.id, rowId));
    return NextResponse.json({ error: "Dubbing failed" }, { status: 500 });
  }
}
