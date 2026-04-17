import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, sites, users, dubbedVideos } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { hasFeature, type PlanId } from "@/lib/plans";
import { translateText } from "@/lib/translate";
import { generateDubbedVideo } from "@/lib/dubbing/dubbing-service";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);
const SUPPORTED_DUBBING_LANGS = ["es", "fr", "pt"];

/**
 * POST /api/dubbing
 *
 * Generate a dubbed (voice-cloned + lip-synced) version of a post's video
 * in the requested target language.
 *
 * Body: { siteId: string, postId: string, targetLang: string }
 * Returns: { dubbedVideoUrl: string }
 *
 * Requires authentication + Pro/Agency plan (feature key: "dubbing").
 * If a dubbed version already exists for the (postId, lang) pair, returns
 * the cached URL immediately without re-generating.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // ── Auth ──────────────────────────────────────────────────────────
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // ── Plan check ────────────────────────────────────────────────────
  const ownerRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { plan: true },
  });
  const planId: PlanId = (VALID_PLANS.has(ownerRow?.plan as string)
    ? ownerRow!.plan
    : "free") as PlanId;

  if (!hasFeature(planId, "dubbing")) {
    return NextResponse.json(
      {
        error: "Dubbing requires Pro plan or above",
        reason: "plan_feature_missing",
      },
      { status: 403 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────
  const body = await request.json().catch(() => ({}));
  const { siteId, postId, targetLang } = body;

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }
  if (!postId || typeof postId !== "string") {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }
  if (!targetLang || !SUPPORTED_DUBBING_LANGS.includes(targetLang)) {
    return NextResponse.json(
      { error: `targetLang must be one of: ${SUPPORTED_DUBBING_LANGS.join(", ")}` },
      { status: 400 },
    );
  }

  // ── Ownership: site must belong to caller ─────────────────────────
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    columns: { id: true, slug: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // ── Look up the post ──────────────────────────────────────────────
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.siteId, siteId)),
    columns: { id: true, mediaUrl: true, transcript: true, type: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.type !== "video" || !post.mediaUrl) {
    return NextResponse.json(
      { error: "Dubbing is only available for video posts with media" },
      { status: 400 },
    );
  }
  if (!post.transcript) {
    return NextResponse.json(
      { error: "Post has no transcript to translate" },
      { status: 400 },
    );
  }

  // ── Check cache (existing dubbed video) ───────────────────────────
  const existing = await db.query.dubbedVideos.findFirst({
    where: and(
      eq(dubbedVideos.postId, postId),
      eq(dubbedVideos.lang, targetLang),
    ),
  });

  if (existing?.status === "completed" && existing.videoUrl) {
    return NextResponse.json({ dubbedVideoUrl: existing.videoUrl, cached: true });
  }

  if (existing?.status === "processing") {
    return NextResponse.json(
      { error: "Dubbing is already in progress for this post and language" },
      { status: 409 },
    );
  }

  // ── Create or update the dubbed_videos row as "processing" ────────
  let dubbedVideoId: string;
  if (existing) {
    await db
      .update(dubbedVideos)
      .set({ status: "processing", videoUrl: null, audioUrl: null })
      .where(eq(dubbedVideos.id, existing.id));
    dubbedVideoId = existing.id;
  } else {
    const [row] = await db
      .insert(dubbedVideos)
      .values({
        postId,
        lang: targetLang,
        status: "processing",
      })
      .returning({ id: dubbedVideos.id });
    dubbedVideoId = row.id;
  }

  // ── Translate the transcript ──────────────────────────────────────
  let translatedText: string;
  try {
    translatedText = await translateText(post.transcript, targetLang);
  } catch (err) {
    console.error("[dubbing] Translation failed:", err);
    await db
      .update(dubbedVideos)
      .set({ status: "failed" })
      .where(eq(dubbedVideos.id, dubbedVideoId));
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }

  // ── Generate the dubbed video ─────────────────────────────────────
  // NOTE: In production this should be dispatched to a background job
  // (Inngest function) rather than blocking the HTTP request, since
  // GPU rental + processing takes 3-8 minutes. For now we run inline
  // so the wiring is visible.
  try {
    // TODO: Retrieve the creator's voice sample URL. For now, use a
    // placeholder — in production this would come from the first video
    // of the site or a dedicated voice-sample upload.
    const voiceSampleUrl = post.mediaUrl; // placeholder

    const result = await generateDubbedVideo({
      siteId,
      postId,
      videoUrl: post.mediaUrl,
      translatedText,
      targetLang,
      voiceSampleUrl,
    });

    // ── Persist the result ────────────────────────────────────────
    await db
      .update(dubbedVideos)
      .set({
        status: "completed",
        videoUrl: result.dubbedVideoUrl,
        audioUrl: result.dubbedAudioUrl,
      })
      .where(eq(dubbedVideos.id, dubbedVideoId));

    return NextResponse.json({
      dubbedVideoUrl: result.dubbedVideoUrl,
      cached: false,
    });
  } catch (err) {
    console.error("[dubbing] Generation failed:", err);
    await db
      .update(dubbedVideos)
      .set({ status: "failed" })
      .where(eq(dubbedVideos.id, dubbedVideoId));
    return NextResponse.json(
      { error: "Dubbing generation failed" },
      { status: 500 },
    );
  }
}
