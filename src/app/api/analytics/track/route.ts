import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pageViews, postClicks, searchEvents, categoryClicks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveSiteId } from "@/db/utils";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit-middleware";

const MAX_PAYLOAD_SIZE = 10_000; // 10KB limit for analytics payloads

/**
 * POST /api/analytics/track
 *
 * Ingests analytics events from the client-side tracker.
 * Writes to the database tables for persistence.
 */
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, apiLimiter);
  if (limited) return limited;
  try {
    // Content-length guard against oversized payloads
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return new NextResponse(null, { status: 413 });
    }

    // Accept both JSON and sendBeacon (text) payloads
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      if (text.length > MAX_PAYLOAD_SIZE) {
        return new NextResponse(null, { status: 413 });
      }
      body = JSON.parse(text);
    }

    const { type, siteId, sessionId } = body;

    if (!type || !siteId) {
      return NextResponse.json({ error: "Missing type or siteId" }, { status: 400 });
    }

    // Extract geo from Vercel headers (free on Vercel)
    const country = request.headers.get("x-vercel-ip-country") || null;
    const city = request.headers.get("x-vercel-ip-city") || null;

    if (!db) {
      // No DB — silently accept (analytics should be fire-and-forget)
      return new NextResponse(null, { status: 204 });
    }

    const rawSid = typeof siteId === "string" ? siteId : String(siteId);
    const sid = await resolveSiteId(rawSid);
    if (!sid) {
      // Can't resolve site — silently drop (analytics is fire-and-forget)
      return new NextResponse(null, { status: 204 });
    }
    const sessId = typeof sessionId === "string" ? sessionId : null;

    switch (type) {
      case "page_view":
        await db.insert(pageViews).values({
          siteId: sid,
          postShortcode: (body.postShortcode as string) || null,
          path: (body.path as string) || "/",
          referrer: (body.referrer as string) || null,
          userAgent: (body.userAgent as string) || null,
          country,
          city,
          device: (body.device as string) || null,
          browser: (body.browser as string) || null,
          sessionId: sessId,
          duration: null,
          scrollDepth: null,
        });
        break;

      case "post_click":
        await db.insert(postClicks).values({
          siteId: sid,
          postShortcode: (body.postShortcode as string) || "",
          sessionId: sessId,
        });
        break;

      case "search":
        await db.insert(searchEvents).values({
          siteId: sid,
          query: (body.query as string) || "",
          resultsCount: typeof body.resultsCount === "number" ? body.resultsCount : 0,
          sessionId: sessId,
        });
        break;

      case "search_click":
        await db.insert(searchEvents).values({
          siteId: sid,
          query: (body.query as string) || "",
          resultsCount: 0,
          clickedShortcode: (body.clickedShortcode as string) || null,
          sessionId: sessId,
        });
        break;

      case "category_click":
        await db.insert(categoryClicks).values({
          siteId: sid,
          category: (body.category as string) || "",
          sessionId: sessId,
        });
        break;

      case "share":
        if (sessId && body.postShortcode) {
          await db.update(postClicks)
            .set({
              shared: true,
              sharePlatform: (body.platform as string) || null,
            })
            .where(
              and(
                eq(postClicks.siteId, sid),
                eq(postClicks.postShortcode, body.postShortcode as string),
                eq(postClicks.sessionId, sessId),
              ),
            );
        }
        break;

      case "video_watch":
        if (sessId && body.postShortcode) {
          await db.update(postClicks)
            .set({
              videoWatchTime: typeof body.watchTime === "number" ? Math.round(body.watchTime) : null,
              videoDuration: typeof body.totalDuration === "number" ? Math.round(body.totalDuration) : null,
            })
            .where(
              and(
                eq(postClicks.siteId, sid),
                eq(postClicks.postShortcode, body.postShortcode as string),
                eq(postClicks.sessionId, sessId),
              ),
            );
        }
        break;

      case "scroll_depth":
        if (sessId) {
          await db.update(pageViews)
            .set({ scrollDepth: typeof body.depth === "number" ? Math.round(body.depth) : null })
            .where(and(eq(pageViews.siteId, sid), eq(pageViews.sessionId, sessId)));
        }
        break;

      case "page_duration":
        if (sessId) {
          await db.update(pageViews)
            .set({ duration: typeof body.duration === "number" ? Math.round(body.duration) : null })
            .where(and(eq(pageViews.siteId, sid), eq(pageViews.sessionId, sessId)));
        }
        break;
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[analytics] Track error:", error);
    return new NextResponse(null, { status: 204 }); // Don't error — analytics should be fire-and-forget
  }
}
