"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
  siteName: string;
}

export default function HomepageTakeoverAd({ siteId, path, siteName }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "homepage_takeover");
      if (cancelled) return;

      if (!result) {
        setAd(null);
        return;
      }

      const seenKey = `homepage_takeover-shown-${result.id}`;
      if (sessionStorage.getItem(seenKey)) {
        setAd(null);
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
  }, [siteId, path]);

  if (ad === undefined || !ad || dismissed) return null;

  function dismiss() {
    if (!ad) return;
    sessionStorage.setItem(`homepage_takeover-shown-${ad.id}`, "1");
    setDismissed(true);
  }

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sponsored message"
    >
      <div className="relative w-full max-w-lg bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl overflow-hidden shadow-2xl">
        <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] pointer-events-none z-10">
          Ad
        </span>

        {ad.assetUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.assetUrl}
            alt={ad.headline ?? "Advertisement"}
            className="w-full aspect-video object-cover"
          />
        )}

        <div className="px-6 py-5">
          {ad.headline && (
            <h2 className="text-xl font-bold text-[color:var(--fg)] leading-tight">{ad.headline}</h2>
          )}
          {ad.body && (
            <p className="mt-2 text-sm text-[color:var(--fg-muted)] leading-relaxed">{ad.body}</p>
          )}

          {ad.clickUrl && (
            <button
              type="button"
              onClick={handleClick}
              className="mt-4 w-full h-11 rounded-xl bg-[color:var(--fg)] text-[color:var(--bg)] text-sm font-bold hover:opacity-90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fg)]"
            >
              Learn more
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full text-center text-xs text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] transition focus:outline-none"
          >
            Continue to {siteName}
          </button>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition focus:outline-none"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
