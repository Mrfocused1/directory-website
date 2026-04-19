import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { uploadBuffer } from "@/lib/pipeline/storage";
import { checkRateLimit, adUploadLimiter } from "@/lib/rate-limit-middleware";

/**
 * POST /api/advertising/upload
 *
 * Public (no auth) — unauthenticated advertisers upload their creative
 * before the Stripe checkout session is created.
 *
 * Accepts multipart/form-data with fields:
 *   file     — the creative asset
 *   siteId   — uuid of the directory
 *   slotType — one of the 11 known slot type IDs
 *
 * Returns: { url: string } — the R2/Blob public URL
 */

export const dynamic = "force-dynamic";

// Slot type → accepted MIME types + max bytes
const SLOT_RULES: Record<
  string,
  { mimeTypes: string[]; maxBytes: number; accept: string }
> = {
  pre_roll_video: {
    mimeTypes: ["video/mp4", "video/webm"],
    maxBytes: 50 * 1024 * 1024,
    accept: "mp4/webm video, max 50 MB",
  },
  mid_roll_video: {
    mimeTypes: ["video/mp4", "video/webm"],
    maxBytes: 50 * 1024 * 1024,
    accept: "mp4/webm video, max 50 MB",
  },
  pre_roll_audio: {
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a"],
    maxBytes: 20 * 1024 * 1024,
    accept: "mp3/wav/m4a audio, max 20 MB",
  },
  // Image-based slots
  pre_roll_image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    accept: "jpg/png/webp image, max 10 MB",
  },
  banner_top: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    accept: "jpg/png/webp image, max 10 MB",
  },
  post_view_overlay: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    accept: "jpg/png/webp image, max 10 MB",
  },
  sidebar_card: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    accept: "jpg/png/webp image, max 10 MB",
  },
  homepage_takeover: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    accept: "jpg/png/webp image, max 10 MB",
  },
  sponsored_reference: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    accept: "jpg/png/webp image, max 10 MB",
  },
  // Text-only slots — no asset upload needed
  sticky_ribbon: null as unknown as (typeof SLOT_RULES)[string],
  promoted_category: null as unknown as (typeof SLOT_RULES)[string],
};

const TEXT_ONLY_SLOTS = new Set(["sticky_ribbon", "promoted_category"]);

const KNOWN_SLOTS = new Set(Object.keys(SLOT_RULES));

export async function POST(request: NextRequest) {
  // Rate limit: 5 uploads per IP per hour
  const rateLimitResponse = await checkRateLimit(request, adUploadLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  const siteId = formData.get("siteId");
  const slotType = formData.get("slotType");

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  if (!slotType || typeof slotType !== "string" || !KNOWN_SLOTS.has(slotType)) {
    return NextResponse.json({ error: "Valid slotType required" }, { status: 400 });
  }

  if (TEXT_ONLY_SLOTS.has(slotType)) {
    return NextResponse.json(
      { error: `${slotType} is text-only — no asset upload needed` },
      { status: 400 },
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const rules = SLOT_RULES[slotType];

  // Validate MIME type
  if (!rules.mimeTypes.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Invalid file type "${file.type}" for slot "${slotType}". Expected: ${rules.accept}`,
      },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > rules.maxBytes) {
    const maxMB = (rules.maxBytes / 1024 / 1024).toFixed(0);
    const actualMB = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `File too large (${actualMB} MB). Max for ${slotType} is ${maxMB} MB.` },
      { status: 400 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  const key = `advertising/${siteId}/${slotType}/${randomUUID()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadBuffer(key, buffer, file.type);

  if (!url) {
    return NextResponse.json(
      { error: "Storage upload failed. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ url });
}
