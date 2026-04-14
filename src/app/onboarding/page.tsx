"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

type Step = "handle" | "customize" | "processing" | "done";

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("handle");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
  const [handle, setHandle] = useState(() => {
    return searchParams.get("handle")?.replace(/^@/, "") || "";
  });
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<{
    step: string;
    progress: number;
    message: string;
  }>({ step: "scrape", progress: 0, message: "Starting..." });

  const handleSubmitHandle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    const cleanHandle = handle.replace(/^@/, "").trim();
    if (!slug) setSlug(cleanHandle.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    if (!displayName) setDisplayName(cleanHandle);
    setStep("customize");
  };

  const [isBuilding, setIsBuilding] = useState(false);

  const handleStartBuild = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double-clicks while building
    if (isBuilding) return;
    setIsBuilding(true);

    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setStep("processing");

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          handle: handle.replace(/^@/, "").trim(),
          slug,
          displayName,
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to start pipeline";
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {
          // Response wasn't JSON — use generic message
        }
        throw new Error(errMsg);
      }

      const data = await res.json();

      // Poll with exponential backoff: 2s → 4s → 8s → 10s (capped)
      let pollDelay = 2000;
      const MAX_DELAY = 10000;
      let consecutiveErrors = 0;
      const MAX_ERRORS = 5;

      const poll = async () => {
        try {
          const statusRes = await fetch(`/api/pipeline?siteId=${data.siteId}`);
          const status = await statusRes.json();
          consecutiveErrors = 0; // Reset on success

          setPipelineStatus({
            step: status.currentStep || "scrape",
            progress: status.progress || 0,
            message: status.message || "Processing...",
          });

          if (status.status === "completed") {
            setStep("done");
            setIsBuilding(false);
            return; // Stop polling
          } else if (status.status === "failed") {
            setPipelineStatus({
              step: "error",
              progress: 0,
              message: status.error || "Something went wrong",
            });
            setIsBuilding(false);
            return; // Stop polling
          }
        } catch {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_ERRORS) {
            setPipelineStatus({
              step: "error",
              progress: 0,
              message: "Lost connection. Please try again.",
            });
            setIsBuilding(false);
            return; // Stop polling after too many failures
          }
        }

        // Schedule next poll with backoff
        pollDelay = Math.min(pollDelay * 1.5, MAX_DELAY);
        pollRef.current = setTimeout(poll, pollDelay);
      };

      // Start first poll
      pollRef.current = setTimeout(poll, pollDelay);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start. Please try again.";
      setPipelineStatus({
        step: "error",
        progress: 0,
        message,
      });
      setIsBuilding(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 sm:px-10 h-16 max-w-4xl mx-auto">
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            BuildMy<span className="text-black/40">.</span>Directory
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to home
          </Link>
        </nav>

        <main className="max-w-xl mx-auto px-6 pt-10 pb-20">
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mb-10">
            {(["handle", "customize", "processing"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                    step === s || (step === "done" && s === "processing")
                      ? "bg-[color:var(--fg)] text-[color:var(--bg)]"
                      : i < ["handle", "customize", "processing"].indexOf(step)
                        ? "bg-green-500 text-white"
                        : "bg-black/10 text-[color:var(--fg-muted)]"
                  }`}
                >
                  {i < ["handle", "customize", "processing", "done"].indexOf(step) ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < 2 && <div className="w-12 h-0.5 bg-black/10 rounded-full" />}
              </div>
            ))}
          </div>

          {/* Step: Enter handle */}
          {step === "handle" && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                Let&apos;s build your directory
              </h1>
              <p className="text-[color:var(--fg-muted)] mb-8">
                Enter your social media handle and we&apos;ll do the rest.
              </p>

              <form onSubmit={handleSubmitHandle} className="space-y-6">
                {/* Platform selector */}
                <div>
                  <label className="text-sm font-semibold mb-2 block">Platform</label>
                  <div className="flex gap-2">
                    {(["instagram", "tiktok"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlatform(p)}
                        className={`flex-1 h-12 rounded-xl text-sm font-semibold border-2 transition ${
                          platform === p
                            ? "border-[color:var(--fg)] bg-[color:var(--fg)] text-[color:var(--bg)]"
                            : "border-[color:var(--border)] bg-white hover:border-[color:var(--fg-muted)]"
                        }`}
                      >
                        {p === "instagram" ? "Instagram" : "TikTok"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Handle input */}
                <div>
                  <label htmlFor="handle" className="text-sm font-semibold mb-2 block">
                    Your handle
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--fg-subtle)] text-base font-medium">
                      @
                    </span>
                    <input
                      id="handle"
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="yourhandle"
                      required
                      className="w-full h-14 pl-9 pr-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-lg font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-14 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-base font-semibold hover:opacity-90 transition"
                >
                  Continue
                </button>
              </form>
            </div>
          )}

          {/* Step: Customize */}
          {step === "customize" && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                Customize your directory
              </h1>
              <p className="text-[color:var(--fg-muted)] mb-8">
                Choose your subdomain and display name.
              </p>

              <form onSubmit={handleStartBuild} className="space-y-6">
                <div>
                  <label htmlFor="slug" className="text-sm font-semibold mb-2 block">
                    Your URL
                  </label>
                  <div className="flex items-center gap-0">
                    <input
                      id="slug"
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      required
                      className="flex-1 h-14 px-4 bg-white border-2 border-r-0 border-[color:var(--border)] rounded-l-xl text-lg font-medium focus:outline-none focus:border-[color:var(--fg)] transition"
                    />
                    <span className="h-14 px-4 bg-black/5 border-2 border-l-0 border-[color:var(--border)] rounded-r-xl text-sm font-medium text-[color:var(--fg-muted)] flex items-center whitespace-nowrap">
                      .buildmy.directory
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="displayName" className="text-sm font-semibold mb-2 block">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Directory"
                    required
                    className="w-full h-14 px-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-lg font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                </div>

                {/* Preview */}
                <div className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-3">
                    Preview
                  </p>
                  <div className="text-center">
                    <h2 className="text-xl font-extrabold tracking-tight uppercase">
                      {displayName || "Your Directory"}
                    </h2>
                    <p className="text-xs text-[color:var(--fg-muted)] mt-1">
                      @{handle.replace(/^@/, "") || "handle"} on {platform}
                    </p>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-[4/5] bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("handle")}
                    className="flex-1 h-14 border-2 border-[color:var(--border)] rounded-xl text-base font-semibold hover:bg-black/5 transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-14 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-base font-semibold hover:opacity-90 transition"
                  >
                    Build My Directory
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step: Processing */}
          {step === "processing" && (
            <div className="animate-fade-in text-center pt-10">
              <div className="w-16 h-16 rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] flex items-center justify-center mx-auto mb-6">
                <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                Building your directory
              </h1>
              <p className="text-[color:var(--fg-muted)] mb-10">
                This usually takes 2-5 minutes depending on how much content you have.
              </p>

              {/* Pipeline steps */}
              <div className="max-w-sm mx-auto space-y-4 text-left">
                {[
                  { key: "scrape", label: "Scraping your content" },
                  { key: "transcribe", label: "Transcribing videos" },
                  { key: "categorize", label: "Categorizing posts" },
                  { key: "complete", label: "Publishing directory" },
                ].map((s) => {
                  const stepOrder = ["scrape", "transcribe", "categorize", "complete"];
                  const currentIdx = stepOrder.indexOf(pipelineStatus.step);
                  const thisIdx = stepOrder.indexOf(s.key);
                  const isDone = thisIdx < currentIdx;
                  const isCurrent = thisIdx === currentIdx;

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
              <div className="max-w-sm mx-auto mt-8">
                <div className="h-2 bg-black/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--fg)] rounded-full transition-all duration-500"
                    style={{ width: `${pipelineStatus.progress}%` }}
                  />
                </div>
                <p className="text-xs text-[color:var(--fg-subtle)] mt-2">
                  {pipelineStatus.message}
                </p>
              </div>

              {/* Error recovery */}
              {pipelineStatus.step === "error" && (
                <div className="max-w-sm mx-auto mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBuilding(false);
                      setPipelineStatus({ step: "scrape", progress: 0, message: "Starting..." });
                      setStep("customize");
                    }}
                    className="flex-1 h-12 border-2 border-[color:var(--border)] rounded-xl text-sm font-semibold hover:bg-black/5 transition"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBuilding(false);
                      setPipelineStatus({ step: "scrape", progress: 0, message: "Starting..." });
                      handleStartBuild({ preventDefault: () => {} } as React.FormEvent);
                    }}
                    className="flex-1 h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="animate-fade-in text-center pt-10">
              <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                Your directory is live!
              </h1>
              <p className="text-[color:var(--fg-muted)] mb-8">
                Share it with your audience.
              </p>

              <div className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-6 mb-6 max-w-sm mx-auto">
                <p className="text-sm font-mono font-semibold">
                  {slug}.buildmy.directory
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
                <Link
                  href={`/d/${slug}`}
                  className="flex-1 h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold flex items-center justify-center hover:opacity-90 transition"
                >
                  View Directory
                </Link>
                <Link
                  href="/dashboard"
                  className="flex-1 h-12 border-2 border-[color:var(--border)] rounded-xl text-sm font-semibold flex items-center justify-center hover:bg-black/5 transition"
                >
                  Go to Dashboard
                </Link>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-[color:var(--border)] py-8 px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-sm font-bold">
              BuildMy<span className="text-black/40">.</span>Directory
            </span>
            <p className="text-xs text-[color:var(--fg-subtle)]">
              Built for creators who want their content to live beyond the feed.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
