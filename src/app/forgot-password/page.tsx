"use client";

import { useState } from "react";
import Link from "next/link";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

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
    <div className="marketing-theme min-h-screen flex flex-col">
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />
      </div>

      <main className="flex-1 bg-[color:var(--bd-cream)] py-16">
        <div className="max-w-md mx-auto px-6">
          <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] text-center mb-3">
            Reset password.
          </h1>
          <p className="text-[color:var(--bd-grey)] text-center mb-10 leading-relaxed">
            Enter the email you signed up with — we&apos;ll send a reset link.
          </p>

          <div className="bg-white rounded-[1.25rem] p-6 sm:p-8">
            {sent ? (
              <div className="bg-[color:var(--bd-lime)]/30 border border-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-sm rounded-xl px-4 py-4 text-center">
                If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (and spam).
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="eyebrow text-[color:var(--bd-dark)] mb-2 block">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full h-12 px-5 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-medium text-[color:var(--bd-dark)] placeholder:text-[color:var(--bd-grey)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
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
                  className="w-full h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-sm text-[color:var(--bd-grey)] mt-6">
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-[color:var(--bd-dark)] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
