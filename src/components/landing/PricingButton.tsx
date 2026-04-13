"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Pricing CTA button. Free plan goes straight to onboarding.
 * Paid plans redirect to Stripe Checkout first, then onboarding after payment.
 */
export default function PricingButton({
  plan,
  cta,
  highlight,
}: {
  plan: string | null; // null = free
  cta: string;
  highlight: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const baseClass = `w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center transition ${
    highlight
      ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:opacity-90 shadow-md shadow-purple-200"
      : "bg-black/5 text-[color:var(--fg)] hover:bg-black/10"
  }`;

  // Free plan — go straight to onboarding
  if (!plan) {
    return (
      <Link href="/onboarding" className={baseClass}>
        {cta}
      </Link>
    );
  }

  const [error, setError] = useState<string | null>(null);

  // Paid plans — Stripe Checkout first, then onboarding
  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
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
        onClick={handleClick}
        disabled={loading}
        className={`${baseClass} disabled:opacity-60`}
      >
        {loading ? "Redirecting..." : cta}
      </button>
      {error && (
        <p className="text-xs text-red-600 text-center mt-2">{error}</p>
      )}
    </div>
  );
}
