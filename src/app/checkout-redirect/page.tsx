"use client";

import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Post-login landing page that immediately fires /api/checkout and
 * bounces the user to Stripe. Kept separate from the pricing page so
 * the redirect chain (pricing → login?next=... → this → Stripe) stays
 * linear and doesn't require the pricing button to remember any state.
 */
export default function CheckoutRedirectPage() {
  return (
    <Suspense fallback={<FullPageMessage title="Loading…" />}>
      <Redirector />
    </Suspense>
  );
}

function Redirector() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const promoCode = searchParams.get("promo");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan && !promoCode) {
      setError("No plan selected. Head back to pricing and pick one.");
      return;
    }

    const payload: Record<string, string> = {};
    if (plan) payload.plan = plan;
    if (promoCode) payload.promoCode = promoCode;

    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        if (res.status === 401) {
          // Shouldn't happen — they just logged in. But if the session
          // didn't stick, bounce back to login with the same destination.
          const next = `/checkout-redirect?plan=${encodeURIComponent(plan || "")}`;
          window.location.href = `/login?next=${encodeURIComponent(next)}`;
          return;
        }
        setError(data.error || "Checkout unavailable. Please try again in a minute.");
      })
      .catch(() => setError("Network error. Please try again."));
  }, [plan, promoCode]);

  if (error) {
    return (
      <FullPageMessage
        title="We couldn't start checkout"
        body={error}
        action={
          <Link
            href="/#pricing"
            className="inline-flex items-center h-11 px-5 rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] text-sm font-semibold hover:opacity-90 transition"
          >
            Back to pricing
          </Link>
        }
      />
    );
  }

  return <FullPageMessage title="Taking you to Stripe…" body="Hold on, you'll be redirected in a second." />;
}

function FullPageMessage({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-10 h-10 mx-auto mb-5 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin" />
        <h1 className="text-xl font-extrabold tracking-tight mb-2">{title}</h1>
        {body && <p className="text-sm text-[color:var(--fg-muted)] mb-5">{body}</p>}
        {action}
      </div>
    </div>
  );
}
