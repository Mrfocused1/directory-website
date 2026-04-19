"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
}

export default function SponsoredReferenceAd({ siteId, path }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "sponsored_reference");
      if (cancelled) return;
      setAd(result);

      if (result && !impressionFired.current) {
        impressionFired.current = true;
        fireImpression(result.id, path);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [siteId, path]);

  if (!ad) return null;

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--fg)] bg-[color:var(--card)] border border-[color:var(--border)] rounded-full px-3 py-1.5 hover:bg-[color:var(--fg)] hover:text-[color:var(--bg)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fg)]"
        aria-label={ad.headline ?? "Sponsored link"}
      >
        {ad.headline}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M7 17L17 7M17 7H9M17 7v8" />
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-wide opacity-50 ml-0.5">
          Sponsored
        </span>
      </button>
    </li>
  );
}
