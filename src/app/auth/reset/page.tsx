"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Supabase delivers the recovery session via one of two transports:
  //   1. `?code=…` query param (PKCE — current default)
  //   2. `#access_token=…` URL hash (implicit flow — legacy)
  // createBrowserClient auto-detects the hash but does NOT auto-exchange
  // the code query param, so we handle it explicitly here. Without this,
  // the page shows "This reset link is invalid or has expired." even on
  // a valid, freshly-minted link.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setAuthed(true);
      }
      setReady(true);
    });

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }) => {
          if (!error && data.session) setAuthed(true);
          // Strip ?code= so refresh doesn't re-exchange.
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
          setReady(true);
        });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setAuthed(true);
        setReady(true);
      });
    }
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else {
        setSuccess(true);
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1200);
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
            Set a new password
          </h1>
          <p className="text-[color:var(--fg-muted)] text-center mb-8">
            Choose something you&apos;ll remember.
          </p>

          {!ready ? (
            <div className="text-center text-sm text-[color:var(--fg-muted)]">Verifying link...</div>
          ) : !authed ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-4 text-center">
              This reset link is invalid or has expired.{" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new one
              </Link>
              .
            </div>
          ) : success ? (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-4 text-center">
              Password updated. Redirecting to your dashboard...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="text-sm font-semibold mb-1.5 block">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full h-12 px-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="text-sm font-semibold mb-1.5 block">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full h-12 px-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
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
                {loading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
