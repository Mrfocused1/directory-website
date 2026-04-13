"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function FloatingSubscribe({
  siteId,
}: {
  siteId: string;
}) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  useEffect(() => {
    // Show after 30s or 60% scroll
    const alreadySubscribed = sessionStorage.getItem(`bmd_subscribed_${siteId}`);
    if (alreadySubscribed) return;

    const timer = setTimeout(() => setVisible(true), 30000);

    const onScroll = () => {
      const scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPct > 0.6) setVisible(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [siteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, email }),
      });
      if (res.ok) {
        setStatus("success");
        sessionStorage.setItem(`bmd_subscribed_${siteId}`, "true");
        setTimeout(() => setDismissed(true), 3000);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  };

  if (dismissed || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-40 bg-white border-2 border-[color:var(--fg)] rounded-2xl shadow-2xl shadow-black/10 p-4"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {status === "success" ? (
          <div className="flex items-center gap-3 pr-6">
            <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold">Subscribed!</p>
              <p className="text-xs text-[color:var(--fg-muted)]">Weekly digest coming your way.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3 pr-6">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold">Get the weekly digest</p>
                <p className="text-xs text-[color:var(--fg-muted)]">New posts delivered to your inbox.</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                aria-label="Email address"
                className="flex-1 h-10 px-3 bg-white border border-[color:var(--border)] rounded-lg text-sm placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
              />
              <button
                type="submit"
                disabled={status === "submitting"}
                className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap"
              >
                {status === "submitting" ? "..." : "Subscribe"}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
