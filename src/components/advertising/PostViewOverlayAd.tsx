"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
  onDone: () => void;
}

export default function PostViewOverlayAd({ siteId, path, onDone }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "post_view_overlay");
      if (cancelled) return;

      if (!result) {
        onDone();
        return;
      }

      const seenKey = `post_view_overlay-shown-${result.id}`;
      if (sessionStorage.getItem(seenKey)) {
        onDone();
        return;
      }

      sessionStorage.setItem(seenKey, "1");
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
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onDone();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [ad, onDone]);

  if (ad === undefined) return null;
  if (ad === null) return null;

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl overflow-hidden shadow-2xl">
        <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] pointer-events-none">
          Ad
        </span>

        <button
          type="button"
          onClick={handleClick}
          className="block w-full focus:outline-none"
          aria-label={ad.headline ?? "Advertisement"}
        >
          {ad.assetUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.assetUrl}
              alt={ad.headline ?? "Advertisement"}
              className="w-full aspect-video object-cover"
            />
          )}
          <div className="px-4 py-3 text-left">
            {ad.headline && (
              <p className="text-sm font-semibold text-[color:var(--fg)]">{ad.headline}</p>
            )}
            {ad.body && (
              <p className="text-xs text-[color:var(--fg-muted)] mt-1">{ad.body}</p>
            )}
            {ad.clickUrl && (
              <span className="mt-2 inline-block text-xs font-bold underline underline-offset-2 text-[color:var(--fg)]">
                Learn more
              </span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onDone}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition focus:outline-none"
          aria-label="Close ad"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="absolute bottom-2 right-3 text-[10px] font-semibold tabular-nums text-[color:var(--fg-subtle)]">
          Closes in {secondsLeft}s
        </div>
      </div>
    </div>
  );
}
