import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { visitorProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";

/**
 * DELETE /api/bookmarks/profile
 * Body: { siteId, email }
 *
 * GDPR-style visitor profile deletion. Removes the visitor record for
 * the given site+email; the database cascade then removes all of their
 * collections and bookmarks.
 *
 * Authorization: possession of the email is sufficient here because
 * bookmark sessions are email-based (no password). The caller is
 * deleting their own data from localStorage-driven auth — there is
 * no escalation because this endpoint only ever removes data.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email } = body;
    if (!siteId || !email) {
      return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
    }
    if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const resolvedSiteId = await resolveSiteId(siteId);
    if (!resolvedSiteId) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    const normalizedEmail = String(email).toLowerCase().trim();
    const result = await db.delete(visitorProfiles)
      .where(and(
        eq(visitorProfiles.siteId, resolvedSiteId),
        eq(visitorProfiles.email, normalizedEmail),
      ))
      .returning({ id: visitorProfiles.id });

    return NextResponse.json({ deleted: result.length > 0 });
  } catch (err) {
    console.error("[bookmarks/profile] DELETE error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
