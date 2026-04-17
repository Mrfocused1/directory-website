"use client";

import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DubbingButtonProps {
  /** Post UUID */
  postId: string;
  /** Site UUID */
  siteId: string;
  /** Whether the site owner's plan includes the "dubbing" feature */
  hasDubbingFeature: boolean;
  /** Callback to swap the video player's src to the dubbed URL */
  onDubbedVideoReady: (url: string) => void;
}

interface DubbedLang {
  code: string;
  label: string;
}

const DUBBING_LANGUAGES: DubbedLang[] = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "pt", label: "Portuguese" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * DubbingButton — dropdown that lets visitors watch a video dubbed in another
 * language via AI voice cloning + lip sync.
 *
 * - Shows "Watch in [language]" options
 * - Checks for a cached dubbed version first
 * - If not cached, triggers on-demand generation via /api/dubbing
 * - Displays progress state while generating
 * - Only renders when the site owner's plan includes the "dubbing" feature
 *
 * Not yet wired into PostModal — create the component standalone first.
 */
export default function DubbingButton({
  postId,
  siteId,
  hasDubbingFeature,
  onDubbedVideoReady,
}: DubbingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null); // lang code
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (lang: string) => {
      setIsOpen(false);
      setError(null);
      setGenerating(lang);

      try {
        const res = await fetch("/api/dubbing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, postId, targetLang: lang }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Dubbing failed");
          return;
        }

        // Phase 1: audio only — pass audioUrl to parent
        // Phase 2: will use data.dubbedVideoUrl for lip-synced video
        onDubbedVideoReady(data.audioUrl || data.dubbedVideoUrl);
      } catch {
        setError("Network error — please try again");
      } finally {
        setGenerating(null);
      }
    },
    [siteId, postId, onDubbedVideoReady],
  );

  // Don't render if the plan doesn't support dubbing
  if (!hasDubbingFeature) return null;

  const langLabel = DUBBING_LANGUAGES.find((l) => l.code === generating)?.label;

  return (
    <div className="relative inline-block">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={generating !== null}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {generating ? (
          <>
            <Spinner />
            <span>Generating {langLabel}...</span>
          </>
        ) : (
          <>
            <GlobeIcon />
            <span>Watch in...</span>
            <ChevronIcon />
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-1 min-w-[160px] rounded-lg border border-white/10 bg-neutral-900 py-1 shadow-xl"
        >
          {DUBBING_LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(lang.code)}
                className="w-full px-4 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Error toast */}
      {error && (
        <div className="absolute right-0 z-50 mt-1 rounded-lg border border-red-500/30 bg-red-950/90 px-3 py-2 text-xs text-red-300 shadow-lg">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 font-bold text-red-400 hover:text-red-200"
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons (avoid extra deps)
// ---------------------------------------------------------------------------

function GlobeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="31.4 31.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
