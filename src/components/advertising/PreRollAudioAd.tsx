"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
  onDone: () => void;
}

export default function PreRollAudioAd({ siteId, path, onDone }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [canSkip, setCanSkip] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "pre_roll_audio");
      if (cancelled) return;

      if (!result || !result.assetUrl) {
        onDone();
        return;
      }

      setAd(result);

      if (!impressionFired.current) {
        impressionFired.current = true;
        fireImpression(result.id, path);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [siteId, path, onDone]);

  useEffect(() => {
    if (!ad) return;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed++;
      setSecondsLeft((s) => Math.max(0, s - 1));
      if (elapsed >= 5) setCanSkip(true);
      if (elapsed >= 15) {
        clearInterval(interval);
        onDone();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [ad, onDone]);

  if (ad === undefined || ad === null) return null;

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sponsored audio message"
    >
      <div className="relative w-full max-w-sm bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl overflow-hidden shadow-2xl">
        <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] pointer-events-none z-10">
          Ad
        </span>

        <div className="pt-10 pb-6 px-6 flex flex-col items-center">
          <div className="flex items-end gap-1 h-10 mb-4" aria-hidden>
            {[14, 26, 18, 32, 22].map((h, i) => (
              <span
                key={i}
                className="w-1.5 bg-[color:var(--fg)] rounded-full animate-pulse"
                style={{ height: `${h}px`, animationDelay: `${i * 120}ms`, animationDuration: "900ms" }}
              />
            ))}
          </div>

          <audio
            ref={audioRef}
            src={ad.assetUrl ?? undefined}
            autoPlay
            onEnded={onDone}
            className="hidden"
          />

          {ad.headline && (
            <p className="text-sm font-semibold text-[color:var(--fg)] text-center leading-tight">{ad.headline}</p>
          )}
          {ad.body && (
            <p className="text-xs text-[color:var(--fg-muted)] mt-1 text-center leading-relaxed">{ad.body}</p>
          )}

          {ad.clickUrl && (
            <button
              type="button"
              onClick={handleClick}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[color:var(--fg)] underline underline-offset-2 hover:opacity-70 transition focus:outline-none"
            >
              Learn more
            </button>
          )}
        </div>

        <div className="border-t border-[color:var(--border)] px-4 py-3 flex justify-end">
          {canSkip ? (
            <button
              type="button"
              onClick={onDone}
              className="text-xs font-bold px-3 py-1.5 rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] hover:opacity-80 transition focus:outline-none"
            >
              Skip ad
            </button>
          ) : (
            <span className="text-xs font-semibold text-[color:var(--fg-subtle)] tabular-nums">
              Skip in {secondsLeft}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
