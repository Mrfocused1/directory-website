"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Animated hero mockup — loops through a user journey:
 * 1. Grid of 6 cards with search bar
 * 2. User types "routine" → grid filters to 2 cards
 * 3. Card opens → video + title + references below (scrolls down to reveal)
 * 4. YouTube reference clicked → video snippet plays
 * 5. Loops back to step 1
 */

type Phase =
  | "grid"
  | "typing"
  | "filtered"
  | "detail"
  | "scrolled"
  | "youtube";

const CARDS = [
  { title: "Index Funds 101", cat: "INVESTING", color: "#b0b0fe" },
  { title: "Skincare Tips", cat: "BEAUTY", color: "#ff6b9d" },
  { title: "Budget Hacks", cat: "SAVING", color: "#92eedd" },
  { title: "Best Stocks 2026", cat: "INVESTING", color: "#d3fd74" },
  { title: "Side Hustles", cat: "INCOME", color: "#ffc72d" },
  { title: "Debt Payoff", cat: "DEBT", color: "#b0b0fe" },
];

const FILTERED = [CARDS[0], CARDS[3]];
const SEARCH_TEXT = "stocks";

const REFERENCES = [
  { type: "article", title: "How to Pick Your First Stocks in 2026", source: "investopedia.com" },
  { type: "youtube", title: "Index Funds vs Individual Stocks Explained", channel: "Bloomberg" },
  { type: "article", title: "The Best Stocks for Beginners to Buy", source: "nerdwallet.com" },
];

const PHASE_DURATIONS: Record<Phase, number> = {
  grid: 2000,
  typing: 2500,
  filtered: 2000,
  detail: 3000,
  scrolled: 2500,
  youtube: 3000,
};

const PHASE_ORDER: Phase[] = ["grid", "typing", "filtered", "detail", "scrolled", "youtube"];

export default function HeroDemo() {
  const [phase, setPhase] = useState<Phase>("grid");
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    const idx = PHASE_ORDER.indexOf(phase);
    const duration = PHASE_DURATIONS[phase];
    const timer = setTimeout(() => {
      const next = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
      setPhase(next);
      if (next === "grid") setTypedChars(0);
    }, duration);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    setTypedChars(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTypedChars(i);
      if (i >= SEARCH_TEXT.length) clearInterval(interval);
    }, 120);
    return () => clearInterval(interval);
  }, [phase]);

  const searchValue = phase === "typing" ? SEARCH_TEXT.slice(0, typedChars) : phase === "filtered" ? SEARCH_TEXT : "";
  const showGrid = phase === "grid" || phase === "typing" || phase === "filtered";
  const showDetail = phase === "detail" || phase === "scrolled";
  const cardsToShow = phase === "filtered" ? FILTERED : CARDS;

  return (
    <div className="relative w-full mt-8 lg:mt-0">
      <div className="h-[420px] sm:h-[480px] lg:h-[540px] bg-gradient-to-br from-[color:var(--bd-maroon)] via-[color:var(--bd-purple)] to-[color:var(--bd-dark)] rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-5 shadow-2xl overflow-hidden">
        <div className="h-full bg-[color:var(--bd-cream)] rounded-[1rem] sm:rounded-[1.5rem] overflow-hidden flex flex-col">
          {/* Browser bar */}
          <div className="flex items-center justify-between px-3 sm:px-4 pt-3 sm:pt-4 pb-2 shrink-0">
            <span className="text-[10px] sm:text-xs font-semibold text-[color:var(--bd-grey)]">
              buildmy.directory/you
            </span>
          </div>

          {/* Content area */}
          <div className="flex-1 px-3 sm:px-4 pb-3 sm:pb-4 overflow-hidden relative">
            {/* Animated cursor */}
            <AnimatePresence>
              {(phase === "filtered" || phase === "scrolled") && (
                <motion.div
                  key={`cursor-${phase}`}
                  className="absolute z-50 pointer-events-none"
                  initial={{ opacity: 0, x: "30%", y: "20%" }}
                  animate={{
                    opacity: 1,
                    x: phase === "filtered" ? "25%" : "50%",
                    y: phase === "filtered" ? "45%" : "75%",
                  }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                >
                  {/* Cursor SVG */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M5 3l14 8-6 2-3 7z" fill="#1a0a2e" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  {/* Click ripple */}
                  <motion.div
                    className="absolute top-2 left-2 w-4 h-4 rounded-full border-2 border-[color:var(--bd-lime)]"
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: 2.5, opacity: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {/* ── Grid view ── */}
              {showGrid && (
                <motion.div
                  key="grid-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col"
                >
                  <div className="bg-white rounded-lg px-3 py-2 flex items-center gap-2 mb-3 shadow-sm shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[color:var(--bd-grey)] shrink-0">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                    <span className="text-[10px] font-medium text-[color:var(--bd-dark)]">
                      {searchValue || <span className="text-[color:var(--bd-grey)]">Search posts…</span>}
                    </span>
                    {phase === "typing" && <span className="w-px h-3 bg-[color:var(--bd-dark)] animate-pulse" />}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2 auto-rows-min">
                    <AnimatePresence>
                      {cardsToShow.map((card, i) => (
                        <motion.div
                          key={card.title}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.25, delay: i * 0.05 }}
                          className={`rounded-lg relative overflow-hidden ${phase === "filtered" ? "aspect-[3/4]" : "aspect-square"}`}
                          style={{ backgroundColor: `${card.color}30` }}
                        >
                          {card.title === "Index Funds 101" ? (
                            <video
                              src="/hero-demo.mp4"
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : card.title === "Skincare Tips" ? (
                            <video
                              src="/hero-demo-beauty.mp4"
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : card.title === "Budget Hacks" ? (
                            <video
                              src="/hero-demo-fitness.mp4"
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : card.title === "Best Stocks 2026" ? (
                            <video
                              src="/hero-demo-fitness-new.mp4"
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <>
                              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${card.color}50, ${card.color}15)` }} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 rounded-full bg-white/70 flex items-center justify-center">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-[color:var(--bd-dark)] ml-0.5"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                              </div>
                            </>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* ── Detail view: video + title + references (scrollable) ── */}
              {showDetail && (
                <motion.div
                  key="detail-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col overflow-hidden"
                >
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[color:var(--bd-grey)]"><path d="M15 18l-6-6 6-6" /></svg>
                    <span className="text-[8px] text-[color:var(--bd-grey)] font-medium">Back</span>
                  </div>

                  {/* Scrollable content — shifts up to reveal references */}
                  <motion.div
                    className="flex flex-col gap-2"
                    animate={{ y: phase === "scrolled" ? -100 : 0 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    {/* Video */}
                    <div className="rounded-xl aspect-video relative overflow-hidden shrink-0 bg-black">
                      <video
                        src="/hero-demo.mp4"
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10">
                        <motion.div className="h-full bg-[color:var(--bd-lime)]" initial={{ width: "0%" }} animate={{ width: "65%" }} transition={{ duration: 2.5, ease: "linear" }} />
                      </div>
                    </div>

                    {/* Title + description */}
                    <div className="shrink-0">
                      <h4 className="text-[10px] font-bold text-[color:var(--bd-dark)] mb-0.5">Index Funds vs Individual Stocks</h4>
                      <p className="text-[7px] text-[color:var(--bd-grey)] leading-relaxed">
                        Which is better for beginners? Here&apos;s the honest breakdown of returns, risk, and fees.
                      </p>
                    </div>

                    {/* References section */}
                    <div className="shrink-0">
                      <div className="flex items-center gap-1.5 mb-2 mt-1">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--bd-dark)]"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                        <span className="text-[8px] font-bold text-[color:var(--bd-dark)]">References</span>
                        <span className="text-[6px] text-[color:var(--bd-grey)]">3 sources</span>
                      </div>
                      <div className="space-y-1.5">
                        {REFERENCES.map((ref, i) => (
                          <motion.div
                            key={ref.title}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.15, duration: 0.3 }}
                            className="bg-white rounded-lg p-2 shadow-sm flex items-center gap-2"
                          >
                            <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: ref.type === "youtube" ? "#ff000015" : "#b0b0fe15" }}>
                              {ref.type === "youtube" ? (
                                <svg width="7" height="7" viewBox="0 0 24 24" fill="#ff0000"><path d="M8 5v14l11-7z" /></svg>
                              ) : (
                                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[7px] font-bold text-[color:var(--bd-dark)] leading-tight truncate">{ref.title}</p>
                              <p className="text-[5px] text-[color:var(--bd-grey)]">{ref.type === "youtube" ? ref.channel : ref.source}</p>
                            </div>
                            {ref.type === "youtube" && phase === "scrolled" && (
                              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-3 h-3 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                                <svg width="5" height="5" viewBox="0 0 24 24" fill="#ef4444"><path d="M8 5v14l11-7z" /></svg>
                              </motion.div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* ── YouTube expanded view ── */}
              {phase === "youtube" && (
                <motion.div
                  key="yt-view"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col"
                >
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[color:var(--bd-grey)]"><path d="M15 18l-6-6 6-6" /></svg>
                    <span className="text-[8px] text-[color:var(--bd-grey)] font-medium">Back</span>
                  </div>

                  <div className="rounded-xl aspect-video relative overflow-hidden mb-3 bg-black shrink-0">
                    <video
                      src="/hero-demo-yt.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0">
                      <div className="h-0.5 bg-white/20">
                        <motion.div className="h-full bg-red-500" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 3, ease: "linear" }} />
                      </div>
                      <div className="flex items-center justify-between px-1.5 py-0.5 bg-gradient-to-t from-black/60">
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        <span className="text-[5px] text-white/80 font-mono">1:24 / 5:02</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#ef4444"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                    <div>
                      <h4 className="text-[9px] font-bold text-[color:var(--bd-dark)]">Index Funds vs Stocks Explained</h4>
                      <p className="text-[7px] text-[color:var(--bd-grey)]">Bloomberg · 3.4M views</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
