"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * /dashboard/advertising/setup
 *
 * Stripe Connect redirect target. Stripe sends the creator back here after
 * the onboarding flow with one of two query params:
 *   ?complete=1  — they finished the form; poll status then redirect onward
 *   ?refresh=1   — the link expired; offer a button to restart
 */
export default function AdvertisingSetupPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const isComplete = searchParams.get("complete") === "1";
  const isRefresh = searchParams.get("refresh") === "1";

  const [reconnecting, setReconnecting] = useState(false);

  // On complete=1: poll status until detailsSubmitted=true then redirect
  useEffect(() => {
    if (!isComplete) return;

    let attempts = 0;
    const maxAttempts = 20; // 20 * 2s = 40s max wait

    async function poll() {
      try {
        const res = await fetch("/api/advertising/stripe/status");
        if (res.ok) {
          const data = await res.json();
          if (data.detailsSubmitted) {
            router.replace("/dashboard/advertising");
            return;
          }
        }
      } catch {
        // Non-fatal — just keep polling
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        // Gave up waiting — redirect anyway, UI will show partially-connected state
        router.replace("/dashboard/advertising");
      }
    }

    poll();
  }, [isComplete, router]);

  async function handleRestart() {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      const res = await fetch("/api/advertising/stripe/onboard", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to generate a new link. Please try again.");
        setReconnecting(false);
      }
    } catch {
      alert("Network error. Please try again.");
      setReconnecting(false);
    }
  }

  if (isRefresh) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-yellow-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-700">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="text-lg font-bold mb-2">Link expired</h1>
          <p className="text-sm text-[color:var(--fg-muted)] mb-6">
            Your Stripe onboarding link has expired. Click below to get a fresh one and continue where you left off.
          </p>
          <button
            type="button"
            onClick={handleRestart}
            disabled={reconnecting}
            className="h-11 px-7 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-full text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {reconnecting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Redirecting...
              </>
            ) : (
              "Continue Stripe setup"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Default: complete=1 (or neither param — treat as complete)
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 bg-black/5 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <div className="w-7 h-7 border-2 border-black/20 border-t-black rounded-full animate-spin" />
        </div>
        <h1 className="text-lg font-bold mb-2">Connecting your account...</h1>
        <p className="text-sm text-[color:var(--fg-muted)]">
          Verifying your Stripe setup. This should only take a moment.
        </p>
      </div>
    </div>
  );
}
