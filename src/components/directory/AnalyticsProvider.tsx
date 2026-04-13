"use client";

import { useEffect } from "react";
import {
  trackPageView,
  startAutoTracking,
} from "@/lib/analytics/tracker";

/**
 * Drop this into any tenant directory page to auto-track:
 * - Page views
 * - Scroll depth
 * - Session duration
 */
export default function AnalyticsProvider({
  siteId,
  postShortcode,
}: {
  siteId: string;
  postShortcode?: string;
}) {
  useEffect(() => {
    trackPageView(siteId, postShortcode);
    const cleanup = startAutoTracking(siteId);
    return cleanup;
  }, [siteId, postShortcode]);

  return null;
}
