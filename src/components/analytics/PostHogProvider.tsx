"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics/posthog";
import CookieConsent from "./CookieConsent";

/**
 * Boots PostHog exactly once on the client. Mounted from the root
 * layout; useEffect means SSR sees nothing from this component.
 *
 * PostHog starts opted-out; CookieConsent handles the opt-in flow.
 */
export default function PostHogProvider() {
  useEffect(() => { initPostHog(); }, []);
  return <CookieConsent />;
}
