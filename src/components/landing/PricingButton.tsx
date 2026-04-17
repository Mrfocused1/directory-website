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

      {/* Promo code toggle */}
      {!showPromo ? (
        <button
          type="button"
          onClick={() => setShowPromo(true)}
          className="w-full mt-2 text-xs text-white/50 hover:text-white/80 transition text-center"
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
            className="flex-1 h-9 rounded-full bg-white/10 border border-white/20 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
          />
          <button
            type="button"
            onClick={() => handleCheckout(true)}
            disabled={loading || !promoCode.trim()}
            className="h-9 px-4 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-white hover:bg-white/20 transition disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 text-center mt-2">{error}</p>
      )}
    </div>
  );
}
