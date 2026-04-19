"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
  onDone: () => void;
}

export default function PreRollAd({ siteId, path, onDone }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined); // undefined = loading
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [canSkip, setCanSkip] = useState(false);
  const impressionFired = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // try video first, fall back to image
      let result = await fetchAd(siteId, "pre_roll_video");
      if (!result) result = await fetchAd(siteId, "pre_roll_image");

      if (cancelled) return;

      if (!result) {
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

  // countdown + auto-dismiss
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

  // still loading
  if (ad === undefined) return null;
  // no ad found — onDone already called
  if (ad === null) return null;

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
      {/* ad creative */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none"
        onClick={handleClick}
        aria-label={ad.headline ?? "Advertisement"}
      >
        {ad.assetType === "video" && ad.assetUrl ? (
          <video
            src={ad.assetUrl}
            autoPlay
            muted
            playsInline
            loop
            className="w-full h-full object-contain"
          />
        ) : ad.assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.assetUrl}
            alt={ad.headline ?? "Advertisement"}
            className="w-full h-full object-contain"
          />
        ) : null}
      </button>

      {/* overlay label */}
      <div className="absolute top-3 left-3 text-[11px] font-semibold uppercase tracking-wide bg-black/60 text-white px-2 py-0.5 rounded pointer-events-none">
        Ad
      </div>

      {/* headline overlay */}
      {ad.headline && (
        <div className="absolute bottom-14 left-0 right-0 px-4 pointer-events-none">
          <p className="text-white text-sm font-semibold drop-shadow-lg line-clamp-2 text-center">
            {ad.headline}
          </p>
        </div>
      )}

      {/* skip / countdown */}
      <div className="absolute bottom-4 right-4">
        {canSkip ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDone(); }}
            className="bg-white/90 text-black text-xs font-bold px-3 py-1.5 rounded-full hover:bg-white transition"
          >
            Skip ad
          </button>
        ) : (
          <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full tabular-nums">
            Skip in {secondsLeft}s
          </span>
        )}
      </div>
    </div>
  );
}
