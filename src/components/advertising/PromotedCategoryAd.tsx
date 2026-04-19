"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
}

export default function PromotedCategoryAd({ siteId, path }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "promoted_category");
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
    <button
      type="button"
      onClick={handleClick}
      className="relative cursor-pointer text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 min-h-[36px] rounded-full whitespace-nowrap flex-shrink-0 transition-colors text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] border border-dashed border-[color:var(--border)] flex items-center gap-1"
      aria-label={`${ad.headline ?? "Sponsored"} — Sponsored category`}
    >
      <span>{ad.headline ?? "Sponsored"}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-50">
        Sponsored
      </span>
    </button>
  );
}
