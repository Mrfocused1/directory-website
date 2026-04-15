/**
 * PostHog wrapper.
 *
 * Env-gated: all functions are no-ops until NEXT_PUBLIC_POSTHOG_KEY
 * is set in Vercel. No account, no key, no data — everything silently
 * does nothing, so shipping this today has zero operational effect
 * until you're ready to turn it on.
 *
 * Client-side: feature flags + event capture via posthog-js.
 * Server-side: event capture via posthog-node (route handlers).
 */

"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// EU region by default (closer to our users). Override via env if
// you're in the US PostHog Cloud instance.
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (typeof window === "undefined" || !KEY || initialized) return;
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: "identified_only", // don't create profiles for anon traffic
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // only track events we explicitly send
    disable_session_recording: true, // save quota for flags + events
    loaded: () => {
      initialized = true;
    },
  });
}

/** One-shot identify for an authenticated user. Called after login. */
export function identify(userId: string, email?: string, plan?: string) {
  if (!KEY || typeof window === "undefined") return;
  posthog.identify(userId, { email, plan });
}

/** Feature-flag check. Falls back to `fallback` if PostHog is uninitialized. */
export function isFeatureEnabled(key: string, fallback = false): boolean {
  if (!KEY || typeof window === "undefined") return fallback;
  const v = posthog.isFeatureEnabled(key);
  return v === undefined ? fallback : v;
}

/** Payload-free event capture. Use for conversion markers. */
export function capture(event: string, properties?: Record<string, unknown>) {
  if (!KEY || typeof window === "undefined") return;
  posthog.capture(event, properties);
}

/** React hook to boot PostHog exactly once per page load. */
export function usePostHog() {
  useEffect(() => { initPostHog(); }, []);
}
