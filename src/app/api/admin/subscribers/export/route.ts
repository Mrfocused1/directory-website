import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, sites, adminAuditLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { checkRateLimit, apiLimiter } from "@/lib/rate-limit-middleware";

/**
 * GET /api/admin/subscribers/export?siteId=xxx
 *
 * Admin-only CSV export of every subscriber for a site. Not gated by
 * the user's plan (the plan gate applies to creators exporting their
 * OWN list — this is the platform owner reviewing any site).
 *
 * Returns text/csv with a filename based on the site slug so browsers
 * save it as `<slug>-subscribers-YYYYMMDD.csv`.
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  const caller = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    return NextResponse.json({ error: "Invalid siteId format" }, { status: 400 });
  }

  const site = await db.query.sites.findFirst({
    where: eq(sites.id, siteId),
    columns: { slug: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const rows = await db
    .select({
      email: subscribers.email,
      name: subscribers.name,
      frequency: subscribers.frequency,
      isVerified: subscribers.isVerified,
      isActive: subscribers.isActive,
      categories: subscribers.categories,
      lastDigestAt: subscribers.lastDigestAt,
      createdAt: subscribers.createdAt,
    })
    .from(subscribers)
    .where(eq(subscribers.siteId, siteId))
    .orderBy(desc(subscribers.createdAt));

  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = [
    "email",
    "name",
    "frequency",
    "verified",
    "active",
    "categories",
    "last_digest_at",
    "created_at",
  ].join(",");
  const body = rows
    .map((r) =>
      [
        escape(r.email),
        escape(r.name),
        escape(r.frequency),
        escape(r.isVerified),
        escape(r.isActive),
        escape(Array.isArray(r.categories) ? r.categories.join("|") : ""),
        escape(r.lastDigestAt ? r.lastDigestAt.toISOString() : ""),
        escape(r.createdAt.toISOString()),
      ].join(","),
    )
    .join("\n");

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${site.slug}-subscribers-${date}.csv`;

  // Log the export action to the admin audit log
  try {
    await db.insert(adminAuditLog).values({
      adminEmail: caller.email,
      action: "export_subscribers",
      details: `site=${site.slug}, siteId=${siteId}, rows=${rows.length}`,
    });
  } catch (auditErr) {
    console.error("[admin/export] Failed to write audit log:", auditErr);
  }

  return new NextResponse(`${header}\n${body}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
