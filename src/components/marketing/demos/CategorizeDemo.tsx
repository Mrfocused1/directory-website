"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import DemoFrame from "./DemoFrame";

// Catherine Talks — financial advisor niche
const POSTS: { title: string; cat: number }[] = [
  { title: "How to build a 6-month emergency fund", cat: 0 },
  { title: "Index funds vs individual stocks in 2026", cat: 1 },
  { title: "The debt payoff strategy that actually works", cat: 2 },
  { title: "Morning routine that keeps me disciplined", cat: 3 },
  { title: "Why I stopped timing the market", cat: 1 },
  { title: "Setting financial boundaries with family", cat: 3 },
  { title: "Credit score myths you need to stop believing", cat: 2 },
  { title: "Your first $10K — a step-by-step plan", cat: 0 },
];

const CATS = ["Saving", "Investing", "Debt", "Mindset"];

export default function CategorizeDemo() {
  const [sortedCount, setSortedCount] = useState(0);
  const [activeTab, setActiveTab] = useState(-1); // -1 = "All"

  useEffect(() => {
    let t = 0;
    const tick = () => {
      t += 100;
      if (t <= 500) {
        setSortedCount(0);
        setActiveTab(-1);
      } else if (t <= 500 + POSTS.length * 350) {
        const count = Math.min(POSTS.length, Math.floor((t - 500) / 350) + 1);
        setSortedCount(count);
        // Highlight the tab of the most recently sorted post
        if (count > 0) setActiveTab(POSTS[count - 1].cat);
      } else if (t <= 500 + POSTS.length * 350 + 2500) {
        setSortedCount(POSTS.length);
        setActiveTab(-1); // back to "All"
      } else {
        t = 0;
        setSortedCount(0);
        setActiveTab(-1);
      }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  const totalSorted = sortedCount;
  const countByCat = CATS.map(
    (_, c) => POSTS.slice(0, sortedCount).filter((p) => p.cat === c).length,
  );

  return (
    <DemoFrame accent="#ffc72d">
      {/* Current post being read */}
      <div className="bg-white rounded-xl p-2.5 mb-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-[color:var(--bd-lilac)] to-[color:var(--bd-purple)] flex items-center justify-center text-white text-[9px] font-bold shrink-0">
            CT
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

      {/* Category pill tabs — horizontal scrollable like the real directory */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 mb-3">
        {/* All tab */}
        <div
          className="relative shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-300"
          style={{
            backgroundColor: activeTab === -1 ? "var(--bd-dark)" : "rgba(0,0,0,0.05)",
            color: activeTab === -1 ? "white" : "var(--bd-grey)",
          }}
        >
          All
          <span className="ml-1 text-[8px] opacity-60">({totalSorted})</span>
        </div>

        {CATS.map((cat, i) => (
          <div
            key={cat}
            className="relative shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-300"
            style={{
              backgroundColor: activeTab === i ? "var(--bd-dark)" : "rgba(0,0,0,0.05)",
              color: activeTab === i ? "white" : "var(--bd-grey)",
            }}
          >
            {cat}
            <motion.span
              key={`${i}-${countByCat[i]}`}
              initial={{ scale: 1.4 }}
              animate={{ scale: 1 }}
              className="ml-1 text-[8px] opacity-60 inline-block"
            >
              ({countByCat[i]})
            </motion.span>
          </div>
        ))}
      </div>

      {/* Mini post list showing sorted posts */}
      <div className="flex-1 space-y-1.5 overflow-hidden">
        {POSTS.slice(0, Math.min(sortedCount, 4)).map((post, i) => (
          <motion.div
            key={post.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 shadow-sm"
          >
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor:
                  post.cat === 0 ? "var(--bd-lime)" :
                  post.cat === 1 ? "var(--bd-lilac)" :
                  post.cat === 2 ? "var(--bd-maroon)" : "#ffc72d",
              }}
            />
            <span className="text-[9px] text-[color:var(--bd-dark)] truncate flex-1">{post.title}</span>
            <span className="text-[7px] font-bold text-[color:var(--bd-grey)] shrink-0 uppercase">
              {CATS[post.cat]}
            </span>
          </motion.div>
        ))}
      </div>
    </DemoFrame>
  );
}
