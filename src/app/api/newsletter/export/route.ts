import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ownedSiteId } from "@/db/utils";
import { getApiUser } from "@/lib/supabase/api";
import { hasFeature, type PlanId } from "@/lib/plans";

/**
 * GET /api/newsletter/export?siteId=xxx
 *
 * Exports the subscriber list for a site as CSV.
 * Requires authentication and the caller must own the site.
 */
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const resolvedSiteId = await ownedSiteId(siteId, user.id);
  if (!resolvedSiteId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Plan gate — export_subscribers feature required
  const VALID_PLANS = new Set(["free", "creator", "pro", "agency"]);
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { plan: true },
  });
  const planId: PlanId = (VALID_PLANS.has(userRow?.plan as string) ? userRow!.plan : "creator") as PlanId;
  if (!hasFeature(planId, "export_subscribers")) {
    return NextResponse.json(
      {
        error: "Subscriber export is not available on your plan.",
        reason: "plan_feature_missing",
        requiredPlan: "pro",
      },
      { status: 403 },
    );
  }

  const rows = await db.query.subscribers.findMany({
    where: eq(subscribers.siteId, resolvedSiteId),
    orderBy: [desc(subscribers.createdAt)],
    limit: 10000,
  });

  // Build CSV — escape any double quotes and wrap fields with quotes/commas/newlines
  const escape = (v: string | null): string => {
    if (v == null) return "";
    const needs = /[",\n]/.test(v);
    const safe = v.replace(/"/g, '""');
    return needs ? `"${safe}"` : safe;
  };

  const header = [
    "email",
    "name",
    "categories",
    "frequency",
    "is_active",
    "is_verified",
    "created_at",
    "last_digest_at",
  ].join(",");

  const lines = rows.map((s) => [
    escape(s.email),
    escape(s.name),
    escape(((s.categories as string[]) || []).join("; ")),
    escape(s.frequency),
    s.isActive ? "true" : "false",
    s.isVerified ? "true" : "false",
    escape(s.createdAt.toISOString()),
    escape(s.lastDigestAt?.toISOString() ?? null),
  ].join(","));

  const csv = [header, ...lines].join("\n");
  const filename = `subscribers-${resolvedSiteId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
