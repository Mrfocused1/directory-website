"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAd, fireImpression, fireClick } from "./adUtils";
import type { ServedAd } from "./adUtils";

interface Props {
  siteId: string;
  path: string;
}

export default function SidebarCardAd({ siteId, path }: Props) {
  const [ad, setAd] = useState<ServedAd | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const impressionFired = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    let cancelled = false;

    async function load() {
      const result = await fetchAd(siteId, "sidebar_card");
      if (cancelled) return;

      if (result) {
        const dismissKey = `sidebar-dismissed-${result.id}`;
        if (sessionStorage.getItem(dismissKey)) {
          setDismissed(true);
          return;
        }
        setAd(result);
        if (!impressionFired.current) {
          impressionFired.current = true;
          fireImpression(result.id, path);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [siteId, path, isMobile]);

  if (isMobile || !ad || dismissed) return null;

  function dismiss() {
    if (!ad) return;
    sessionStorage.setItem(`sidebar-dismissed-${ad.id}`, "1");
    setDismissed(true);
  }

  async function handleClick() {
    if (!ad) return;
    const url = await fireClick(ad.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="hidden lg:block w-64 shrink-0">
      <div className="sticky top-6 bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--border)]">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--fg-subtle)]">
            Ad
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss ad"
            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[color:var(--fg)]/10 transition focus:outline-none"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={handleClick}
          className="block w-full text-left focus:outline-none hover:opacity-90 transition"
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
          <div className="px-3 py-3">
            {ad.headline && (
              <p className="text-sm font-semibold text-[color:var(--fg)] leading-snug">{ad.headline}</p>
            )}
            {ad.body && (
              <p className="text-xs text-[color:var(--fg-muted)] mt-1 leading-relaxed">{ad.body}</p>
            )}
            {ad.clickUrl && (
              <span className="mt-2 inline-block text-xs font-bold underline underline-offset-2 text-[color:var(--fg)]">
                Learn more
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
