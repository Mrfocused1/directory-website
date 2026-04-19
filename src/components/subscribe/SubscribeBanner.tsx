"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  siteId: string;
  siteName: string;
  categories?: string[];
};

export default function SubscribeBanner({ siteId, siteName, categories = [] }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<"weekly" | "daily" | "monthly">("weekly");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [showPrefs, setShowPrefs] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === "submitting") return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          email,
          name: name || null,
          categories: selectedCategories.length > 0 ? selectedCategories : [],
          frequency,
        }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="bg-white border-2 border-[color:var(--fg)] rounded-2xl p-5 sm:p-8 text-center">
      <AnimatePresence mode="wait">
        {status === "success" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-4"
          >
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-1">You&apos;re subscribed!</h3>
            <p className="text-sm text-[color:var(--fg-muted)]">
              You&apos;ll get a {frequency} digest of new content from {siteName}.
            </p>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <h3 className="text-lg sm:text-xl font-extrabold tracking-tight mb-1">
              Stay in the loop
            </h3>
            <p className="text-sm text-[color:var(--fg-muted)] mb-5 max-w-md mx-auto">
              Get notified when new content is added to {siteName}. No spam, unsubscribe anytime.
            </p>

            <form onSubmit={handleSubmit} className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  aria-label="Email address"
                  className="flex-1 w-full appearance-none h-12 px-5 bg-white border border-[color:var(--border)] rounded-full text-base font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                />
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="h-12 px-6 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-full text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap"
                >
                  {status === "submitting" ? "Subscribing..." : "Subscribe"}
                </button>
              </div>

              {/* Preferences toggle */}
              <button
                type="button"
                onClick={() => setShowPrefs(!showPrefs)}
                className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
              >
                {showPrefs ? "Hide preferences" : "Customize preferences"}
              </button>

              <AnimatePresence>
                {showPrefs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-4 text-left">
                      {/* Name */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Your name <span className="font-normal text-[color:var(--fg-subtle)]">(optional)</span></label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="First name"
                          className="w-full h-10 px-3 bg-white border border-[color:var(--border)] rounded-lg text-sm placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                        />
                      </div>

                      {/* Categories */}
                      {categories.length > 0 && (
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block">
                            Topics <span className="font-normal text-[color:var(--fg-subtle)]">(leave empty for all)</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {categories.map((cat) => {
                              const isSelected = selectedCategories.includes(cat);
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => toggleCategory(cat)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                                    isSelected
                                      ? "bg-[color:var(--fg)] text-[color:var(--bg)] border-[color:var(--fg)]"
                                      : "bg-white text-[color:var(--fg-muted)] border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
                                  }`}
                                >
                                  {cat}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Frequency */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Frequency</label>
                        <div className="flex gap-2">
                          {(["daily", "weekly", "monthly"] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setFrequency(f)}
                              className={`flex-1 h-10 rounded-lg text-xs font-semibold border transition capitalize ${
                                frequency === f
                                  ? "bg-[color:var(--fg)] text-[color:var(--bg)] border-[color:var(--fg)]"
                                  : "bg-white text-[color:var(--fg-muted)] border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
                              }`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {status === "error" && (
                <p className="text-xs text-red-600 font-semibold mt-2">Something went wrong. Please try again.</p>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
