import { NextRequest, NextResponse } from "next/server";

// POST /api/pipeline — Start a new pipeline for a site
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, handle, slug, displayName } = body;

    if (!platform || !handle || !slug || !displayName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // In production: create the site in the DB and kick off background jobs
    // For now, return a mock response
    const siteId = crypto.randomUUID();

    // TODO: In production, this would:
    // 1. Create the site record in the database
    // 2. Enqueue a background job for the scraping pipeline
    // 3. The pipeline would run: scrape → transcribe → categorize → references → publish

    /*
    Pipeline steps (to be implemented with a job queue like BullMQ or Inngest):

    Step 1 - SCRAPE:
    - Use Instagram Graph API or TikTok API to fetch all posts
    - Download media (videos, images, thumbnails)
    - Store in S3/R2/Vercel Blob
    - Save post metadata to the posts table

    Step 2 - TRANSCRIBE:
    - For each video post, send to Deepgram/AssemblyAI/Whisper
    - Save transcript text and segments to the posts table

    Step 3 - CATEGORIZE:
    - Analyze captions and transcripts using LLM or keyword matching
    - Assign categories and update the posts table
    - Update the site's categories array

    Step 4 - REFERENCES:
    - For each post, search YouTube Data API for related content
    - Search news APIs for related articles
    - Save to the references table

    Step 5 - PUBLISH:
    - Set site.isPublished = true
    - Optionally trigger ISR revalidation
    */

    return NextResponse.json({
      siteId,
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

  // In production: query the pipeline_jobs table for the latest status
  // For now, return a mock "completed" after simulating progress

  return NextResponse.json({
    siteId,
    status: "completed",
    currentStep: "complete",
    progress: 100,
    message: "Your directory is ready!",
    steps: [
      { step: "scrape", status: "completed", progress: 100 },
      { step: "transcribe", status: "completed", progress: 100 },
      { step: "categorize", status: "completed", progress: 100 },
      { step: "references", status: "completed", progress: 100 },
      { step: "complete", status: "completed", progress: 100 },
    ],
  });
}
