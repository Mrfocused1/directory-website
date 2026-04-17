"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LearnWhileBuilding from "@/components/dashboard/LearnWhileBuilding";

type Props = {
  siteId: string;
  slug: string;
  handle: string;
  platform: "instagram" | "tiktok";
  displayName: string;
  alreadyPublished: boolean;
};

type PipelineStatus = {
  step: string;
  progress: number;
  message: string;
  failed: boolean;
};

const STEPS = [
  { key: "scrape", label: "Scraping your content" },
  { key: "transcribe", label: "Transcribing videos" },
  { key: "categorize", label: "Categorizing posts" },
  { key: "complete", label: "Publishing directory" },
];

export default function BuildProgressClient({
  siteId,
  slug,
  handle,
  platform,
  displayName,
  alreadyPublished,
}: Props) {
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<PipelineStatus>({
    step: "scrape",
    progress: 0,
    message: "Loading status…",
    failed: false,
  });
  const [done, setDone] = useState(alreadyPublished);
  const [retrying, setRetrying] = useState(false);

  // Fetch pipeline status + schedule the next poll
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline?siteId=${siteId}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();

      setStatus({
        step: data.currentStep || "scrape",
        progress: Number(data.progress) || 0,
        message: data.message || "Processing…",
        failed: data.status === "failed",
      });

      if (data.status === "completed") {
        setDone(true);
        return; // stop polling
      }
      if (data.status === "failed") {
        return; // stop polling; user can retry manually
      }
    } catch {
      // Transient error — keep polling
    }
    pollRef.current = setTimeout(poll, 2500);
  }, [siteId]);

  useEffect(() => {
    if (alreadyPublished) return;
    // Kick off polling immediately
    void poll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [alreadyPublished, poll]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/pipeline/retry?siteId=${siteId}`, { method: "POST" });
      if (res.ok) {
        if (pollRef.current) clearTimeout(pollRef.current);
        setStatus({
          step: "scrape",
          progress: 0,
          message: "Retrying…",
          failed: false,
        });
        void poll();
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus((s) => ({ ...s, failed: true, message: data?.error || "Retry failed." }));
      }
    } catch {
      setStatus((s) => ({ ...s, failed: true, message: "Network error." }));
    } finally {
      setRetrying(false);
    }
  };

  const currentIdx = STEPS.findIndex((s) => s.key === status.step);

  // Redirect to dashboard when build completes
  useEffect(() => {
    if (done) {
      router.push("/dashboard?new_directory=" + encodeURIComponent(slug));
    }
  }, [done, router, slug]);

  if (done) {
    return (
      <div className="min-h-screen relative">
        <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
        <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />
        <main id="main" className="relative z-10 max-w-lg mx-auto px-6 pt-20 pb-20 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center mx-auto mb-6">
            <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Taking you to your dashboard...
          </h1>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />
      <main id="main" className="relative z-10 max-w-lg mx-auto px-6 pt-16 pb-20 text-center animate-fade-in">
        {status.failed ? (
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4M12 16h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] flex items-center justify-center mx-auto mb-6">
            <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        )}

        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          {status.failed ? "Build failed" : "Building your directory"}
        </h1>
        <p className="text-[color:var(--fg-muted)] mb-2">
          @{handle} on {platform}
        </p>
        {!status.failed && (
          <p className="text-[color:var(--fg-muted)] mb-10">
            This usually takes 2–5 minutes depending on how much content you have.
          </p>
        )}

        {/* Steps */}
        <div className="max-w-sm mx-auto space-y-4 text-left">
          {STEPS.map((s, i) => {
            const isDone = !status.failed && i < currentIdx;
            const isCurrent = !status.failed && i === currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    isDone
                      ? "bg-green-500 text-white"
                      : isCurrent
                        ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
                        : "bg-black/10"
                  }`}
                >
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : isCurrent ? (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : null}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isDone
                      ? "text-green-600"
                      : isCurrent
                        ? "text-[color:var(--fg)]"
                        : "text-[color:var(--fg-subtle)]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        {!status.failed && (
          <div className="max-w-sm mx-auto mt-8">
            <div className="h-2 bg-black/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[color:var(--fg)] rounded-full transition-all duration-500"
                style={{ width: `${status.progress}%` }}
              />
            </div>
            <p className="text-xs text-[color:var(--fg-subtle)] mt-2">{status.message}</p>
          </div>
        )}

        {/* Learn while building */}
        {!status.failed && <LearnWhileBuilding />}

        {status.failed && (
          <>
            <div className="max-w-sm mx-auto mt-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 text-left">
              {status.message}
            </div>
            <div className="max-w-sm mx-auto mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => router.push(`/onboarding?existing=${siteId}`)}
                className="flex-1 h-12 border-2 border-[color:var(--border)] rounded-xl text-sm font-semibold hover:bg-black/5 transition"
              >
                Change handle
              </button>
              <button
                type="button"
                onClick={retry}
                disabled={retrying}
                className="flex-1 h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry with same handle"}
              </button>
            </div>
            <Link
              href="/dashboard"
              className="block mt-4 text-xs text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            >
              ← Back to dashboard
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
