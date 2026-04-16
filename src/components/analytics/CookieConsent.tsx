"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";

const CONSENT_KEY = "bmd_analytics_consent";

type ConsentState = "undecided" | "accepted" | "declined";

function getStoredConsent(): ConsentState {
  if (typeof window === "undefined") return "undecided";
  const value = localStorage.getItem(CONSENT_KEY);
  if (value === "accepted") return "accepted";
  if (value === "declined") return "declined";
  return "undecided";
}

export default function CookieConsent() {
  const [consent, setConsent] = useState<ConsentState>("undecided");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    setConsent(stored);
    setMounted(true);

    // If user previously accepted, opt back in on this page load
    if (stored === "accepted") {
      posthog.opt_in_capturing();
    }
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    posthog.opt_in_capturing();
    setConsent("accepted");
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setConsent("declined");
  }

  // Don't render during SSR or if user already decided
  if (!mounted || consent !== "undecided") return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 rounded-xl bg-[color:var(--fg)] text-[color:var(--bg)] px-5 py-4 shadow-lg text-sm"
    >
      <p className="mb-3 leading-relaxed">
        We use cookies for analytics to improve the experience.{" "}
        <a href="/privacy" className="underline">
          Privacy&nbsp;policy
        </a>
      </p>
      <div className="flex gap-2">
        <button
          onClick={accept}
          className="flex-1 rounded-lg bg-[color:var(--bg)] text-[color:var(--fg)] px-3 py-1.5 font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
        >
          Accept
        </button>
        <button
          onClick={decline}
          className="flex-1 rounded-lg border border-[color:var(--bg)]/30 px-3 py-1.5 font-semibold text-xs hover:opacity-80 transition-opacity cursor-pointer"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
