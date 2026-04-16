"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Step 1: Enter your handle ───────────────────────────────────────
export function DemoHandleInput() {
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState(0);
  const full = "@creativemind";
  const platforms = ["instagram", "tiktok", "youtube"];
  const platformAccents = ["#ff6b9d", "#d3fd74", "#ff4444"];

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
    <div className="bg-[color:var(--bd-dark)] rounded-2xl p-4 h-full overflow-hidden border border-white/[0.06]">
      <div className="flex gap-1.5 mb-3">
        {platforms.map((p, idx) => (
          <div
            key={p}
            className="text-[9px] font-bold uppercase px-2.5 py-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: platform === idx ? platformAccents[idx] : "rgba(255,255,255,0.06)",
              color: platform === idx ? "#1a0a2e" : "rgba(255,255,255,0.4)",
            }}
          >
            {p}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 bg-white/[0.06] rounded-xl flex items-center px-3 border border-white/[0.08]">
          <span
            className="text-xs font-mono font-bold transition-colors"
            style={{ color: platformAccents[platform] }}
          >
            {text}
          </span>
          <span className="w-px h-4 bg-white/60 animate-pulse ml-px" />
        </div>
        <div
          className="h-9 px-4 rounded-xl text-[10px] font-bold flex items-center transition-all duration-300"
          style={{
            backgroundColor: text.length >= full.length ? "#d3fd74" : "rgba(255,255,255,0.1)",
            color: text.length >= full.length ? "#1a0a2e" : "rgba(255,255,255,0.5)",
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
    { label: "Scraping posts", count: "24 posts found", accent: "#d3fd74" },
    { label: "Transcribing videos", count: "12 videos done", accent: "#b0b0fe" },
    { label: "Categorizing content", count: "5 categories", accent: "#ffc72d" },
    { label: "Finding references", count: "38 sources", accent: "#92eedd" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % (steps.length + 1));
    }, 1500);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="bg-[color:var(--bd-dark)] rounded-2xl p-4 h-full overflow-hidden border border-white/[0.06]">
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
                  backgroundColor: isDone ? s.accent : isCurrent ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
                }}
              >
                {isDone ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1a0a2e" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>
                ) : isCurrent ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                ) : null}
              </div>
              <span className={`text-[10px] font-semibold flex-1 ${isDone ? "text-white/90" : isCurrent ? "text-white/70" : "text-white/30"}`}>
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
      <div className="mt-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #b0b0fe, #d3fd74)" }}
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
  const colors = ["#d3fd74", "#b0b0fe", "#92eedd", "#ffc72d", "#ff6b9d", "#b0b0fe"];

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => (v >= 6 ? 0 : v + 1));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[color:var(--bd-dark)] rounded-2xl p-4 h-full overflow-hidden border border-white/[0.06]">
      <div className="h-6 bg-white/[0.06] rounded-full mb-3 flex items-center px-2.5 border border-white/[0.06]">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/40">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <span className="text-[8px] text-white/40 ml-1.5 font-medium">Search posts...</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className="aspect-[4/5] rounded-lg relative overflow-hidden"
            initial={{ scale: 0.6 }}
            animate={{ scale: i < visible ? 1 : 0.6 }}
            style={{ visibility: i < visible ? "visible" : "hidden", backgroundColor: `${colors[i]}15` }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <div
              className="absolute inset-0 opacity-30"
              style={{ background: `linear-gradient(135deg, ${colors[i]}40, transparent)` }}
            />
            <span
              className="absolute bottom-1 left-1 text-[5px] font-bold px-1 py-0.5 rounded"
              style={{ backgroundColor: colors[i], color: "#1a0a2e" }}
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
    <div className="bg-[color:var(--bd-dark)] rounded-2xl p-4 h-full overflow-hidden relative border border-white/[0.06]">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 flex-1 bg-white/[0.06] rounded-lg flex items-center px-2.5 border border-white/[0.06]">
                <span className="text-[9px] font-mono font-bold text-white/80">yourdomain.com</span>
              </div>
              <div className="h-7 px-3 rounded-lg text-[8px] font-bold flex items-center" style={{ backgroundColor: "#b0b0fe", color: "#1a0a2e" }}>
                Connect
              </div>
            </div>
            <div className="space-y-1.5">
              {["CNAME", "A", "TXT"].map((type) => (
                <div key={type} className="flex items-center gap-2 h-5">
                  <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(176,176,254,0.15)", color: "#b0b0fe" }}>{type}</span>
                  <span className="text-[7px] text-white/40 font-mono flex-1 truncate">cname.vercel-dns.com</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {phase === 1 && (
          <motion.div key="dns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-4">
            <p className="text-[9px] font-bold mb-3" style={{ color: "#ffc72d" }}>Verifying DNS records...</p>
            {["CNAME", "A", "TXT"].map((type, i) => (
              <motion.div
                key={type}
                className="flex items-center gap-2 h-7 mb-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.3 }}
              >
                <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,199,45,0.15)", color: "#ffc72d" }}>{type}</span>
                <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: "#ffc72d" }}
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ delay: i * 0.3 + 0.2, duration: 0.5 }}
                  />
                </div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.3 + 0.7 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#d3fd74" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-4 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: "rgba(211,253,116,0.15)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d3fd74" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <p className="text-[11px] font-bold text-white">yourdomain.com is live!</p>
              <p className="text-[8px] font-semibold mt-0.5" style={{ color: "#d3fd74" }}>SSL secured</p>
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
    <div className="bg-[color:var(--bd-dark)] rounded-2xl p-4 h-full overflow-hidden border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Subscribers</span>
        <motion.span
          key={count}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-sm font-extrabold tabular-nums"
          style={{ color: "#d3fd74" }}
        >
          {count}
        </motion.span>
      </div>
      <div className="h-8 bg-white/[0.04] rounded-lg mb-3 flex items-end px-1 gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{ background: `linear-gradient(180deg, #d3fd74, #b0b0fe)` }}
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
            <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(211,253,116,0.15)" }}>
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#d3fd74" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <motion.span
              key={email}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[8px] text-white/60 font-medium truncate"
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
  const tabAccents = ["#d3fd74", "#b0b0fe", "#ffc72d"];

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
    <div className="bg-[color:var(--bd-dark)] rounded-2xl p-4 h-full overflow-hidden border border-white/[0.06]">
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          { label: "Views", value: "4.4K", accent: "#d3fd74" },
          { label: "Clicks", value: "1.9K", accent: "#b0b0fe" },
          { label: "CTR", value: "43%", accent: "#ffc72d" },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.04] rounded-lg p-2 text-center">
            <p className="text-[11px] font-extrabold" style={{ color: s.accent }}>{s.value}</p>
            <p className="text-[6px] text-white/30 font-semibold uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 mb-2" aria-hidden>
        {tabs.map((t, i) => (
          <span
            key={t}
            className="text-[7px] font-bold px-2 py-0.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: activeTab === i ? tabAccents[i] : "rgba(255,255,255,0.06)",
              color: activeTab === i ? "#1a0a2e" : "rgba(255,255,255,0.4)",
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
            style={{ backgroundColor: tabAccents[activeTab] }}
            initial={{ height: 0 }}
            animate={{ height: `${val}%` }}
            transition={{ duration: 0.4, delay: i * 0.03 }}
          />
        ))}
      </div>
    </div>
  );
}
