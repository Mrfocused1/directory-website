"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/brand/Logo";

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

  // Supabase's admin.generateLink({type:'recovery'}) issues an implicit-
  // flow URL that redirects here with `#access_token=...&refresh_token=...`
  // in the hash. @supabase/ssr's createBrowserClient is PKCE-only and does
  // NOT auto-parse the hash, so we hand-feed the tokens to setSession.
  // A `?code=` query param (PKCE flow — if ever enabled) is handled via
  // exchangeCodeForSession. Without this, the page read "This reset link
  // is invalid or has expired." on perfectly valid, freshly-minted links.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setAuthed(true);
      }
      setReady(true);
    });

    (async () => {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(
        url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
      );
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = url.searchParams.get("code");

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && data.session) setAuthed(true);
        window.history.replaceState({}, "", url.pathname + url.search);
      } else if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) setAuthed(true);
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      } else {
        const { data } = await supabase.auth.getSession();
        if (data.session) setAuthed(true);
      }
      setReady(true);
    })();

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
          <Link href="/" aria-label="BuildMy.Directory home" className="flex items-center">
            <Logo height={44} />
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
