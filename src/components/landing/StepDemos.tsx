"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Step 1: Enter your handle ───────────────────────────────────────
export function DemoHandleInput() {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState(0);
  const full = "@creativemind";
  const platforms = ["instagram"];
  const platformColors = ["#e1306c", "#1a0a2e"];

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
            setPlatform(0);
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
    <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 h-full overflow-hidden">
      <div className="flex gap-1.5 mb-3">
        {platforms.map((p, idx) => (
          <div
            key={p}
            className="text-[9px] font-bold uppercase px-2.5 py-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: platform === idx ? platformColors[idx] : "#f3f3f5",
              color: platform === idx ? "#fff" : "#9a9a9a",
            }}
          >
            {p}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 bg-[#f6f6f8] rounded-xl flex items-center px-3 border border-[#e8e8ec]">
          <span
            className="text-xs font-mono font-bold transition-colors"
            style={{ color: platformColors[platform] }}
          >
            {text}
          </span>
          <span className="w-px h-4 bg-[#1a0a2e]/60 animate-pulse ml-px" />
        </div>
        <div
          className="h-9 px-4 rounded-xl text-[10px] font-bold flex items-center transition-all duration-300"
          style={{
            backgroundColor: text.length >= full.length ? "#d3fd74" : "#f3f3f5",
            color: text.length >= full.length ? "#1a0a2e" : "#aaa",
            transform: text.length >= full.length ? "scale(1.05)" : "scale(1)",
          }}
        >
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
    { label: "Scraping posts", count: "24 posts found", accent: "#7c3aed" },
    { label: "Transcribing videos", count: "12 videos done", accent: "#6366f1" },
    { label: "Categorizing content", count: "5 categories", accent: "#d97706" },
    { label: "Finding references", count: "38 sources", accent: "#059669" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % (steps.length + 1));
    }, 1500);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 h-full overflow-hidden">
      <div className="space-y-2">
        {steps.map((s, i) => {
          const isDone = i < step;
          const isCurrent = i === step;
          return (
            <motion.div
              key={s.label}
              className="flex items-center gap-2.5 h-7"
              animate={{ opacity: i <= step ? 1 : 0 }}
              style={{ visibility: i <= step ? "visible" : "hidden" }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  backgroundColor: isDone ? "#d3fd74" : isCurrent ? s.accent : "#f3f3f5",
                }}
              >
                {isDone ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1a0a2e" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>
                ) : isCurrent ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                ) : null}
              </div>
              <span className={`text-[10px] font-semibold flex-1 ${isDone ? "text-[#1a0a2e]" : isCurrent ? "text-[#1a0a2e]/80" : "text-[#1a0a2e]/30"}`}>
                {s.label}
              </span>
              <span
                className="text-[9px] font-bold min-w-[65px] text-right transition-opacity duration-300"
                style={{ color: s.accent, opacity: isDone ? 1 : 0 }}
              >
                {s.count}
              </span>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 bg-[#f3f3f5] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #7c3aed, #d3fd74)" }}
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
  const cardColors = ["#f3eeff", "#edffd6", "#e8fdf6", "#fff6de", "#ffe8f0", "#eef0ff"];
  const badgeColors = ["#7c3aed", "#4d7c0f", "#059669", "#d97706", "#e1306c", "#6366f1"];

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => (v >= 6 ? 0 : v + 1));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 h-full overflow-hidden">
      <div className="h-6 bg-[#f6f6f8] rounded-full mb-3 flex items-center px-2.5 border border-[#e8e8ec]">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#999]">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <span className="text-[8px] text-[#999] ml-1.5 font-medium">Search posts...</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className="aspect-[4/5] rounded-lg relative overflow-hidden"
            initial={{ scale: 0.6 }}
            animate={{ scale: i < visible ? 1 : 0.6 }}
            style={{ visibility: i < visible ? "visible" : "hidden", backgroundColor: cardColors[i] }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <span
              className="absolute bottom-1 left-1 text-[5px] font-bold px-1 py-0.5 rounded text-white"
              style={{ backgroundColor: badgeColors[i] }}
            >
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

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 h-full overflow-hidden relative">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 flex-1 bg-[#f6f6f8] rounded-lg flex items-center px-2.5 border border-[#e8e8ec]">
                <span className="text-[9px] font-mono font-bold text-[#1a0a2e]">yourdomain.com</span>
              </div>
              <div className="h-7 px-3 rounded-lg text-[8px] font-bold flex items-center bg-[#7c3aed] text-white">
                Connect
              </div>
            </div>
            <div className="space-y-1.5">
              {["CNAME", "A", "TXT"].map((type) => (
                <div key={type} className="flex items-center gap-2 h-5">
                  <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-[#7c3aed]/10 text-[#7c3aed]">{type}</span>
                  <span className="text-[7px] text-[#999] font-mono flex-1 truncate">cname.vercel-dns.com</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {phase === 1 && (
          <motion.div key="dns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-4">
            <p className="text-[9px] font-bold text-[#d97706] mb-3">Verifying DNS records...</p>
            {["CNAME", "A", "TXT"].map((type, i) => (
              <motion.div
                key={type}
                className="flex items-center gap-2 h-7 mb-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.3 }}
              >
                <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-[#fef3c7] text-[#d97706]">{type}</span>
                <div className="flex-1 h-1 bg-[#f3f3f5] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#d97706] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ delay: i * 0.3 + 0.2, duration: 0.5 }}
                  />
                </div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.3 + 0.7 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-4 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#d3fd74]/30 flex items-center justify-center mx-auto mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <p className="text-[11px] font-bold text-[#1a0a2e]">yourdomain.com is live!</p>
              <p className="text-[8px] font-semibold text-[#059669] mt-0.5">SSL secured</p>
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
    <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 h-full overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider">Subscribers</span>
        <motion.span
          key={count}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-sm font-extrabold tabular-nums text-[#7c3aed]"
        >
          {count}
        </motion.span>
      </div>
      <div className="h-8 bg-[#f6f6f8] rounded-lg mb-3 flex items-end px-1 gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{ background: "linear-gradient(180deg, #7c3aed, #d3fd74)" }}
            initial={{ height: 0 }}
            animate={{ height: `${20 + i * 5 + Math.sin(i) * 8}%` }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        {emails.slice(0, 3).map((email, i) => (
          <motion.div
            key={`slot-${i}`}
            animate={{ opacity: i === 0 ? 1 : 0 }}
            style={{ visibility: i === 0 ? "visible" : "hidden" }}
            className="flex items-center gap-2 h-5"
          >
            <div className="w-4 h-4 rounded-full bg-[#d3fd74]/40 flex items-center justify-center shrink-0">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <motion.span
              key={email}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[8px] text-[#1a0a2e]/60 font-medium truncate"
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
  const tabColors = ["#7c3aed", "#059669", "#d97706"];

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
    <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 h-full overflow-hidden">
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          { label: "Views", value: "4.4K", color: "#7c3aed" },
          { label: "Clicks", value: "1.9K", color: "#059669" },
          { label: "CTR", value: "43%", color: "#d97706" },
        ].map((s) => (
          <div key={s.label} className="bg-[#f6f6f8] rounded-lg p-2 text-center">
            <p className="text-[11px] font-extrabold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[6px] text-[#999] font-semibold uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 mb-2" aria-hidden>
        {tabs.map((t, i) => (
          <span
            key={t}
            className="text-[7px] font-bold px-2 py-0.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: activeTab === i ? tabColors[i] : "#f3f3f5",
              color: activeTab === i ? "#fff" : "#999",
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="h-12 flex items-end gap-0.5">
        {chartData[activeTab].map((val, i) => (
          <motion.div
            key={`${activeTab}-${i}`}
            className="flex-1 rounded-t-sm"
            style={{ backgroundColor: tabColors[activeTab] }}
            initial={{ height: 0 }}
            animate={{ height: `${val}%` }}
            transition={{ duration: 0.4, delay: i * 0.03 }}
          />
        ))}
      </div>
    </div>
  );
}
