import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analytics/track
 *
 * Ingests analytics events from the client-side tracker.
 * In production, this writes to the database tables.
 * For high-volume sites, you'd batch writes or use a queue.
 */
export async function POST(request: NextRequest) {
  try {
    // Accept both JSON and sendBeacon (text) payloads
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = JSON.parse(text);
    }

    const { type, siteId, sessionId } = body;

    if (!type || !siteId) {
      return NextResponse.json({ error: "Missing type or siteId" }, { status: 400 });
    }

    // Extract geo from Vercel headers (free on Vercel)
    const country = request.headers.get("x-vercel-ip-country") || null;
    const city = request.headers.get("x-vercel-ip-city") || null;

    // TODO: In production, write to the appropriate table based on event type:
    //
    // switch (type) {
    //   case "page_view":
    //     await db.insert(pageViews).values({
    //       siteId, postShortcode: body.postShortcode, path: body.path,
    //       referrer: body.referrer, userAgent: body.userAgent,
    //       country, city, device: body.device, browser: body.browser,
    //       sessionId, duration: null, scrollDepth: null,
    //     });
    //     break;
    //
    //   case "post_click":
    //     await db.insert(postClicks).values({
    //       siteId, postShortcode: body.postShortcode, sessionId,
    //     });
    //     break;
    //
    //   case "search":
    //     await db.insert(searchEvents).values({
    //       siteId, query: body.query, resultsCount: body.resultsCount, sessionId,
    //     });
    //     break;
    //
    //   case "search_click":
    //     await db.insert(searchEvents).values({
    //       siteId, query: body.query, clickedShortcode: body.clickedShortcode, sessionId,
    //     });
    //     break;
    //
    //   case "category_click":
    //     await db.insert(categoryClicks).values({
    //       siteId, category: body.category, sessionId,
    //     });
    //     break;
    //
    //   case "share":
    //     await db.update(postClicks)
    //       .set({ shared: true, sharePlatform: body.platform })
    //       .where(and(eq(postClicks.siteId, siteId), eq(postClicks.postShortcode, body.postShortcode), eq(postClicks.sessionId, sessionId)));
    //     break;
    //
    //   case "video_watch":
    //     await db.update(postClicks)
    //       .set({ videoWatchTime: body.watchTime, videoDuration: body.totalDuration })
    //       .where(and(eq(postClicks.siteId, siteId), eq(postClicks.postShortcode, body.postShortcode), eq(postClicks.sessionId, sessionId)));
    //     break;
    //
    //   case "scroll_depth":
    //   case "page_duration":
    //     await db.update(pageViews)
    //       .set(type === "scroll_depth" ? { scrollDepth: body.depth } : { duration: body.duration })
    //       .where(and(eq(pageViews.siteId, siteId), eq(pageViews.sessionId, sessionId)));
    //     break;
    // }

    // For now, just log and acknowledge
    console.log(`[analytics] ${type}`, { siteId, sessionId: sessionId?.toString().slice(0, 8), ...body });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[analytics] Track error:", error);
    return new NextResponse(null, { status: 204 }); // Don't error — analytics should be fire-and-forget
  }
}
