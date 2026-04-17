"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

// Catherine Talks — financial advisor niche
const WORDS = [
  "The",
  "number",
  "one",
  "rule",
  "of",
  "building",
  "wealth",
  "is",
  "paying",
  "yourself",
  "first.",
  "Before",
  "rent,",
  "before",
  "bills,",
  "automate",
  "that",
  "transfer.",
];

export default function TranscriptionDemo() {
  const [wordIdx, setWordIdx] = useState(0);
  const [showPill, setShowPill] = useState(false);

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t > 800 && t <= 800 + WORDS.length * 260) {
        setWordIdx(Math.min(WORDS.length, Math.floor((t - 800) / 260) + 1));
      } else if (t > 800 + WORDS.length * 260 && t <= 800 + WORDS.length * 260 + 1800) {
        setShowPill(true);
      } else if (t > 800 + WORDS.length * 260 + 1800) {
        t = 0;
        setWordIdx(0);
        setShowPill(false);
      }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <DemoFrame accent="#b0b0fe">
      <div className="flex gap-3 h-full">
        {/* Left: "video" with audio wave */}
        <div className="w-[42%] bg-[color:var(--bd-dark)] rounded-xl relative overflow-hidden flex flex-col justify-between p-3">
          <div className="flex items-center gap-1.5 text-white/70 text-[9px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            LIVE
          </div>
          <div className="flex items-center justify-center gap-0.5 h-10">
            {[0.1, 0.25, 0.4, 0.55, 0.1, 0.35, 0.5, 0.2, 0.45, 0.3, 0.15, 0.4, 0.25].map((_, i) => (
              <span
                key={i}
                className="bd-wave-bar w-[3px] h-6 rounded-full bg-[color:var(--bd-lilac)]"
                style={{ animationDelay: `${i * 0.07}s` }}
              />
            ))}
          </div>
          <div className="text-[8px] text-white/50 font-medium">
            @catherinetalks • Reel • 0:08 / 0:30
          </div>
        </div>

        {/* Right: transcript column */}
        <div className="flex-1 bg-white rounded-xl p-3 flex flex-col min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)] mb-2 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
            </svg>
            Transcript
          </div>
          <p className="text-[11px] sm:text-xs leading-relaxed text-[color:var(--bd-dark)] flex-1">
            {WORDS.slice(0, wordIdx).map((w, i) => (
              <span key={i} className="bd-slide-right inline-block mr-1">
                {w}
              </span>
            ))}
            {wordIdx < WORDS.length && <span className="bd-caret text-[color:var(--bd-grey)]">|</span>}
          </p>
          {showPill && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 self-start bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] px-2 py-1 rounded-full text-[9px] font-bold bd-pop-in"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              Searchable • {WORDS.length} words indexed
            </div>
          )}
        </div>
      </div>
    </DemoFrame>
  );
}
