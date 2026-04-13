"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Step 1: Enter your handle ───────────────────────────────────────
export function DemoHandleInput() {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState(0);
  const full = "@creativemind";
  const platforms = ["instagram", "tiktok", "youtube"];
  const platformColors = ["text-pink-500", "text-black", "text-red-500"];

  useEffect(() => {
    let i = 0;
    let typing = true;
    const interval = setInterval(() => {
      if (typing) {
        i++;
        setText(full.slice(0, i));
        if (i >= full.length) {
          typing = false;
          setTimeout(() => {
            setPlatform((p) => (p + 1) % 3);
            i = 0;
            setText("");
            typing = true;
          }, 2000);
        }
      }
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[color:var(--border)] p-3 shadow-sm h-full overflow-hidden">
      {/* Platform tabs */}
      <div className="flex gap-1 mb-2">
        {platforms.map((p, idx) => (
          <div
            key={p}
            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full transition-all duration-300 ${
              platform === idx ? "bg-black text-white" : "bg-black/5 text-[color:var(--fg-muted)]"
            }`}
          >
            {p}
          </div>
        ))}
      </div>
      {/* Input */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-8 bg-black/[0.03] rounded-lg flex items-center px-2.5">
          <span className={`text-xs font-mono font-bold ${platformColors[platform]} transition-colors`}>
            {text}
          </span>
          <span className="w-px h-3.5 bg-black/60 animate-pulse ml-px" />
        </div>
        <div className={`h-8 px-3 rounded-lg text-[10px] font-bold text-white flex items-center transition-all duration-300 ${
          text.length >= full.length ? "bg-green-500 scale-105" : "bg-black/30"
        }`}>
          Go
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Pipeline animation ──────────────────────────────────────
export function DemoPipeline() {
  const [step, setStep] = useState(0);
  const steps = [
    { label: "Scraping posts", icon: "download", count: "24 posts found" },
    { label: "Transcribing videos", icon: "mic", count: "12 videos done" },
    { label: "Categorizing content", icon: "tag", count: "5 categories" },
    { label: "Finding references", icon: "search", count: "38 sources" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % (steps.length + 1));
    }, 1500);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="bg-white rounded-xl border border-[color:var(--border)] p-3 shadow-sm h-full overflow-hidden">
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const isDone = i < step;
          const isCurrent = i === step;
          return (
            <motion.div
              key={s.label}
              className="flex items-center gap-2 h-6"
              animate={{ opacity: i <= step ? 1 : 0.3 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                isDone ? "bg-green-500" : isCurrent ? "bg-black" : "bg-black/10"
              }`}>
                {isDone ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>
                ) : isCurrent ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                ) : null}
              </div>
              <span className={`text-[10px] font-semibold flex-1 ${isDone ? "text-green-600" : isCurrent ? "text-black" : "text-black/30"}`}>
                {s.label}
              </span>
              <span className={`text-[9px] font-bold min-w-[60px] text-right transition-opacity duration-300 ${isDone ? "text-green-600 opacity-100" : "opacity-0"}`}>
                {s.count}
              </span>
            </motion.div>
          );
        })}
      </div>
      {/* Progress bar */}
      <div className="mt-2 h-1 bg-black/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-black rounded-full"
          animate={{ width: `${Math.min((step / steps.length) * 100, 100)}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

// ─── Step 3: Directory grid appearing ────────────────────────────────
export function DemoDirectoryGrid() {
  const [visible, setVisible] = useState(0);
  const categories = ["BUSINESS", "ECONOMICS", "AFRICA", "POLITICS", "BUSINESS", "ECONOMICS"];
  const colors = ["bg-rose-100", "bg-sky-100", "bg-amber-100", "bg-violet-100", "bg-emerald-100", "bg-orange-100"];

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => (v >= 6 ? 0 : v + 1));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[color:var(--border)] p-3 shadow-sm h-full overflow-hidden">
      {/* Mini search bar */}
      <div className="h-5 bg-black/[0.03] rounded-full mb-2 flex items-center px-2">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-black/20">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <span className="text-[8px] text-black/20 ml-1">Search posts...</span>
      </div>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className={`aspect-[4/5] rounded-md relative overflow-hidden ${colors[i]}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: i < visible ? 1 : 0.1,
              scale: i < visible ? 1 : 0.8,
            }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <span className="absolute bottom-0.5 left-0.5 text-[5px] font-bold bg-white/80 px-1 rounded">
              {categories[i]}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4: Domain setup ────────────────────────────────────────────
export function DemoDomainSetup() {
  const [phase, setPhase] = useState(0);
  // 0: searching, 1: found, 2: configured

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[color:var(--border)] p-3 shadow-sm h-full overflow-hidden relative">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-3">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="h-6 flex-1 bg-black/[0.03] rounded-md flex items-center px-2">
                <span className="text-[9px] font-mono font-bold">www.mysite</span>
                <span className="w-px h-2.5 bg-black/60 animate-pulse ml-px" />
              </div>
              <div className="h-6 px-2 bg-purple-600 rounded-md text-[8px] text-white font-bold flex items-center">Search</div>
            </div>
            <div className="space-y-1">
              {[".com", ".co", ".io"].map((tld) => (
                <div key={tld} className="flex items-center justify-between h-5 px-1.5 rounded bg-black/[0.02]">
                  <span className="text-[8px] font-mono font-bold">mysite{tld}</span>
                  <span className="text-[8px] font-bold text-green-500">Available</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {phase === 1 && (
          <motion.div key="dns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-3">
            <p className="text-[9px] font-bold text-amber-600 mb-2">Adding DNS records...</p>
            {["CNAME", "A", "TXT"].map((type, i) => (
              <motion.div
                key={type}
                className="flex items-center gap-1.5 h-6 mb-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.3 }}
              >
                <span className="text-[7px] font-bold bg-amber-100 text-amber-700 px-1 rounded">{type}</span>
                <div className="flex-1 h-1 bg-amber-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ delay: i * 0.3 + 0.2, duration: 0.5 }}
                  />
                </div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.3 + 0.7 }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-500"><path d="M20 6L9 17l-5-5" /></svg>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-3 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-500 flex items-center justify-center mx-auto mb-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <p className="text-[10px] font-bold">mysite.com is live!</p>
              <p className="text-[8px] text-green-600 font-semibold mt-0.5">SSL secured</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Step 5: Email subscribers growing ───────────────────────────────
export function DemoEmailGrowth() {
  const [count, setCount] = useState(42);
  const [emails, setEmails] = useState<string[]>(["sarah@...", "kofi@..."]);
  const newEmails = ["amara@...", "james@...", "fatima@...", "chen@...", "ngozi@..."];

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      const email = newEmails[idx % newEmails.length];
      setEmails((prev) => [email, ...prev].slice(0, 3));
      setCount((c) => c + 1);
      idx++;
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[color:var(--border)] p-3 shadow-sm h-full overflow-hidden">
      {/* Counter */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold text-[color:var(--fg-subtle)] uppercase">Subscribers</span>
        <motion.span
          key={count}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-sm font-extrabold tabular-nums"
        >
          {count}
        </motion.span>
      </div>
      {/* Growth bar */}
      <div className="h-6 bg-black/[0.03] rounded-md mb-2 flex items-end px-0.5 gap-px">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 bg-black/80 rounded-t-sm"
            initial={{ height: 0 }}
            animate={{ height: `${20 + i * 5 + Math.sin(i) * 8}%` }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          />
        ))}
      </div>
      {/* New subscriber notifications — fixed 3 slots */}
      <div className="space-y-1">
        {emails.slice(0, 3).map((email, i) => (
          <motion.div
            key={`slot-${i}`}
            animate={{ opacity: i === 0 ? 1 : 0.35 }}
            className="flex items-center gap-1.5 h-4"
          >
            <div className="w-3.5 h-3.5 rounded-full bg-green-100 text-green-500 flex items-center justify-center shrink-0">
              <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <motion.span
              key={email}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[8px] text-[color:var(--fg-muted)] font-medium truncate"
            >
              {email} subscribed
            </motion.span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 6: Dashboard analytics ─────────────────────────────────────
export function DemoDashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ["Views", "Clicks", "Search"];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTab((t) => (t + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const chartData = [
    [30, 45, 35, 50, 65, 55, 70, 80, 60, 75],
    [20, 30, 25, 40, 35, 45, 50, 42, 55, 48],
    [10, 15, 20, 12, 25, 18, 30, 22, 28, 35],
  ];

  return (
    <div className="bg-white rounded-xl border border-[color:var(--border)] p-3 shadow-sm h-full overflow-hidden">
      {/* Mini stat cards */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        {[
          { label: "Views", value: "4.4K" },
          { label: "Clicks", value: "1.9K" },
          { label: "CTR", value: "43%" },
        ].map((s) => (
          <div key={s.label} className="bg-black/[0.03] rounded-md p-1.5 text-center">
            <p className="text-[10px] font-extrabold">{s.value}</p>
            <p className="text-[6px] text-[color:var(--fg-subtle)] font-semibold uppercase">{s.label}</p>
          </div>
        ))}
      </div>
      {/* Tab selector */}
      <div className="flex gap-1 mb-1.5">
        {tabs.map((t, i) => (
          <button
            key={t}
            type="button"
            className={`text-[7px] font-bold px-1.5 py-0.5 rounded transition-all ${
              activeTab === i ? "bg-black text-white" : "bg-black/5 text-black/40"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {/* Mini chart */}
      <div className="h-10 flex items-end gap-px">
        {chartData[activeTab].map((val, i) => (
          <motion.div
            key={`${activeTab}-${i}`}
            className="flex-1 bg-black/70 rounded-t-sm"
            initial={{ height: 0 }}
            animate={{ height: `${val}%` }}
            transition={{ duration: 0.4, delay: i * 0.03 }}
          />
        ))}
      </div>
    </div>
  );
}
