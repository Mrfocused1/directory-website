"use client";

import { useEffect, useState } from "react";
import DemoFrame from "./DemoFrame";

// Gary Vee-flavored mix. Each post sorts into one of 4 category tabs.
const POSTS: { title: string; cat: 0 | 1 | 2 | 3 }[] = [
  { title: "How to 10x your agency in 2026", cat: 0 },
  { title: "Tasting notes: 2019 Chablis", cat: 2 },
  { title: "The TikTok algorithm in one tweet", cat: 1 },
  { title: "My non-negotiable morning routine", cat: 3 },
  { title: "Why I'm bullish on long-form YouTube", cat: 1 },
  { title: "Raising sons who hustle without burnout", cat: 3 },
  { title: "Sauvignon Blanc vs Chardonnay", cat: 2 },
  { title: "Stop optimizing. Start shipping.", cat: 0 },
];

const CATS = [
  { label: "Entrepreneurship", color: "var(--bd-lime)" },
  { label: "Marketing", color: "var(--bd-lilac)" },
  { label: "Wine", color: "var(--bd-maroon)", light: true },
  { label: "Mindset", color: "#ffc72d" },
];

/**
 * Shows unclassified posts streaming through a "Claude reading…"
 * indicator, then appearing under niche-specific tabs. Counts update
 * as posts land. Loop: resets after holding end state.
 */
export default function CategorizeDemo() {
  const [sortedCount, setSortedCount] = useState(0);

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t <= 500) setSortedCount(0);
      else if (t <= 500 + POSTS.length * 350) {
        setSortedCount(Math.min(POSTS.length, Math.floor((t - 500) / 350) + 1));
      } else if (t <= 500 + POSTS.length * 350 + 2500) {
        setSortedCount(POSTS.length);
      } else { t = 0; setSortedCount(0); }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  const countByCat = [0, 1, 2, 3].map(
    (c) => POSTS.slice(0, sortedCount).filter((p) => p.cat === c).length,
  );

  return (
    <DemoFrame accent="#ffc72d">
      {/* Next post to sort */}
      <div className="bg-white rounded-xl p-2.5 mb-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-[color:var(--bd-maroon)] to-[color:var(--bd-purple)] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
            GV
          </div>
          <div className="text-[11px] font-medium text-[color:var(--bd-dark)] truncate flex-1">
            {sortedCount < POSTS.length
              ? POSTS[sortedCount].title
              : `All ${POSTS.length} posts categorized`}
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)] bd-pulse-dot shrink-0" />
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--bd-grey)] mt-1.5">
          {sortedCount < POSTS.length ? "Reading…" : "Done"}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex-1 grid grid-cols-2 gap-2">
        {CATS.map((cat, i) => (
          <div
            key={i}
            className="rounded-lg p-2.5 flex items-center justify-between transition-all"
            style={{
              backgroundColor: cat.color,
              color: cat.light ? "white" : "var(--bd-dark)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[8px] font-bold uppercase tracking-wide opacity-80">
                Category
              </div>
              <div className="text-[10px] font-bold leading-tight truncate">{cat.label}</div>
            </div>
            <div
              className="font-display-tight text-lg leading-none shrink-0"
              key={`${i}-${countByCat[i]}`}
            >
              <span className="bd-pop-in inline-block">{countByCat[i]}</span>
            </div>
          </div>
        ))}
      </div>
    </DemoFrame>
  );
}
