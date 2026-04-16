"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

type Step = "handle" | "customize" | "processing" | "done";

export default function OnboardingClient() {
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
  const [upgradeRequired, setUpgradeRequired] = useState<string | null>(null);
  // If the user came here from a failed build via "Change handle & retry",
  // we get the existing site id in the URL. We then PATCH that site with
  // the new handle instead of POSTing a new one (which would hit the free
  // plan's 1-site limit).
  const [currentSiteId, setCurrentSiteId] = useState<string | null>(() =>
    searchParams.get("existing"),
  );

  const retryPipeline = async () => {
    if (!currentSiteId || isBuilding) return;
    setIsBuilding(true);
    setPipelineStatus({ step: "scrape", progress: 0, message: "Retrying..." });
    try {
      const res = await fetch(`/api/pipeline/retry?siteId=${currentSiteId}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPipelineStatus({ step: "error", progress: 0, message: data?.error || "Retry failed" });
        setIsBuilding(false);
        return;
      }
      // Re-poll the existing siteId — reuse the same polling shape
      pollExistingSite(currentSiteId);
    } catch {
      setPipelineStatus({ step: "error", progress: 0, message: "Network error" });
      setIsBuilding(false);
    }
  };

  const pollExistingSite = (siteId: string) => {
    let pollDelay = 2000;
    const MAX_DELAY = 10000;
    let consecutiveErrors = 0;
    const MAX_ERRORS = 5;
    const poll = async () => {
      try {
        const statusRes = await fetch(`/api/pipeline?siteId=${siteId}`);
        const status = await statusRes.json();
        consecutiveErrors = 0;
        setPipelineStatus({
          step: status.currentStep || "scrape",
          progress: status.progress || 0,
          message: status.message || "Processing...",
        });
        if (status.status === "completed") {
          setStep("done");
          setIsBuilding(false);
          return;
        }
        if (status.status === "failed") {
          setPipelineStatus({ step: "error", progress: 0, message: status.error || "Something went wrong" });
          setIsBuilding(false);
          return;
        }
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_ERRORS) {
          setPipelineStatus({ step: "error", progress: 0, message: "Lost connection. Please try again." });
          setIsBuilding(false);
          return;
        }
      }
      pollDelay = Math.min(pollDelay * 1.5, MAX_DELAY);
      pollRef.current = setTimeout(poll, pollDelay);
    };
    pollRef.current = setTimeout(poll, 2000);
  };

  const handleStartBuild = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double-clicks while building
    if (isBuilding) return;
    setIsBuilding(true);

    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    try {
      const cleanHandle = handle.replace(/^@/, "").trim();

      // If the user is retrying with a new handle against an existing
      // failed site, PATCH the site + kick off a pipeline retry instead
      // of POSTing a new site (which would hit the siteLimit).
      let siteId: string;
      if (currentSiteId) {
        const patchRes = await fetch(
          `/api/sites?id=${encodeURIComponent(currentSiteId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              handle: cleanHandle,
              platform,
              displayName,
            }),
          },
        );
        if (!patchRes.ok) {
          const data = await patchRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update site.");
        }
        const retryRes = await fetch(
          `/api/pipeline/retry?siteId=${encodeURIComponent(currentSiteId)}`,
          { method: "POST" },
        );
        if (!retryRes.ok) {
          const data = await retryRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to restart pipeline.");
        }
        siteId = currentSiteId;
      } else {
        const res = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform,
            handle: cleanHandle,
            slug,
            displayName,
          }),
        });

        if (!res.ok) {
          let errMsg = "Failed to start pipeline";
          try {
            const errData = await res.json();
            if (errData?.error) errMsg = errData.error;
            if (errData?.reason === "free_build_exhausted" || (res.status === 403 && /upgrade|limit/i.test(errMsg))) {
              setUpgradeRequired(errMsg);
              setIsBuilding(false);
              return;
            }
          } catch {
            // Response wasn't JSON — use generic message
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        siteId = data.siteId;
        setCurrentSiteId(data.siteId);
      }

      // Only show the processing spinner AFTER the API accepted the build.
      // This avoids a false-progress state when the API rejects with 403.
      setStep("processing");

      const data = { siteId };

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
    <div className="marketing-theme min-h-screen flex flex-col">
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />
      </div>

      <main className="flex-1 bg-[color:var(--bd-cream)] py-16">
        <div className="max-w-xl mx-auto px-6">
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mb-10">
            {(["handle", "customize", "processing"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                    step === s || (step === "done" && s === "processing")
                      ? "bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)]"
                      : i < ["handle", "customize", "processing"].indexOf(step)
                        ? "bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)]"
                        : "bg-[color:var(--bd-dark-faded)] text-[color:var(--bd-grey)]"
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
                {i < 2 && <div className="w-12 h-0.5 bg-[color:var(--bd-dark-faded)] rounded-full" />}
              </div>
            ))}
          </div>

          {/* Step: Enter handle */}
          {/* ── Upgrade required card (shown when free build is exhausted) ── */}
          {upgradeRequired && (
            <div className="animate-fade-in text-center py-8">
              <div className="w-20 h-20 rounded-full bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)] flex items-center justify-center mx-auto mb-6">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h1 className="font-display-tight text-[2.25rem] sm:text-[3rem] text-[color:var(--bd-dark)] mb-4">
                Upgrade to keep
                <br />
                building.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-10 leading-relaxed max-w-md mx-auto">
                {upgradeRequired}
              </p>

              <div className="bg-white rounded-[1.5rem] p-8 max-w-sm mx-auto mb-8">
                <div className="text-center mb-6">
                  <div className="font-display-tight text-[color:var(--bd-dark)] text-2xl mb-1">Creator</div>
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="font-display-tight text-[3rem] leading-none text-[color:var(--bd-dark)]">$19</span>
                    <span className="text-sm text-[color:var(--bd-grey)]">/mo</span>
                  </div>
                  <p className="text-xs text-[color:var(--bd-grey)]">
                    Unlimited rebuilds · 30 syncs/month · custom domain · analytics · newsletter
                  </p>
                </div>
                <ul className="space-y-2 text-sm text-[color:var(--bd-dark)] mb-6">
                  {["Up to 100 posts", "30 syncs per month", "Instagram + TikTok + YouTube", "Full analytics dashboard", "Email newsletter", "Smart references"].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/dashboard/account#plan"
                  className="block w-full h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold hover:opacity-90 transition flex items-center justify-center"
                >
                  Upgrade now
                </Link>
              </div>

              <Link
                href="/dashboard"
                className="text-sm text-[color:var(--bd-grey)] hover:text-[color:var(--bd-dark)] hover:underline"
              >
                ← Back to dashboard
              </Link>
            </div>
          )}

          {step === "handle" && !upgradeRequired && (
            <div className="animate-fade-in">
              <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] mb-3">
                Let&apos;s build
                <br />
                your directory.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-10 leading-relaxed">
                Enter your social media handle and we&apos;ll do the rest.
              </p>

              <form onSubmit={handleSubmitHandle} className="space-y-6">
                {/* Platform selector */}
                <div>
                  <label className="eyebrow text-[color:var(--bd-dark)] mb-3">Platform</label>
                  <div className="flex gap-2 mt-2">
                    {(["instagram", "tiktok"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlatform(p)}
                        className={`flex-1 h-12 rounded-full text-sm font-semibold border-2 transition ${
                          platform === p
                            ? "border-[color:var(--bd-dark)] bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)]"
                            : "border-[color:var(--bd-dark-faded)] bg-white text-[color:var(--bd-dark)] hover:border-[color:var(--bd-dark)]"
                        }`}
                      >
                        {p === "instagram" ? "Instagram" : "TikTok"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Handle input */}
                <div>
                  <label htmlFor="handle" className="eyebrow text-[color:var(--bd-dark)] mb-3">
                    Your handle
                  </label>
                  <div className="relative mt-2">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[color:var(--bd-grey)] text-base font-medium">
                      @
                    </span>
                    <input
                      id="handle"
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="yourhandle"
                      required
                      className="w-full h-14 pl-10 pr-4 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-lg font-medium placeholder:text-[color:var(--bd-grey)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-14 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-base font-semibold hover:opacity-90 transition"
                >
                  Continue
                </button>
              </form>
            </div>
          )}

          {/* Step: Customize */}
          {step === "customize" && !upgradeRequired && (
            <div className="animate-fade-in">
              <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] mb-3">
                Customize
                <br />
                your directory.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-10 leading-relaxed">
                Choose your URL and display name.
              </p>

              <form onSubmit={handleStartBuild} className="space-y-6">
                <div>
                  <label htmlFor="slug" className="eyebrow text-[color:var(--bd-dark)] mb-3">
                    Your URL
                  </label>
                  <div className="flex items-center gap-0 mt-2">
                    <span className="h-14 px-5 bg-[color:var(--bd-cream-2)] border-2 border-r-0 border-[color:var(--bd-dark-faded)] rounded-l-full text-sm font-medium text-[color:var(--bd-grey)] flex items-center whitespace-nowrap">
                      buildmy.directory/
                    </span>
                    <input
                      id="slug"
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      required
                      className="flex-1 h-14 px-4 bg-white border-2 border-l-0 border-[color:var(--bd-dark-faded)] rounded-r-full text-lg font-medium text-[color:var(--bd-dark)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="displayName" className="eyebrow text-[color:var(--bd-dark)] mb-3">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Directory"
                    required
                    className="w-full h-14 px-5 mt-2 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-lg font-medium text-[color:var(--bd-dark)] placeholder:text-[color:var(--bd-grey)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                  />
                </div>

                {/* Preview */}
                <div className="bg-white rounded-[1.25rem] p-6">
                  <p className="eyebrow text-[color:var(--bd-dark)] mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)]" />
                    Preview
                  </p>
                  <div className="text-center">
                    <h2 className="font-display-tight text-2xl text-[color:var(--bd-dark)]">
                      {displayName || "Your Directory"}
                    </h2>
                    <p className="text-xs text-[color:var(--bd-grey)] mt-1">
                      @{handle.replace(/^@/, "") || "handle"} on {platform}
                    </p>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        "var(--bd-maroon)",
                        "var(--bd-lilac)",
                        "var(--bd-lime)",
                        "var(--bd-green)",
                      ].map((bg, i) => (
                        <div key={i} className="aspect-[4/5] rounded-lg" style={{ backgroundColor: bg }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("handle")}
                    className="flex-1 h-14 border-2 border-[color:var(--bd-dark-faded)] rounded-full text-base font-semibold text-[color:var(--bd-dark)] hover:bg-white transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-14 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-base font-semibold hover:opacity-90 transition"
                  >
                    Build My Directory
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step: Processing */}
          {step === "processing" && !upgradeRequired && (
            <div className="animate-fade-in text-center pt-6">
              <div className="w-16 h-16 rounded-full bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)] flex items-center justify-center mx-auto mb-6">
                <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
              <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] mb-3">
                Building your
                <br />
                directory.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-10 leading-relaxed">
                This usually takes 2-5 minutes depending on how much content you have.
              </p>

              {/* Pipeline steps */}
              <div className="max-w-sm mx-auto space-y-4 text-left bg-white rounded-2xl p-6">
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
                            ? "bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)]"
                            : isCurrent
                              ? "bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)]"
                              : "bg-[color:var(--bd-dark-faded)]"
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
                            ? "text-[color:var(--bd-dark)]"
                            : isCurrent
                              ? "text-[color:var(--bd-dark)] font-semibold"
                              : "text-[color:var(--bd-grey)]"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="max-w-sm mx-auto mt-6">
                <div className="h-2 bg-[color:var(--bd-dark-faded)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--bd-dark)] rounded-full transition-all duration-500"
                    style={{ width: `${pipelineStatus.progress}%` }}
                  />
                </div>
                <p className="text-xs text-[color:var(--bd-grey)] mt-2">
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
                    className="flex-1 h-12 border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-semibold text-[color:var(--bd-dark)] hover:bg-white transition"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentSiteId) {
                        void retryPipeline();
                      } else {
                        setIsBuilding(false);
                        setPipelineStatus({ step: "scrape", progress: 0, message: "Starting..." });
                        handleStartBuild({ preventDefault: () => {} } as React.FormEvent);
                      }
                    }}
                    className="flex-1 h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold hover:opacity-90 transition"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="animate-fade-in text-center pt-6">
              <div className="w-16 h-16 rounded-full bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] mb-3">
                Your directory
                <br />
                is live.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-8 leading-relaxed">
                Share it with your audience.
              </p>

              <div className="bg-white rounded-2xl p-6 mb-6 max-w-sm mx-auto">
                <p className="text-sm font-mono font-semibold text-[color:var(--bd-dark)]">
                  buildmy.directory/{slug}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
                <Link
                  href={`/${slug}`}
                  className="flex-1 h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold flex items-center justify-center hover:opacity-90 transition"
                >
                  View Directory
                </Link>
                <Link
                  href="/dashboard"
                  className="flex-1 h-12 border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-semibold flex items-center justify-center text-[color:var(--bd-dark)] hover:bg-white transition"
                >
                  Go to Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
