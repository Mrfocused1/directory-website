"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

const HANDLE = "@garyvee";
const TILES = [
  { bg: "var(--bd-maroon)", label: "Wine tasting" },
  { bg: "var(--bd-lilac)", label: "Marketing tip" },
  { bg: "var(--bd-lime)", label: "NYC speech" },
  { bg: "var(--bd-green)", label: "Patience > hustle" },
  { bg: "var(--bd-purple)", label: "Trash talk" },
  { bg: "var(--bd-cream-2)", label: "Q&A reel", dark: true },
];

/**
 * Looped demo — types @garyvee into a fake Instagram input, then
 * fills a 3×2 grid tile-by-tile as if "scraping" posts.
 * Loop: ~10 seconds. Reduced-motion users see the fully-filled end
 * state without animation.
 */
export default function AutoScrapeDemo() {
  const [typed, setTyped] = useState(0);
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      // 0–800ms: typing @garyvee (8 chars)
      if (t <= 800) {
        setTyped(Math.min(HANDLE.length, Math.floor(t / 100)));
      } else if (t > 800 && t <= 1400) {
        setTyped(HANDLE.length);
        setFilled(0);
      }
      // 1400–4400ms: fill tiles (500ms per tile)
      else if (t > 1400 && t <= 4400) {
        setFilled(Math.min(TILES.length, Math.floor((t - 1400) / 500) + 1));
      } else if (t > 4400 && t <= 9000) {
        setFilled(TILES.length); // hold
      } else {
        t = 0; setTyped(0); setFilled(0);
      }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <DemoFrame accent="#d3fd74">
      {/* Handle input */}
      <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3 shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--bd-grey)] shrink-0">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
        <span className="text-xs font-semibold text-[color:var(--bd-grey)] mr-1">Instagram</span>
        <span className="text-sm font-medium text-[color:var(--bd-dark)] tracking-tight">
          {HANDLE.slice(0, typed)}
          {typed < HANDLE.length && <span className="bd-caret">|</span>}
        </span>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 mb-3 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)] bd-pulse-dot" />
        {filled === 0
          ? "Connecting…"
          : filled < TILES.length
          ? `Pulling posts… ${filled}/${TILES.length}`
          : `${TILES.length} posts found`}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-3 gap-2">
        {TILES.map((tile, i) => {
          const visible = i < filled;
          return (
            <div
              key={i}
              className="rounded-lg overflow-hidden relative flex items-end p-1.5 text-[8px] font-semibold"
              style={{
                background: visible ? tile.bg : "rgba(0,0,0,0.05)",
                color: visible ? (tile.dark ? "var(--bd-dark)" : "white") : "transparent",
                animation: visible ? `bd-pop-in 0.45s ${i * 0.05}s cubic-bezier(0.2,0.9,0.4,1.2) both` : undefined,
              }}
            >
              <span className="relative truncate drop-shadow-sm">{tile.label}</span>
            </div>
          );
        })}
      </div>
    </DemoFrame>
  );
}
