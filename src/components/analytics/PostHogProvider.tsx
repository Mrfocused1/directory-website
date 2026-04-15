"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics/posthog";

/**
 * Boots PostHog exactly once on the client. Mounted from the root
 * layout; useEffect means SSR sees nothing from this component.
 */
export default function PostHogProvider() {
  useEffect(() => { initPostHog(); }, []);
  return null;
}
