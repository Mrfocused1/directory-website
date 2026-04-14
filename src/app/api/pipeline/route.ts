import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, pipelineJobs } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { inngest } from "@/lib/inngest/client";

// POST /api/pipeline — Start a new pipeline for a site
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, handle, slug, displayName } = body;
    const user = await getApiUser();

    if (!platform || !handle || !slug || !displayName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (displayName.length > 256) {
      return NextResponse.json({ error: "Display name too long (max 256 characters)" }, { status: 400 });
    }
    if (slug.length > 63) {
      return NextResponse.json({ error: "Slug too long (max 63 characters)" }, { status: 400 });
    }
    if (handle.length > 128) {
      return NextResponse.json({ error: "Handle too long (max 128 characters)" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
    }

    // Create the site record in the database
    const [site] = await db.insert(sites).values({
      userId: user?.id || "00000000-0000-0000-0000-000000000000",
      slug,
      platform,
      handle,
      displayName,
      isPublished: false,
    }).returning();

    // Create initial pipeline job record
    await db.insert(pipelineJobs).values({
      siteId: site.id,
      step: "scrape",
      status: "pending",
      progress: 0,
      message: "Queued for processing",
    });

    // Trigger the background pipeline via Inngest
    await inngest.send({
      name: "pipeline/run",
      data: { siteId: site.id },
    });

    return NextResponse.json({
      siteId: site.id,
      status: "started",
      message: "Pipeline started. Your directory will be ready in a few minutes.",
    });
  } catch (error) {
    console.error("Pipeline error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// GET /api/pipeline?siteId=xxx — Check pipeline status
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json(
      { error: "Missing siteId parameter" },
      { status: 400 },
    );
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  // Get all pipeline jobs for this site, ordered by creation
  const jobs = await db.select()
    .from(pipelineJobs)
    .where(eq(pipelineJobs.siteId, siteId))
    .orderBy(desc(pipelineJobs.createdAt));

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "No pipeline found for this site" },
      { status: 404 },
    );
  }

  const latestJob = jobs[0];
  const stepOrder = ["scrape", "transcribe", "categorize", "references", "complete"];

  // Build step statuses from all jobs
  const stepStatuses = stepOrder.map((step) => {
    const job = jobs.find((j) => j.step === step);
    return {
      step,
      status: job?.status || "pending",
      progress: job?.progress || 0,
    };
  });

  // Determine overall status
  const allCompleted = stepStatuses.every((s) => s.status === "completed");
  const anyFailed = stepStatuses.some((s) => s.status === "failed");
  const overallProgress = Math.round(
    stepStatuses.reduce((sum, s) => sum + s.progress, 0) / stepStatuses.length,
  );

  return NextResponse.json({
    siteId,
    status: allCompleted ? "completed" : anyFailed ? "failed" : "processing",
    currentStep: latestJob.step,
    progress: allCompleted ? 100 : overallProgress,
    message: allCompleted
      ? "Your directory is ready!"
      : anyFailed
        ? latestJob.error || "Something went wrong"
        : latestJob.message || "Processing...",
    error: anyFailed ? latestJob.error : null,
    steps: stepStatuses,
  });
}
