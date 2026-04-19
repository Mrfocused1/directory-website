"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type SessionData = {
  status: string;
  adId?: string;
  advertiserEmail?: string;
  startsAt?: string;
  endsAt?: string;
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AdvertiseSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  // Extract tenant from the URL path
  const pathParts = typeof window !== "undefined" ? window.location.pathname.split("/") : [];
  const tenant = pathParts[1] || "";

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError(true);
      setLoading(false);
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 8;
    const INTERVAL_MS = 2000;

    async function poll() {
      try {
        const res = await fetch(`/api/advertising/purchase/session?id=${encodeURIComponent(sessionId!)}`);
        const json = await res.json().catch(() => ({}));

        if (!res.ok || json.status === "not_found") {
          setError(true);
          setLoading(false);
          return;
        }

        if (json.status === "paid") {
          setData(json);
          setLoading(false);
          return;
        }

        // Payment not confirmed yet — retry
        attempts++;
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(poll, INTERVAL_MS);
        } else {
          // Give up waiting for webhook; show success anyway since Stripe already charged
          setData({ status: "paid" });
          setLoading(false);
        }
      } catch {
        setError(true);
        setLoading(false);
      }
    }

    poll();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f5f3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1a0a2e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#56505e]">Confirming your order...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f7f5f3] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#e5e1da] rounded-2xl p-8 text-center">
          <p className="text-xl font-bold mb-2">Session not found</p>
          <p className="text-sm text-[#56505e] mb-6">
            We couldn&apos;t verify your order. If you completed payment, your ad has been received.
            Please contact{" "}
            <a
              href="mailto:hello@buildmy.directory"
              className="text-[#1a0a2e] underline"
            >
              hello@buildmy.directory
            </a>{" "}
            and we&apos;ll sort it out.
          </p>
          {tenant && (
            <Link
              href={`/${tenant}/advertise`}
              className="inline-block text-sm font-semibold underline"
            >
              Back to ad slots
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f5f3] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Success card */}
        <div className="bg-white border border-[#e5e1da] rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-extrabold text-[#1a0a2e] mb-2">Your ad is live!</h1>
          <p className="text-[#56505e] leading-relaxed mb-6">
            Payment received. Your ad is now running on the directory.
            {data.advertiserEmail && (
              <>
                {" "}A receipt has been sent to{" "}
                <strong>{data.advertiserEmail}</strong>.
              </>
            )}
          </p>

          {data.startsAt && data.endsAt && (
            <div className="bg-[#f7f5f3] rounded-xl p-4 mb-6 text-sm">
              <p className="text-[#56505e] mb-1">Campaign window</p>
              <p className="font-semibold text-[#1a0a2e]">
                {formatDate(data.startsAt)} &rarr; {formatDate(data.endsAt)}
              </p>
            </div>
          )}

          {tenant && (
            <Link
              href={`/${tenant}`}
              className="inline-block text-sm font-semibold text-[#1a0a2e] underline"
            >
              Visit the directory
            </Link>
          )}
        </div>

        <p className="text-xs text-[#56505e] text-center mt-6">
          Questions? Email us at{" "}
          <a href="mailto:hello@buildmy.directory" className="underline">
            hello@buildmy.directory
          </a>
        </p>
      </div>
    </div>
  );
}
