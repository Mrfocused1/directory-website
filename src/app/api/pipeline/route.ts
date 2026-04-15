import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sites, pipelineJobs, users } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { getApiUser } from "@/lib/supabase/api";
import { inngest } from "@/lib/inngest/client";
import { getPlan, type PlanId } from "@/lib/plans";

// Reserved slugs that conflict with app routes or are commonly squatted
// Slugs that conflict with app routes or are commonly squatted.
// Since tenant directories live at buildmy.directory/<slug>, any slug
// matching a top-level app route must be blocked.
const RESERVED_SLUGS = new Set([
  // App routes (must match explicit routes in src/app/)
  "api", "auth", "dashboard", "login", "signup", "onboarding",
  "forgot-password", "privacy", "terms", "embed",
  "robots.txt", "sitemap.xml", "opengraph-image",
  // Next.js internals
  "_next", "favicon", "favicon.ico", "static",
  // Common squatted / admin-looking terms
  "admin", "www", "mail", "email", "blog", "help", "support",
  "docs", "status", "billing", "settings", "account",
  "app", "cdn", "assets", "media",
  // Demo used by test agent — reserve so no user takes it
  "demo",
  // Legacy proxy paths still honored in links
  "d", "p",
]);

// POST /api/pipeline — Start a new pipeline for a site
export async function POST(request: NextRequest) {
  try {
    // Require authentication — pipeline triggers paid services (Apify, Deepgram, Claude)
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { platform, handle, slug, displayName } = body;

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

    // Validate platform is one of the supported values
    if (!["instagram", "tiktok", "youtube"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    // Validate handle format (alphanumeric, underscores, dots, dashes, optional @)
    if (!/^@?[a-zA-Z0-9_.-]+$/.test(handle)) {
      return NextResponse.json({ error: "Invalid handle format" }, { status: 400 });
    }

    // Validate slug format (lowercase alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: "Invalid slug format (lowercase letters, numbers, hyphens only)" }, { status: 400 });
    }

    // Reject reserved slugs
    if (RESERVED_SLUGS.has(slug.toLowerCase())) {
      return NextResponse.json({ error: "This slug is reserved. Please choose another." }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
    }

    // Enforce per-plan site limit
    const validPlans = ["free", "creator", "pro", "agency"];
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { plan: true },
    });
    const planId = (validPlans.includes(dbUser?.plan as string) ? dbUser!.plan : "free") as PlanId;
    const planConfig = getPlan(planId);

    const [countRow] = await db.select({ count: count() })
      .from(sites)
      .where(eq(sites.userId, user.id));

    if (countRow.count >= planConfig.siteLimit) {
      return NextResponse.json(
        { error: `Site limit reached (${planConfig.siteLimit} max on ${planConfig.name} plan). Upgrade for more.` },
        { status: 403 },
      );
    }

    // If the user already has a site with this slug, return it instead of failing on the unique constraint
    const existingByUserSlug = await db.query.sites.findFirst({
      where: and(eq(sites.userId, user.id), eq(sites.slug, slug)),
    });
    if (existingByUserSlug) {
      return NextResponse.json({
        siteId: existingByUserSlug.id,
        status: "existing",
        message: "You already have a directory with this slug.",
      });
    }

    // Make sure the slug isn't already taken by another user
    const slugTaken = await db.query.sites.findFirst({
      where: eq(sites.slug, slug),
      columns: { id: true },
    });
    if (slugTaken) {
      return NextResponse.json(
        { error: "This slug is already taken. Please choose another." },
        { status: 409 },
      );
    }

    // Create the site record in the database
    const [site] = await db.insert(sites).values({
      userId: user.id,
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

    // Make sure Inngest Cloud knows about our function definitions for
    // this deployment. Idempotent + memoized — only does real work on
    // the first POST after a fresh deploy.
    const { ensureInngestRegistered } = await import("@/lib/inngest/sync");
    await ensureInngestRegistered(request.nextUrl.origin);

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

  // Validate UUID format — invalid UUIDs would make Postgres throw
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    return NextResponse.json(
      { error: "Invalid siteId format" },
      { status: 400 },
    );
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  let jobs;
  try {
    jobs = await db.select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.siteId, siteId))
      .orderBy(desc(pipelineJobs.createdAt));
  } catch (error) {
    console.error("[pipeline] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline status" },
      { status: 500 },
    );
  }

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "No pipeline found for this site" },
      { status: 404 },
    );
  }

  const latestJob = jobs[0];
  const stepOrder = ["scrape", "transcribe", "categorize", "complete"];

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

  // Sanitize error messages — redact anything that looks like an API key or token.
  // We do NOT blanket-reject words like "token" or "auth" because they appear in
  // legitimate error messages (e.g. "authentication required").
  const sanitizeError = (err: string | null): string | null => {
    if (!err) return null;
    return err
      // Match known key prefixes followed by the rest of the token
      .replace(/\b(apify_api_|re_|sk-ant-|sk-|whsec_|signkey-|Bearer\s+)[A-Za-z0-9_\-]{8,}/gi, "[redacted]")
      // JWTs: eyJ...base64... (3 dot-separated base64 segments)
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
      // Generic env var names that might contain secrets
      .replace(/\b(API_KEY|API_TOKEN|SECRET_KEY|SIGNING_KEY)=[^\s]+/gi, "$1=[redacted]")
      .slice(0, 300);
  };

  // Prefer the dedicated `error` column, but fall back to the `message` of the
  // failed job — older rows (pre-error-column-write) store the reason there.
  const failedJob = anyFailed ? jobs.find((j) => j.status === "failed") : null;
  const failureReason = failedJob
    ? sanitizeError(failedJob.error) || sanitizeError(failedJob.message)
    : null;

  return NextResponse.json({
    siteId,
    status: allCompleted ? "completed" : anyFailed ? "failed" : "processing",
    currentStep: latestJob.step,
    progress: allCompleted ? 100 : overallProgress,
    message: allCompleted
      ? "Your directory is ready!"
      : anyFailed
        ? failureReason || "Something went wrong"
        : latestJob.message || "Processing...",
    error: anyFailed ? failureReason : null,
    steps: stepStatuses,
  });
}
