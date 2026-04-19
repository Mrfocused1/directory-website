"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Pricing CTA button. Free plan goes straight to onboarding.
 * Paid plans redirect to Stripe Checkout first, then onboarding after payment.
 * Supports promo codes that bypass Stripe.
 */
export default function PricingButton({
  plan,
  cta,
  highlight,
  className,
}: {
  plan: string | null; // null = free
  cta: string;
  highlight: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");

  const defaultClass = `w-full h-11 rounded-full text-sm font-semibold flex items-center justify-center transition ${
    highlight
      ? "bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)] hover:opacity-90"
      : "bg-white/10 text-white border border-white/20 hover:bg-white/15"
  }`;
  const baseClass = className || defaultClass;

  // Free plan — go straight to onboarding
  if (!plan) {
    return (
      <Link href="/onboarding" className={baseClass}>
        {cta}
      </Link>
    );
  }

  // Paid plans — Stripe Checkout or promo code
  const handleCheckout = async (usePromo?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, string> = { plan };
      if (usePromo && promoCode.trim()) {
        payload.promoCode = promoCode.trim();
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      // If auth required with promo code, redirect to signup with promo preserved
      if (res.status === 401 && usePromo && promoCode.trim()) {
        window.location.href = `/login?next=${encodeURIComponent(`/onboarding?promo=${promoCode.trim()}`)}`;
        return;
      }
      setError(data.error || "Checkout unavailable. Please try again.");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => handleCheckout(false)}
        disabled={loading}
        className={`${baseClass} disabled:opacity-60`}
      >
        {loading ? "Redirecting..." : cta}
      </button>

      {/* Promo code toggle — "highlight" plans (Pro) have a lime
          background, everything else is dark, so white ink goes
          invisible on Pro unless we swap to dark. */}
      {!showPromo ? (
        <button
          type="button"
          onClick={() => setShowPromo(true)}
          className={`w-full mt-2 py-2 text-xs transition text-center ${
            highlight
              ? "text-[color:var(--bd-dark)]/60 hover:text-[color:var(--bd-dark)]"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Have a promo code?
        </button>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            className={`flex-1 h-9 rounded-full px-3 text-xs focus:outline-none focus:ring-1 ${
              highlight
                ? "bg-[color:var(--bd-dark)]/10 border border-[color:var(--bd-dark)]/20 text-[color:var(--bd-dark)] placeholder:text-[color:var(--bd-dark)]/40 focus:ring-[color:var(--bd-dark)]/40"
                : "bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-white/40"
            }`}
          />
          <button
            type="button"
            onClick={() => handleCheckout(true)}
            disabled={loading || !promoCode.trim()}
            className={`h-9 px-4 rounded-full text-xs font-semibold transition disabled:opacity-40 ${
              highlight
                ? "bg-[color:var(--bd-dark)]/10 border border-[color:var(--bd-dark)]/20 text-[color:var(--bd-dark)] hover:bg-[color:var(--bd-dark)]/20"
                : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
            }`}
          >
            Apply
          </button>
        </div>
      )}

      {error && (
        <p className={`text-xs text-center mt-2 ${highlight ? "text-red-700" : "text-red-400"}`}>{error}</p>
      )}
    </div>
  );
}
