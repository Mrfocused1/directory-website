"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth" ? "Authentication failed. Please try again." : null,
  );
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setError(error.message);
        } else {
          setMessage("Check your email for a confirmation link.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          router.push("/dashboard");
          router.refresh();
        }
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
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            BuildMy<span className="text-black/40">.</span>Directory
          </Link>
        </nav>

        <main className="max-w-sm mx-auto px-6 pt-16 pb-20">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-center">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-[color:var(--fg-muted)] text-center mb-8">
            {mode === "login"
              ? "Sign in to manage your directories."
              : "Get started building your directory."}
          </p>

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

            <div>
              <label htmlFor="password" className="text-sm font-semibold mb-1.5 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                className="w-full h-12 px-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {loading
                ? "Loading..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>

            {mode === "login" && (
              <div className="text-center">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
            )}
          </form>

          <p className="text-center text-sm text-[color:var(--fg-muted)] mt-6">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); setMessage(null); }}
                  className="font-semibold text-[color:var(--fg)] hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); setMessage(null); }}
                  className="font-semibold text-[color:var(--fg)] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </main>
      </div>
    </div>
  );
}
