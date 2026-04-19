"use client";

import { useEffect, useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";

type StripeStatus = {
  hasAccount: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingUrl?: string;
};

// 11 ad slot types — Phase 3 will add configuration UI for each
const SLOT_TYPES = [
  { key: "pre_roll_video",      label: "Pre-roll video",       description: "Play a 15-30s video before posts open" },
  { key: "pre_roll_image",      label: "Pre-roll image",       description: "Show a static ad before posts open" },
  { key: "pre_roll_audio",      label: "Pre-roll audio",       description: "Podcast-style audio before TTS playback" },
  { key: "mid_roll_video",      label: "Mid-roll video",       description: "Insert ad mid-way through long videos" },
  { key: "post_view_overlay",   label: "Post-view overlay",    description: "Sponsor moment when a viewer closes a post" },
  { key: "promoted_category",   label: "Promoted category",   description: "Sponsor an entire tab/category" },
  { key: "sponsored_reference", label: "Sponsored reference",  description: "Native-looking reference inside posts" },
  { key: "banner_top",          label: "Banner (top)",         description: "Standard banner at the top of your directory" },
  { key: "sticky_ribbon",       label: "Sticky ribbon",        description: "Persistent ribbon at the bottom of the viewport" },
  { key: "sidebar_card",        label: "Sidebar card",         description: "Card in the persistent sidebar" },
  { key: "homepage_takeover",   label: "Homepage takeover",    description: "Full-page skin plus welcome overlay" },
] as const;

export default function AdvertisingPage() {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch("/api/advertising/stripe/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        console.warn("[advertising] Failed to load Stripe status:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, []);

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/advertising/stripe/onboard", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start Stripe onboarding. Please try again.");
        setConnecting(false);
      }
    } catch {
      alert("Network error. Please try again.");
      setConnecting(false);
    }
  }

  const isFullyConnected = status?.hasAccount && status?.detailsSubmitted;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main id="main" className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-20">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold tracking-tight">Advertising</h1>
            <p className="text-sm text-[color:var(--fg-muted)] mt-1">
              Sell ad space on your directory and earn revenue
            </p>
          </div>

          {/* Explainer banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 mb-8">
            <p className="text-sm text-blue-900 leading-relaxed">
              <span className="font-semibold">Sell ad space on your directory.</span> Set your own prices.
              We take a 10% platform fee; you keep 90% — paid directly to your bank via Stripe.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-[color:var(--fg-muted)]">Loading advertising settings...</p>
            </div>
          ) : !isFullyConnected ? (
            // Stripe not connected state
            <div className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-16 h-16 bg-black/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2">Connect your bank account to start selling ads</h2>
              <p className="text-sm text-[color:var(--fg-muted)] mb-8 max-w-sm mx-auto">
                We use Stripe Connect to send your ad revenue directly to your bank account. Setup takes about 2 minutes.
              </p>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-full text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center gap-2"
              >
                {connecting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting to Stripe...
                  </>
                ) : (
                  "Connect bank account via Stripe"
                )}
              </button>
              {status?.hasAccount && !status?.detailsSubmitted && status?.onboardingUrl && (
                <p className="text-xs text-[color:var(--fg-muted)] mt-4">
                  Already started?{" "}
                  <a
                    href={status.onboardingUrl}
                    className="underline hover:text-[color:var(--fg)] transition"
                  >
                    Continue your Stripe setup
                  </a>
                </p>
              )}
            </div>
          ) : (
            // Stripe connected state — Phase 2 stub
            <div>
              <div className="flex items-center gap-2 mb-6">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="12" />
                  </svg>
                  Bank account connected
                </span>
                {status?.payoutsEnabled && (
                  <span className="text-xs font-semibold bg-green-50 text-green-600 px-2.5 py-1 rounded-full border border-green-200">
                    Payouts enabled
                  </span>
                )}
              </div>

              <div className="mb-4">
                <h2 className="text-lg font-bold">Ad slot types</h2>
                <p className="text-sm text-[color:var(--fg-muted)] mt-1">
                  Configure and price each slot type in Phase 2. All slots are disabled by default.
                </p>
              </div>

              {/* Phase 2 stub — greyed-out slot type cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SLOT_TYPES.map((slot) => (
                  <div
                    key={slot.key}
                    className="bg-white border border-[color:var(--border)] rounded-xl p-4 opacity-60 cursor-not-allowed select-none"
                    title="Configuration coming in Phase 2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{slot.label}</p>
                        <p className="text-xs text-[color:var(--fg-muted)] mt-0.5 line-clamp-2">{slot.description}</p>
                      </div>
                      <span className="shrink-0 text-xs font-medium bg-black/5 text-[color:var(--fg-subtle)] px-2 py-0.5 rounded-full">
                        Phase 2
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-[color:var(--fg-subtle)] mt-4 text-center">
                Slot configuration — set prices, enable/disable, and customise each slot type — arrives in Phase 2.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
