"use client";

/**
 * Client-side analytics tracker.
 * Lightweight — no external dependencies. Records events to our own API.
 *
 * Tracks:
 * - Page views (with duration and scroll depth)
 * - Post clicks (opening a post modal)
 * - Video watch time
 * - Search queries and result clicks
 * - Category filter changes
 * - Share actions
 * - Reference clicks
 */

const TRACK_ENDPOINT = "/api/analytics/track";

let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;

  // Check sessionStorage first
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("bmd_session");
    if (stored) {
      sessionId = stored;
      return stored;
    }
    // Generate new session ID
    sessionId = crypto.randomUUID();
    sessionStorage.setItem("bmd_session", sessionId);
  }
  return sessionId || "unknown";
}

function getDevice(): "desktop" | "mobile" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return "mobile";
  return "desktop";
}

function getBrowser(): string {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "Other";
}

async function sendEvent(type: string, data: Record<string, unknown>) {
  try {
    const payload = {
      type,
      sessionId: getSessionId(),
      device: getDevice(),
      browser: getBrowser(),
      referrer: document.referrer || null,
      path: window.location.pathname,
      timestamp: Date.now(),
      ...data,
    };

    // Use sendBeacon for reliability (fires even on page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(TRACK_ENDPOINT, JSON.stringify(payload));
    } else {
      fetch(TRACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    }
  } catch {
    // Silently fail — analytics should never break the UX
  }
}

// ─── Public API ──────────────────────────────────────────────────────

export function trackPageView(siteId: string, postShortcode?: string) {
  sendEvent("page_view", { siteId, postShortcode: postShortcode || null });
}

export function trackPostClick(siteId: string, postShortcode: string) {
  sendEvent("post_click", { siteId, postShortcode });
}

export function trackSearch(siteId: string, query: string, resultsCount: number) {
  sendEvent("search", { siteId, query, resultsCount });
}

export function trackSearchClick(siteId: string, query: string, clickedShortcode: string) {
  sendEvent("search_click", { siteId, query, clickedShortcode });
}

export function trackCategoryClick(siteId: string, category: string) {
  sendEvent("category_click", { siteId, category });
}

export function trackShare(siteId: string, postShortcode: string, platform: string) {
  sendEvent("share", { siteId, postShortcode, platform });
}

export function trackReferenceClick(siteId: string, postShortcode: string, referenceUrl: string) {
  sendEvent("reference_click", { siteId, postShortcode, referenceUrl });
}

export function trackVideoWatch(siteId: string, postShortcode: string, watchTime: number, totalDuration: number) {
  sendEvent("video_watch", { siteId, postShortcode, watchTime, totalDuration });
}

export function trackScrollDepth(siteId: string, depth: number) {
  sendEvent("scroll_depth", { siteId, depth: Math.round(depth) });
}

export function trackPageDuration(siteId: string, duration: number) {
  sendEvent("page_duration", { siteId, duration: Math.round(duration / 1000) });
}

// ─── Auto-tracking hooks ─────────────────────────────────────────────

/**
 * Call once on directory mount to auto-track scroll depth and page duration.
 * Returns a cleanup function.
 */
export function startAutoTracking(siteId: string): () => void {
  const startTime = Date.now();
  let maxScrollDepth = 0;
  let scrollTrackTimeout: ReturnType<typeof setTimeout>;

  const onScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const depth = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    maxScrollDepth = Math.max(maxScrollDepth, depth);

    clearTimeout(scrollTrackTimeout);
    scrollTrackTimeout = setTimeout(() => {
      trackScrollDepth(siteId, maxScrollDepth);
    }, 2000);
  };

  window.addEventListener("scroll", onScroll, { passive: true });

  // Track duration on page unload
  const onUnload = () => {
    const duration = Date.now() - startTime;
    trackPageDuration(siteId, duration);
    trackScrollDepth(siteId, maxScrollDepth);
  };

  window.addEventListener("beforeunload", onUnload);

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("beforeunload", onUnload);
    clearTimeout(scrollTrackTimeout);
    // Track final duration on cleanup
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      trackPageDuration(siteId, duration);
    }
  };
}
