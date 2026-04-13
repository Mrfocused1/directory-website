"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBookmarks } from "./BookmarkProvider";

export default function SignInModal() {
  const { showSignIn, setShowSignIn, signIn } = useBookmarks();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), name.trim() || undefined);
      setEmail("");
      setName("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {showSignIn && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowSignIn(false)}
        >
          <motion.div
            className="relative w-full sm:max-w-md bg-[color:var(--bg)] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile */}
            <div className="sm:hidden pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-[color:var(--fg)]/20" />
            </div>

            <div className="p-6">
              <button
                type="button"
                onClick={() => setShowSignIn(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>

              <div className="w-14 h-14 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
              </div>

              <h2 className="text-xl font-extrabold tracking-tight text-center mb-1">
                Save to your collection
              </h2>
              <p className="text-sm text-[color:var(--fg-muted)] text-center mb-6">
                Enter your email to save posts and create collections. No password needed.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label htmlFor="signin-email" className="text-xs font-semibold mb-1.5 block">Email</label>
                  <input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    autoFocus
                    className="w-full h-12 px-4 bg-white border border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                </div>
                <div>
                  <label htmlFor="signin-name" className="text-xs font-semibold mb-1.5 block">
                    Name <span className="font-normal text-[color:var(--fg-subtle)]">(optional)</span>
                  </label>
                  <input
                    id="signin-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full h-12 px-4 bg-white border border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="w-full h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
                >
                  {isSubmitting ? "Signing in..." : "Continue"}
                </button>
              </form>

              <p className="text-[11px] text-[color:var(--fg-subtle)] text-center mt-4">
                We only use your email to save your collections. No spam.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
