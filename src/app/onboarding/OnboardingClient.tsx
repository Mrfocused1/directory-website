"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

type Step = "handle" | "customize" | "processing" | "done";

// ─── Demo carousel frames shown during processing ───────────────────────────
const DEMO_FRAMES = [
  {
    id: "grid",
    label: "Content grid",
    render: () => (
      <div className="p-3 h-full flex flex-col">
        <div className="flex items-center gap-1.5 mb-2.5">
          <div className="w-2 h-2 rounded-full bg-[color:var(--bd-lime)]" />
          <div className="h-2 w-16 rounded-full bg-white/30" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 flex-1">
          {["var(--bd-maroon)","var(--bd-lilac)","var(--bd-lime)","var(--bd-green)","var(--bd-maroon)","var(--bd-lime)"].map((bg, i) => (
            <div key={i} className="rounded-lg flex flex-col gap-1 p-1.5" style={{ backgroundColor: bg, opacity: 0.85 }}>
              <div className="flex-1 rounded" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
              <div className="h-1.5 w-3/4 rounded-full bg-white/40" />
              <div className="h-1 w-1/2 rounded-full bg-white/25" />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          {["All","Tips","Recipes","Vlogs"].map((t) => (
            <span key={t} className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/80">{t}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "modal",
    label: "Post details",
    render: () => (
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="rounded-lg flex-1" style={{ backgroundColor: "var(--bd-maroon)", opacity: 0.85, minHeight: 60, position: "relative", overflow: "hidden" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
          </div>
        </div>
        <div className="bg-white/15 rounded-lg p-2 space-y-1">
          <div className="h-1.5 w-3/4 rounded-full bg-white/50" />
          <div className="h-1.5 w-full rounded-full bg-white/35" />
          <div className="h-1.5 w-5/6 rounded-full bg-white/35" />
          <div className="h-1.5 w-2/3 rounded-full bg-white/25" />
        </div>
        <div className="flex gap-1">
          {["Tips","Guides","Picks"].map((tag) => (
            <span key={tag} className="text-[7px] px-1.5 py-0.5 rounded-full bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] font-semibold">{tag}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "search",
    label: "Search & filter",
    render: () => (
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2.5 h-7">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <div className="h-1.5 w-20 rounded-full bg-white/40" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["Tutorials","Q&A","Reviews","Vlogs","Tips"].map((f, i) => (
            <span key={f} className="text-[7px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: i === 0 ? "var(--bd-lime)" : "rgba(255,255,255,0.2)", color: i === 0 ? "var(--bd-dark)" : "white" }}>{f}</span>
          ))}
        </div>
        <div className="flex-1 space-y-1.5">
          {[3,4,2].map((bars, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white/10 rounded-lg p-1.5">
              <div className="w-6 h-6 rounded shrink-0" style={{ backgroundColor: ["var(--bd-maroon)","var(--bd-lilac)","var(--bd-green)"][i], opacity: 0.9 }} />
              <div className="flex-1 space-y-0.5">
                <div className="h-1.5 rounded-full bg-white/50" style={{ width: `${bars * 22}%` }} />
                <div className="h-1 rounded-full bg-white/25 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    render: () => (
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          {[{label:"Views",val:"12.4k"},{label:"Saves",val:"890"},{label:"Shares",val:"234"},{label:"Clicks",val:"3.1k"}].map((m) => (
            <div key={m.label} className="bg-white/15 rounded-lg p-1.5 text-center">
              <div className="text-[10px] font-bold text-white">{m.val}</div>
              <div className="text-[7px] text-white/60">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 bg-white/10 rounded-lg p-2 flex items-end gap-0.5">
          {[40,65,50,80,55,90,70,85,60,95,75,100].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, backgroundColor: i === 11 ? "var(--bd-lime)" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
      </div>
    ),
  },
];

const FUN_FACTS = [
  "Your directory will be SEO-optimized automatically",
  "Every video gets AI-powered transcription",
  "Smart references connect your content to useful resources",
  "Your audience can search, filter, and bookmark posts",
];

// Parse progress counts from pipeline messages like "Scraped 120 posts" or "Transcribed 5/20 videos"
function parseProgressFromMessage(message: string): string | null {
  const match = message.match(/(\d+(?:\/\d+)?)\s+(?:posts?|videos?|clips?)/i);
  return match ? match[0] : null;
}

// Turn the pipeline's raw error string into something a non-technical
// creator can read. The raw messages leak implementation details (HTTP
// codes, scraper internals, JSON blobs) that aren't useful to the user.
function humanizeError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (!m) return "We couldn't build your directory. Please try again in a moment.";
  if (m.includes("not found") || m.includes("private") || m.includes("no user")) {
    return "We couldn't find this Instagram account. Double-check the handle and make sure the profile is public.";
  }
  if (m.includes("could not load profile")) {
    return "Instagram didn't respond for this account. It may be temporarily rate-limited — give it a minute and try again.";
  }
  if (m.includes("timed out") || m.includes("timeout") || m.includes("abort")) {
    return "This took longer than expected. Please try again — we'll pick up where we left off.";
  }
  if (m.includes("429") || m.includes("rate") || m.includes("too many")) {
    return "Instagram is rate-limiting us right now. Please wait a minute or two and try again.";
  }
  if (m.includes("401") || m.includes("unauthorized") || m.includes("auth")) {
    return "Our session with Instagram expired. We'll refresh it automatically — try again in a moment.";
  }
  if (m.includes("session expired") || m.includes("scraper session")) {
    return "Our Instagram session needs a refresh. Try again in a few minutes — we'll reconnect automatically.";
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("econnref")) {
    return "We couldn't reach Instagram from our servers. Please try again in a moment.";
  }
  if (m.includes("not configured")) {
    return "Something on our end isn't ready. Please try again in a moment — if it keeps happening, let us know.";
  }
  // Generic fallback: strip any JSON blobs / HTTP codes from the raw message
  return "We hit a snag building your directory. Give it another try in a moment.";
}

function ProcessingStep({
  pipelineStatus,
  handle,
  postCount,
  currentSiteId,
  retryPipeline,
  handleStartBuild,
  setIsBuilding,
  setPipelineStatus,
  setStep,
}: {
  pipelineStatus: { step: string; progress: number; message: string };
  handle: string;
  postCount: number;
  currentSiteId: string | null;
  retryPipeline: () => Promise<void>;
  handleStartBuild: (e: React.FormEvent) => Promise<void>;
  setIsBuilding: (v: boolean) => void;
  setPipelineStatus: (v: { step: string; progress: number; message: string }) => void;
  setStep: (s: Step) => void;
}) {
  const [carouselFrame, setCarouselFrame] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAt = useRef(Date.now());

  // Rotate carousel every 4 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setCarouselFrame((f) => (f + 1) % DEMO_FRAMES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Rotate fun facts every 6 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setFactIndex((i) => (i + 1) % FUN_FACTS.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  // Tick elapsed time every second
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const estimatedMinutes = postCount > 0
    ? Math.max(2, Math.ceil(postCount / 50)) + 2
    : 5;
  const estimatedSeconds = estimatedMinutes * 60;
  const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);
  const remainingMinutes = Math.ceil(remainingSeconds / 60);

  const cleanHandle = handle.replace(/^@/, "");

  const stepOrder = ["scrape", "transcribe", "categorize", "complete"];
  const pipelineSteps = [
    { key: "scrape", label: "Scraping posts" },
    { key: "transcribe", label: "Transcribing videos" },
    { key: "categorize", label: "Categorizing content" },
    { key: "complete", label: "Publishing directory" },
  ];

  const progressDetail = parseProgressFromMessage(pipelineStatus.message);

  const frame = DEMO_FRAMES[carouselFrame];

  // Queued state: the user just clicked "Build my directory" and the
  // operator hasn't yet run the CLI. Show a calmer screen — ETA range
  // instead of a ticking countdown, and reassurance that an email is
  // coming. As soon as the pipeline's first updateJob() fires, the
  // polled message changes and we fall through to the normal UI.
  const isQueued =
    pipelineStatus.step === "scrape" &&
    pipelineStatus.progress === 0 &&
    /^queued/i.test(pipelineStatus.message);

  return (
    <div className="animate-fade-in text-center pt-4">
      {/* Timeline prediction header */}
      <div className="mb-5">
        <h1 className="font-display-tight text-[2rem] sm:text-[2.75rem] text-[color:var(--bd-dark)] leading-tight">
          {isQueued ? "Queued" : "Building"} @{cleanHandle}
        </h1>
        <p className="text-[color:var(--bd-grey)] text-sm mt-1">
          {pipelineStatus.step === "error"
            ? "Something went wrong"
            : isQueued
            ? "Usually 10–20 minutes · up to 24 hours"
            : remainingSeconds > 0
            ? `~${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""} remaining`
            : "Almost done…"}
        </p>
      </div>

      {/* Queued callout — swaps in for the fun-facts ticker while we wait */}
      {isQueued && (
        <div className="max-w-sm mx-auto bg-[color:var(--bd-lime)]/20 border border-[color:var(--bd-lime)] rounded-xl px-4 py-3 mb-5 text-left">
          <p className="text-xs font-semibold text-[color:var(--bd-dark)] mb-1">
            You can close this tab.
          </p>
          <p className="text-xs text-[color:var(--bd-dark)]/80 leading-relaxed">
            We&apos;ll email you the moment your directory is live — usually
            within 10–20 minutes, sometimes up to a day if we&apos;re batching
            builds. This page auto-updates if you stay on it.
          </p>
        </div>
      )}

      {/* Phone mockup carousel */}
      <div className="max-w-[200px] mx-auto mb-6 relative">
        {/* Phone shell */}
        <div
          className="relative rounded-[1.75rem] overflow-hidden shadow-2xl"
          style={{
            background: "var(--bd-dark)",
            paddingTop: "2px",
            paddingBottom: "4px",
            border: "2px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Notch */}
          <div className="flex justify-center mb-1 pt-1">
            <div className="w-12 h-1 bg-white/10 rounded-full" />
          </div>
          {/* Screen area */}
          <div
            className="mx-2 rounded-[1.25rem] overflow-hidden relative"
            style={{ height: 220, background: "var(--bd-dark)" }}
          >
            {DEMO_FRAMES.map((f, i) => (
              <div
                key={f.id}
                className="absolute inset-0 transition-opacity duration-700"
                style={{ opacity: i === carouselFrame ? 1 : 0 }}
              >
                {f.render()}
              </div>
            ))}
          </div>
          {/* Frame label */}
          <div className="flex justify-center items-center gap-1.5 py-2">
            {DEMO_FRAMES.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === carouselFrame ? 16 : 5,
                  height: 5,
                  backgroundColor: i === carouselFrame ? "var(--bd-lime)" : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
        </div>
        <p className="text-[10px] text-[color:var(--bd-grey)] mt-2 tracking-wide uppercase">
          {frame.label}
        </p>
      </div>

      {/* Pipeline steps */}
      <div className="max-w-sm mx-auto space-y-3 text-left bg-white rounded-2xl p-5 mb-5">
        {pipelineSteps.map((s) => {
          const currentIdx = stepOrder.indexOf(pipelineStatus.step);
          const thisIdx = stepOrder.indexOf(s.key);
          const isDone = thisIdx < currentIdx;
          const isCurrent = thisIdx === currentIdx && pipelineStatus.step !== "error";

          return (
            <div key={s.key} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isDone
                    ? "bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)]"
                    : isCurrent
                      ? "bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)]"
                      : "bg-neutral-100"
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
              <div className="flex-1 min-w-0">
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
                {isCurrent && progressDetail && (
                  <span className="ml-2 text-xs text-[color:var(--bd-grey)]">{progressDetail}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="max-w-sm mx-auto mb-5">
        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[color:var(--bd-dark)] rounded-full transition-all duration-700"
            style={{ width: `${pipelineStatus.progress}%` }}
          />
        </div>
        <p className="text-xs text-[color:var(--bd-grey)] mt-2">
          {pipelineStatus.step === "error"
            ? humanizeError(pipelineStatus.message)
            : pipelineStatus.message}
        </p>
      </div>

      {/* Fun facts ticker */}
      {pipelineStatus.step !== "error" && (
        <div className="max-w-sm mx-auto bg-white/70 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-[color:var(--bd-grey)] italic transition-opacity duration-500">
            {FUN_FACTS[factIndex]}
          </p>
        </div>
      )}

      {/* Error recovery */}
      {pipelineStatus.step === "error" && (
        <div className="max-w-sm mx-auto mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setIsBuilding(false);
              setPipelineStatus({ step: "scrape", progress: 0, message: "Starting..." });
              setStep("customize");
            }}
            className="flex-1 h-12 border-2 border-neutral-200 rounded-full text-sm font-semibold text-[color:var(--bd-dark)] hover:bg-white transition"
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
                void handleStartBuild({ preventDefault: () => {} } as React.FormEvent);
              }
            }}
            className="flex-1 h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold hover:opacity-90 transition"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export default function OnboardingClient() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<Step>("handle");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [promoApplied, setPromoApplied] = useState(false);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Auto-apply promo code from URL (e.g. ?promo=INFLUENCER123)
  useEffect(() => {
    const promo = searchParams.get("promo");
    if (!promo || promoApplied) return;
    setPromoApplied(true);

    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promoCode: promo }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          console.log("[onboarding] Promo code applied successfully");
        }
      })
      .catch(() => {});
  }, [searchParams, promoApplied]);
  const [platform, setPlatform] = useState<"instagram">("instagram");
  const [handle, setHandle] = useState(() => {
    return searchParams.get("handle")?.replace(/^@/, "") || "";
  });

  // Instagram profile lookup
  type ProfileHit = { username: string; fullName: string; avatarUrl: string; isVerified: boolean; postCount: number };
  const [profileResults, setProfileResults] = useState<ProfileHit[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [confirmedProfile, setConfirmedProfile] = useState<ProfileHit | null>(null);
  const [confirmedPostCount, setConfirmedPostCount] = useState(0);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchProfiles = useCallback((query: string) => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    setConfirmedProfile(null);

    const clean = query.replace(/^@/, "").trim();
    if (clean.length < 2) {
      setProfileResults([]);
      return;
    }

    lookupTimer.current = setTimeout(async () => {
      setProfileLoading(true);
      try {
        const res = await fetch(`/api/instagram/lookup?q=${encodeURIComponent(clean)}`);
        const data = await res.json();
        setProfileResults(data.profiles || []);
      } catch {
        setProfileResults([]);
      } finally {
        setProfileLoading(false);
      }
    }, 400); // debounce 400ms
  }, []);

  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");

  const selectProfile = useCallback((profile: ProfileHit) => {
    setHandle(profile.username);
    setConfirmedProfile(profile);
    setConfirmedPostCount(profile.postCount ?? 0);
    setProfileResults([]);
    if (!slug) setSlug(profile.username.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    if (!displayName) setDisplayName(profile.fullName || profile.username);
  }, [slug, displayName]);

  const [pipelineStatus, setPipelineStatus] = useState<{
    step: string;
    progress: number;
    message: string;
  }>({ step: "scrape", progress: 0, message: "Starting..." });

  const handleSubmitHandle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    if (!confirmedProfile) {
      // Trigger search if not confirmed yet
      searchProfiles(handle);
      return;
    }
    const cleanHandle = handle.replace(/^@/, "").trim();
    if (!slug) setSlug(cleanHandle.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    if (!displayName) setDisplayName(confirmedProfile.fullName || cleanHandle);
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
            router.replace("/onboarding?complete=1");
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
            if (res.status === 403 && /upgrade|limit|subscri/i.test(errMsg)) {
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
      window.scrollTo({ top: 0, behavior: "smooth" });

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
            router.replace("/onboarding?complete=1");
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
    <div className="marketing-theme min-h-screen flex flex-col overflow-x-hidden">
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />
      </div>

      <main className="flex-1 bg-[color:var(--bd-cream)] py-10 sm:py-16">
        <div className="max-w-xl mx-auto px-5 sm:px-6">
          {/* Steps indicator */}
          <div className="flex items-center justify-center gap-3 mb-8 sm:mb-10">
            {(["handle", "customize", "processing"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition ${
                    step === s || (step === "done" && s === "processing")
                      ? "bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)]"
                      : i < ["handle", "customize", "processing"].indexOf(step)
                        ? "bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)]"
                        : "bg-neutral-200 text-neutral-400"
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
                {i < 2 && <div className="w-10 sm:w-14 h-0.5 bg-neutral-200 rounded-full" />}
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
                  {["Up to 150 posts", "30 syncs per month", "Instagram", "Full analytics dashboard", "Email newsletter", "Smart references"].map((f) => (
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
              <h1 className="font-display-tight text-[2rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] mb-2 sm:mb-3">
                Let&apos;s build
                <br />
                your directory.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-8 sm:mb-10 leading-relaxed text-sm sm:text-base">
                Enter your social media handle and we&apos;ll do the rest.
              </p>

              <form onSubmit={handleSubmitHandle} className="space-y-6">
                {/* Platform — Instagram only for now */}
                <input type="hidden" name="platform" value="instagram" />

                {/* Handle input with profile search */}
                <div>
                  <label htmlFor="handle" className="block text-xs uppercase tracking-wider font-semibold text-[color:var(--bd-dark)] mb-3">
                    Your Instagram handle
                  </label>
                  <div className="relative mt-2">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[color:var(--bd-grey)] text-base font-medium">
                      @
                    </span>
                    <input
                      id="handle"
                      type="text"
                      value={handle}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^@/, "");
                        setHandle(val);
                        searchProfiles(val);
                      }}
                      placeholder="yourhandle"
                      required
                      autoComplete="off"
                      className="w-full h-14 pl-10 pr-12 bg-white border-2 border-neutral-200 rounded-full text-lg font-medium placeholder:text-neutral-400 focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                    />
                    {profileLoading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Not-found hint: input is long enough, lookup finished,
                      but no real profile was matched. */}
                  {!profileLoading && !confirmedProfile && profileResults.length === 0 && handle.replace(/^@/, "").trim().length >= 2 && (
                    <div className="mt-2 bg-white border border-neutral-200 rounded-2xl px-4 py-3">
                      <p className="text-sm text-[color:var(--bd-dark)] font-medium">
                        We couldn&apos;t find <span className="font-semibold">@{handle.replace(/^@/, "").trim()}</span> on Instagram.
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Check the spelling, or make sure the account is public.
                      </p>
                    </div>
                  )}

                  {/* Profile dropdown results */}
                  {profileResults.length > 0 && !confirmedProfile && (
                    <div className="mt-2 bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
                      {profileResults.map((p) => (
                        <button
                          key={p.username}
                          type="button"
                          onClick={() => selectProfile(p)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition text-left"
                        >
                          {p.avatarUrl ? (
                            <img
                              src={p.avatarUrl}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover bg-neutral-100 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 flex items-center justify-center text-neutral-400 text-sm font-bold">
                              {p.username[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-[color:var(--bd-dark)] truncate">
                                {p.fullName || p.username}
                              </span>
                              {p.isVerified && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#3897f0" aria-label="Verified"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                              )}
                            </div>
                            <span className="text-xs text-neutral-500">@{p.username}</span>
                          </div>
                          <span className="text-xs text-neutral-400 shrink-0">Select</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Confirmed profile card */}
                  {confirmedProfile && (
                    <div className="mt-3 flex items-center gap-3 bg-white border-2 border-[color:var(--bd-lime)] rounded-2xl px-4 py-3">
                      {confirmedProfile.avatarUrl ? (
                        <img
                          src={confirmedProfile.avatarUrl}
                          alt=""
                          className="w-11 h-11 rounded-full object-cover bg-neutral-100 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-neutral-200 shrink-0 flex items-center justify-center text-neutral-400 font-bold">
                          {confirmedProfile.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[color:var(--bd-dark)] truncate">
                            {confirmedProfile.fullName || confirmedProfile.username}
                          </span>
                          {confirmedProfile.isVerified && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#3897f0" aria-label="Verified"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                          )}
                        </div>
                        <span className="text-xs text-neutral-500">@{confirmedProfile.username} on Instagram</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmedProfile(null);
                          setHandle("");
                          setSlug("");
                          setDisplayName("");
                        }}
                        className="text-xs text-neutral-400 hover:text-neutral-600 transition shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!confirmedProfile}
                  className="w-full h-14 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-base font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {confirmedProfile ? "Continue" : "Search & select your account"}
                </button>
              </form>
            </div>
          )}

          {/* Step: Customize */}
          {step === "customize" && !upgradeRequired && (
            <div className="animate-fade-in">
              <h1 className="font-display-tight text-[2rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] mb-2 sm:mb-3">
                Customize
                <br />
                your directory.
              </h1>
              <p className="text-[color:var(--bd-grey)] mb-8 sm:mb-10 leading-relaxed text-sm sm:text-base">
                Choose your URL and display name.
              </p>

              <form onSubmit={handleStartBuild} className="space-y-5 sm:space-y-6">
                <div>
                  <label htmlFor="slug" className="eyebrow text-[color:var(--bd-dark)] mb-3 block text-xs uppercase tracking-wider font-semibold">
                    Your URL
                  </label>
                  <div className="flex items-center mt-2">
                    <span className="h-12 sm:h-14 px-3 sm:px-5 bg-neutral-100 border-2 border-r-0 border-neutral-200 rounded-l-full text-xs sm:text-sm font-medium text-[color:var(--bd-grey)] flex items-center whitespace-nowrap">
                      buildmy.directory/
                    </span>
                    <input
                      id="slug"
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      required
                      className="flex-1 min-w-0 h-12 sm:h-14 px-3 sm:px-4 bg-white border-2 border-l-0 border-neutral-200 rounded-r-full text-base sm:text-lg font-medium text-[color:var(--bd-dark)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="displayName" className="eyebrow text-[color:var(--bd-dark)] mb-3 block text-xs uppercase tracking-wider font-semibold">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Directory"
                    required
                    className="w-full h-12 sm:h-14 px-4 sm:px-5 mt-2 bg-white border-2 border-neutral-200 rounded-full text-base sm:text-lg font-medium text-[color:var(--bd-dark)] placeholder:text-neutral-400 focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                  />
                </div>

                {/* Preview */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-neutral-100">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-[color:var(--bd-lime)]" />
                    <span className="text-xs uppercase tracking-wider font-semibold text-[color:var(--bd-grey)]">Preview</span>
                  </div>
                  <div className="text-center">
                    <h2 className="font-display-tight text-xl sm:text-2xl text-[color:var(--bd-dark)]">
                      {displayName || "Your Directory"}
                    </h2>
                    <p className="text-xs text-[color:var(--bd-grey)] mt-1">
                      @{handle.replace(/^@/, "") || "handle"} on {platform}
                    </p>
                    <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-2">
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

                {/* Estimate info line */}
                {confirmedPostCount > 0 && (
                  <p className="text-xs text-[color:var(--bd-grey)] text-center">
                    @{handle.replace(/^@/, "")} has {confirmedPostCount.toLocaleString()} posts
                    {" · "}Estimated build time: ~{Math.max(2, Math.ceil(confirmedPostCount / 50)) + 2} minutes
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep("handle")}
                    className="flex-1 h-12 sm:h-14 border-2 border-neutral-200 rounded-full text-sm sm:text-base font-semibold text-[color:var(--bd-dark)] hover:bg-white transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-12 sm:h-14 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm sm:text-base font-semibold hover:opacity-90 transition"
                  >
                    Build My Directory
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step: Processing */}
          {step === "processing" && !upgradeRequired && (
            <ProcessingStep
              pipelineStatus={pipelineStatus}
              handle={handle}
              postCount={confirmedPostCount}
              currentSiteId={currentSiteId}
              retryPipeline={retryPipeline}
              handleStartBuild={handleStartBuild}
              setIsBuilding={setIsBuilding}
              setPipelineStatus={setPipelineStatus}
              setStep={setStep}
            />
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

              <div className="max-w-sm mx-auto space-y-3">
                <Link
                  href={`/${slug}`}
                  className="block w-full h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold leading-[3rem] text-center hover:opacity-90 transition"
                >
                  View Directory
                </Link>
                <Link
                  href="/dashboard"
                  className="block w-full h-12 border-2 border-neutral-200 rounded-full text-sm font-semibold leading-[2.75rem] text-center text-[color:var(--bd-dark)] hover:bg-white transition"
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
