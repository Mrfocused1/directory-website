import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscribers, sites } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";
import { resend } from "@/lib/email/resend";
import { verificationEmail } from "@/lib/email/templates";
import crypto from "crypto";

// POST /api/subscribe — Subscribe to a directory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, name, categories, frequency } = body;

    if (!siteId || !email?.trim()) {
      return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
    }

    // Stricter email validation — require at least 2 chars in TLD
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (email.length > 320) {
      return NextResponse.json({ error: "Email too long" }, { status: 400 });
    }
    if (name && name.length > 128) {
      return NextResponse.json({ error: "Name too long (max 128 characters)" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolvedSiteId = await resolveSiteId(siteId);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Check if already subscribed
    const existing = await db.query.subscribers.findFirst({
      where: and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.email, normalizedEmail)),
    });

    if (existing) {
      // Update preferences
      await db.update(subscribers)
        .set({
          categories: categories || existing.categories,
          frequency: frequency || existing.frequency,
          isActive: true,
        })
        .where(eq(subscribers.id, existing.id));
      return NextResponse.json({ message: "Preferences updated" });
    }

    const unsubscribeToken = crypto.randomBytes(32).toString("hex");

    await db.insert(subscribers).values({
      siteId: resolvedSiteId,
      email: normalizedEmail,
      name: name?.trim() || null,
      categories: categories || [],
      frequency: frequency || "weekly",
      unsubscribeToken,
      isVerified: false,
      isActive: true,
    });

    // Send verification email
    if (resend) {
      // Look up site display name
      const site = await db.query.sites.findFirst({
        where: eq(sites.id, resolvedSiteId),
        columns: { displayName: true, slug: true },
      });
      const siteName = site?.displayName || site?.slug || siteId;

      const origin = request.nextUrl.origin;
      const verifyUrl = `${origin}/api/subscribe/verify?token=${unsubscribeToken}&siteId=${resolvedSiteId}`;
      const template = verificationEmail({
        siteName,
        verifyUrl,
      });
      try {
        const { error: sendError } = await resend.emails.send({
          from: "BuildMy.Directory <hello@buildmy.directory>",
          to: normalizedEmail,
          subject: template.subject,
          html: template.html,
        });
        if (sendError) console.error("[subscribe] Resend rejected verification:", sendError);
      } catch (emailErr) {
        console.error("[subscribe] Failed to send verification email:", emailErr);
        // Don't fail the subscription — email will be unverified until manually verified
      }
    }

    return NextResponse.json({ message: "Subscribed successfully" }, { status: 201 });
  } catch (err) {
    console.error("[subscribe] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE /api/subscribe — Unsubscribe
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, token } = body;

    if (!siteId || (!email && !token)) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const resolvedSiteId = await resolveSiteId(siteId);
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    if (token) {
      // Unsubscribe via secure token (from email link)
      await db.update(subscribers)
        .set({ isActive: false })
        .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.unsubscribeToken, token)));
    } else if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      await db.update(subscribers)
        .set({ isActive: false })
        .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.email, normalizedEmail)));
    }

    return NextResponse.json({ message: "Unsubscribed" });
  } catch (err) {
    console.error("[subscribe] Unsubscribe error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET /api/subscribe?siteId=xxx — Get subscriber stats (for dashboard)
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ total: 0, active: 0, verified: 0, thisWeek: 0 });
  }

  const resolvedSiteId = await resolveSiteId(siteId);
  if (!resolvedSiteId) {
    return NextResponse.json({ total: 0, active: 0, verified: 0, thisWeek: 0 });
  }

  try {
    const [totalResult] = await db.select({ count: count() })
      .from(subscribers)
      .where(eq(subscribers.siteId, resolvedSiteId));

    const [activeResult] = await db.select({ count: count() })
      .from(subscribers)
      .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.isActive, true)));

    const [verifiedResult] = await db.select({ count: count() })
      .from(subscribers)
      .where(and(eq(subscribers.siteId, resolvedSiteId), eq(subscribers.isVerified, true)));

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const allSubs = await db.query.subscribers.findMany({
      where: eq(subscribers.siteId, resolvedSiteId),
    });
    const thisWeek = allSubs.filter((s) => new Date(s.createdAt) >= oneWeekAgo).length;

    return NextResponse.json({
      total: totalResult.count,
      active: activeResult.count,
      verified: verifiedResult.count,
      thisWeek,
    });
  } catch (error) {
    console.error("[subscribe] GET error:", error);
    return NextResponse.json({ total: 0, active: 0, verified: 0, thisWeek: 0 });
  }
}
