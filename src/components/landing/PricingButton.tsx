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
  className,
}: {
  plan: string | null; // null = free
  cta: string;
  highlight: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Marketing-theme styling to match the nory-inspired landing page.
  // Caller can override with `className` if embedded elsewhere.
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
