"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  postShortcode: string;
}

export default function MidRollVideoAd({ siteId, path, videoRef, postShortcode }: Props) {
  const [ad, setAd] = useState<ServedAd | null>(null);
  const [active, setActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [canSkip, setCanSkip] = useState(false);
  const impressionFired = useRef(false);
  const firedForShortcode = useRef<Set<string>>(new Set());
  const adRef = useRef<ServedAd | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "mid_roll_video");
      if (cancelled || !result) return;
      adRef.current = result;
    }

    load();
    return () => { cancelled = true; };
  }, [siteId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onTimeUpdate() {
      if (!video || firedForShortcode.current.has(postShortcode)) return;
      const ad = adRef.current;
      if (!ad) return;

      const midpoint = video.duration * 0.5;
      if (!isNaN(midpoint) && video.currentTime >= midpoint) {
        firedForShortcode.current.add(postShortcode);
        video.pause();
        setAd(ad);
        setActive(true);
        setSecondsLeft(10);
        setCanSkip(false);

        if (!impressionFired.current) {
          impressionFired.current = true;
          fireImpression(ad.id, path);
        }
      }
    }

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoRef, postShortcode, path]);

  useEffect(() => {
    if (!active) return;

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed++;
      setSecondsLeft((s) => Math.max(0, s - 1));
      if (elapsed >= 5) setCanSkip(true);
      if (elapsed >= 10) {
        clearInterval(interval);
        dismiss();
      }
    }, 1000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function dismiss() {
    setActive(false);
    videoRef.current?.play();
  }

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  if (!active || !ad) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
      <button
        type="button"
        onClick={handleClick}
        className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none"
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

      <div className="absolute top-3 left-3 text-[11px] font-semibold uppercase tracking-wide bg-black/60 text-white px-2 py-0.5 rounded pointer-events-none">
        Ad
      </div>

      {ad.headline && (
        <div className="absolute bottom-14 left-0 right-0 px-4 pointer-events-none">
          <p className="text-white text-sm font-semibold drop-shadow-lg line-clamp-2 text-center">
            {ad.headline}
          </p>
        </div>
      )}

      <div className="absolute bottom-4 right-4">
        {canSkip ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
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
