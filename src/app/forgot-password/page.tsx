"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/brand/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // Custom reset flow — emails from hello@buildmy.directory via Resend.
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status >= 500) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />
      <div className="relative z-10">
        <nav className="flex items-center justify-between px-6 sm:px-10 h-16 max-w-4xl mx-auto">
          <Link href="/" aria-label="BuildMy.Directory home" className="flex items-center">
            <Logo height={28} />
          </Link>
        </nav>
        <main className="max-w-sm mx-auto px-6 pt-16 pb-20">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-center">
            Reset password
          </h1>
          <p className="text-[color:var(--fg-muted)] text-center mb-8">
            Enter the email you signed up with — we&apos;ll send a reset link.
          </p>

          {sent ? (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-4 text-center">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (and spam).
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-semibold mb-1.5 block">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full h-12 px-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-[color:var(--fg-muted)] mt-6">
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-[color:var(--fg)] hover:underline">
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
