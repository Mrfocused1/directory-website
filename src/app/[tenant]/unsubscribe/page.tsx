"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"confirm" | "done" | "error">("confirm");

  const handleUnsubscribe = async () => {
    try {
      const res = await fetch("/api/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: tenant, token }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <div className="max-w-md w-full text-center">
          {status === "confirm" && (
            <>
              <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2">Unsubscribe?</h1>
              <p className="text-sm text-[color:var(--fg-muted)] mb-8">
                You&apos;ll stop receiving digest emails from this directory. You can always resubscribe later.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={status !== "confirm"}
                  className="h-12 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "confirm" ? "Yes, unsubscribe me" : "Unsubscribing…"}
                </button>
                <Link
                  href={`/${tenant}`}
                  className="h-12 border border-[color:var(--border)] rounded-xl text-sm font-semibold flex items-center justify-center hover:bg-black/5 transition"
                >
                  Never mind, keep me subscribed
                </Link>
              </div>
            </>
          )}
          {status === "done" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2">Unsubscribed</h1>
              <p className="text-sm text-[color:var(--fg-muted)] mb-8">
                You won&apos;t receive any more emails. We&apos;re sorry to see you go!
              </p>
              <Link
                href={`/${tenant}`}
                className="inline-flex h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
              >
                Back to directory
              </Link>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M15 9l-6 6M9 9l6 6" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2">Something went wrong</h1>
              <p className="text-sm text-[color:var(--fg-muted)] mb-8">
                We couldn&apos;t process your request. Please try again.
              </p>
              <button
                type="button"
                onClick={() => setStatus("confirm")}
                className="inline-flex h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
