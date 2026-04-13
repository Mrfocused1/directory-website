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

  // Paid plans — Stripe Checkout first, then onboarding
  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      // Fallback if checkout fails
      window.location.href = `/onboarding?plan=${plan}`;
    } catch {
      window.location.href = `/onboarding?plan=${plan}`;
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`${baseClass} disabled:opacity-60`}
    >
      {loading ? "Redirecting..." : cta}
    </button>
  );
}
