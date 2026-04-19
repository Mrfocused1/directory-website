"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
}

export default function BannerTopAd({ siteId, path }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "banner_top");
      if (cancelled) return;
      setAd(result);

      if (result && !impressionFired.current) {
        // check dismiss state before firing impression
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
    <div className="w-full bg-[color:var(--fg)] text-[color:var(--bg)] relative flex items-center justify-center min-h-[48px] px-10 py-2 text-sm">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-3 hover:opacity-80 transition focus:outline-none focus-visible:underline text-left"
      >
        {ad.assetUrl && ad.assetType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.assetUrl} alt="" className="h-7 w-auto object-contain shrink-0" aria-hidden />
        )}
        {ad.headline && <span className="font-semibold">{ad.headline}</span>}
        {ad.body && <span className="opacity-80 hidden sm:inline">{ad.body}</span>}
        {ad.clickUrl && (
          <span className="shrink-0 font-bold underline underline-offset-2">Learn more</span>
        )}
      </button>

      {/* dismiss */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss ad"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full hover:opacity-60 transition focus:outline-none"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide opacity-50 pointer-events-none">
        Ad
      </span>
    </div>
  );
}
