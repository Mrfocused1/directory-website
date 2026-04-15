"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

/**
 * Shows a Gary Vee post at the top, then two reference cards (a
 * YouTube video + an article) animate in below as if Claude just
 * pulled them from related content.
 */
export default function ReferencesDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t <= 800) setStep(0);          // post shown
      else if (t <= 2200) setStep(1);    // "Claude reading…" flash
      else if (t <= 3200) setStep(2);    // youtube ref
      else if (t <= 4200) setStep(3);    // article ref
      else if (t <= 7000) setStep(3);    // hold
      else { t = 0; setStep(0); }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <DemoFrame accent="#92eedd">
      {/* Post card */}
      <div className="bg-white rounded-xl p-3 flex gap-3 items-center shadow-sm mb-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[color:var(--bd-maroon)] to-[color:var(--bd-purple)] shrink-0 flex items-center justify-center text-white text-xs font-bold">
          GV
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold text-[color:var(--bd-dark)]">
            @garyvee
          </div>
          <div className="text-[11px] text-[color:var(--bd-grey)] truncate">
            &ldquo;Patience beats hustle every single time&rdquo;
          </div>
        </div>
      </div>

      {/* Reading indicator */}
      <div className="flex items-center gap-2 mb-2 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)] bd-pulse-dot" />
        {step <= 1 ? "Finding related sources…" : "Found 2 references"}
      </div>

      {/* References */}
      <div className="flex-1 flex flex-col gap-2 justify-end">
        {/* YouTube */}
        <div
          className="bg-white rounded-xl p-2.5 flex gap-2.5 items-center shadow-sm"
          style={{
            opacity: step >= 2 ? 1 : 0,
            transform: step >= 2 ? "translateY(0)" : "translateY(8px)",
            transition: "all 0.4s cubic-bezier(0.2,0.9,0.4,1.2)",
          }}
        >
          <div className="w-8 h-8 rounded-md bg-red-500 shrink-0 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
              YouTube
            </div>
            <div className="text-[10px] font-medium text-[color:var(--bd-dark)] truncate">
              Gary Vaynerchuk — The Power of Patience (12:34)
            </div>
          </div>
        </div>

        {/* Article */}
        <div
          className="bg-white rounded-xl p-2.5 flex gap-2.5 items-center shadow-sm"
          style={{
            opacity: step >= 3 ? 1 : 0,
            transform: step >= 3 ? "translateY(0)" : "translateY(8px)",
            transition: "all 0.4s cubic-bezier(0.2,0.9,0.4,1.2) 0.1s",
          }}
        >
          <div className="w-8 h-8 rounded-md bg-[color:var(--bd-dark)] shrink-0 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8M8 17h5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
              Forbes
            </div>
            <div className="text-[10px] font-medium text-[color:var(--bd-dark)] truncate">
              Why Long-Term Thinking Wins in Business
            </div>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}
