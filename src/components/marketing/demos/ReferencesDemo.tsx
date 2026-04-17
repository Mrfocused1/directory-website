"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

const REFS = [
  { type: "youtube", source: "YouTube", title: "The Pay Yourself First Rule Explained (8:12)", color: "bg-red-500" },
  { type: "article", source: "Investopedia", title: "How Automating Savings Builds Wealth Faster", color: "bg-[color:var(--bd-dark)]" },
  { type: "youtube", source: "YouTube", title: "How to Budget Using the 65/25/10 Rule (12:34)", color: "bg-red-500" },
  { type: "article", source: "NerdWallet", title: "Pay Yourself First: What It Means and How to Do It", color: "bg-[color:var(--bd-purple)]" },
  { type: "article", source: "Forbes", title: "Why Automation Is the Key to Building Wealth", color: "bg-[color:var(--bd-dark)]" },
];

export default function ReferencesDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t <= 800) setStep(0);
      else if (t <= 2200) setStep(1);
      else if (t <= 2800) setStep(2);
      else if (t <= 3400) setStep(3);
      else if (t <= 4000) setStep(4);
      else if (t <= 4600) setStep(5);
      else if (t <= 5200) setStep(6);
      else if (t <= 8000) setStep(6);
      else { t = 0; setStep(0); }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  const visibleCount = Math.max(0, step - 1);

  return (
    <DemoFrame accent="#92eedd">
      {/* Post card */}
      <div className="bg-white rounded-xl p-2.5 flex gap-2.5 items-center shadow-sm mb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[color:var(--bd-lilac)] to-[color:var(--bd-purple)] shrink-0 flex items-center justify-center text-white text-[9px] font-bold">
          CT
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-semibold text-[color:var(--bd-dark)]">
            @catherinetalks
          </div>
          <div className="text-[10px] text-[color:var(--bd-grey)] truncate">
            &ldquo;Pay yourself first — before rent, before bills&rdquo;
          </div>
        </div>
      </div>

      {/* Reading indicator */}
      <div className="flex items-center gap-2 mb-2 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)] bd-pulse-dot" />
        {step <= 1
          ? "Finding related sources…"
          : `Found ${visibleCount} reference${visibleCount === 1 ? "" : "s"}`}
      </div>

      {/* References */}
      <div className="flex-1 flex flex-col gap-1.5 justify-start overflow-hidden">
        {REFS.map((ref, i) => (
          <div
            key={i}
            className="bg-white rounded-lg p-2 flex gap-2 items-center shadow-sm"
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transform: i < visibleCount ? "translateY(0)" : "translateY(8px)",
              transition: `all 0.4s cubic-bezier(0.2,0.9,0.4,1.2) ${i * 0.05}s`,
            }}
          >
            <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${ref.color}`}>
              {ref.type === "youtube" ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[8px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)]">
                {ref.source}
              </div>
              <div className="text-[9px] font-medium text-[color:var(--bd-dark)] truncate">
                {ref.title}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DemoFrame>
  );
}
