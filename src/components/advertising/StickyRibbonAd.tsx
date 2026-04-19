"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
}

export default function StickyRibbonAd({ siteId, path }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "sticky_ribbon");
      if (cancelled) return;
      setAd(result);

      if (result && !impressionFired.current) {
        const dismissKey = `banner-dismissed-${result.id}`;
        if (sessionStorage.getItem(dismissKey)) {
          setDismissed(true);
          return;
        }
        impressionFired.current = true;
        fireImpression(result.id, path);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [siteId, path]);

  if (!ad || dismissed) return null;

  function dismiss() {
    if (!ad) return;
    sessionStorage.setItem(`banner-dismissed-${ad.id}`, "1");
    setDismissed(true);
  }

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-12 md:h-12 sm:h-10 bg-[color:var(--card)] border-t border-[color:var(--border)] shadow-lg flex items-center px-4 gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)] shrink-0">
        Ad
      </span>

      <button
        type="button"
        onClick={handleClick}
        className="flex-1 flex items-center gap-2 min-w-0 hover:opacity-70 transition focus:outline-none focus-visible:underline text-left"
      >
        {ad.headline && (
          <span className="text-sm font-semibold text-[color:var(--fg)] truncate">
            {ad.headline}
          </span>
        )}
        {ad.body && (
          <span className="text-xs text-[color:var(--fg-muted)] truncate hidden sm:inline">
            {ad.body}
          </span>
        )}
      </button>

      {ad.clickUrl && (
        <button
          type="button"
          onClick={handleClick}
          className="shrink-0 h-8 px-4 rounded-full text-xs font-bold bg-[color:var(--fg)] text-[color:var(--bg)] hover:opacity-80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fg)]"
        >
          Learn more
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss ad"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[color:var(--fg)]/10 transition focus:outline-none"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
