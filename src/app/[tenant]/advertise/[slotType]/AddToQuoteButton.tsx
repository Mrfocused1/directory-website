"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

type Props = {
  siteSlug: string;
  slotType: string;
  slotName: string;
};

/**
 * Client-side toggle that lives on the slot detail page.
 *
 * Clicking doesn't navigate away — it mutates a localStorage-backed
 * selection shared with the AdvertiseSelector on /:slug/advertise.
 * When the advertiser goes back to the main page, the chosen
 * format is already ticked in their quote request. Navigating away
 * would leak their selection on every click — confetti + in-place
 * "Added" feedback keeps them on the preview.
 */
export default function AddToQuoteButton({ siteSlug, slotType, slotName }: Props) {
  const storageKey = `bmd:quote:${siteSlug}`;
  const [added, setAdded] = useState(false);

  // Read initial state from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const list: string[] = JSON.parse(raw);
      if (Array.isArray(list) && list.includes(slotType)) setAdded(true);
    } catch {
      // ignore malformed localStorage
    }
  }, [storageKey, slotType]);

  function fireConfetti() {
    const duration = 900;
    const end = Date.now() + duration;
    const colors = ["#d3fd74", "#a855f7", "#1a0a2e", "#ffffff"];
    (function frame() {
      confetti({
        particleCount: 3,
        startVelocity: 42,
        spread: 70,
        origin: { x: 0.5, y: 0.75 },
        colors,
        gravity: 0.9,
        scalar: 0.9,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  function toggle() {
    let list: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }

    if (added) {
      list = list.filter((s) => s !== slotType);
      localStorage.setItem(storageKey, JSON.stringify(list));
      setAdded(false);
      return;
    }

    if (!list.includes(slotType)) list.push(slotType);
    localStorage.setItem(storageKey, JSON.stringify(list));
    setAdded(true);
    fireConfetti();
  }

  return (
    <div className="text-center flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={added}
        className={
          "inline-flex items-center gap-2 h-11 px-6 text-sm font-semibold rounded-full transition " +
          (added
            ? "bg-[#d3fd74] text-[#1a0a2e] hover:opacity-90"
            : "bg-[#1a0a2e] text-white hover:opacity-90")
        }
      >
        {added ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Added to your quote
          </>
        ) : (
          <>Add this format to my quote request</>
        )}
      </button>
      {added && (
        <a
          href={`/${siteSlug}/advertise#quote-form`}
          className="inline-flex items-center gap-2 h-11 px-6 bg-white border-2 border-[#1a0a2e] text-[#1a0a2e] text-sm font-semibold rounded-full hover:bg-[#1a0a2e] hover:text-white transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to advertising page
        </a>
      )}
    </div>
  );
}
