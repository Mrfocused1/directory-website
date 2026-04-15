"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

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
    <div className="marketing-theme min-h-screen flex flex-col">
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />
      </div>

      <main className="flex-1 bg-[color:var(--bd-cream)] py-16">
        <div className="max-w-md mx-auto px-6">
          <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] text-center mb-3">
            Set a new password.
          </h1>
          <p className="text-[color:var(--bd-grey)] text-center mb-10 leading-relaxed">
            Choose something you&apos;ll remember.
          </p>

          <div className="bg-white rounded-[1.25rem] p-6 sm:p-8">
            {!ready ? (
              <div className="text-center text-sm text-[color:var(--bd-grey)]">Verifying link…</div>
            ) : !authed ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-4 text-center">
                This reset link is invalid or has expired.{" "}
                <Link href="/forgot-password" className="font-semibold underline">
                  Request a new one
                </Link>
                .
              </div>
            ) : success ? (
              <div className="bg-[color:var(--bd-lime)]/30 border border-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-sm rounded-xl px-4 py-4 text-center">
                Password updated. Redirecting to your dashboard…
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="eyebrow text-[color:var(--bd-dark)] mb-2 block">
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
                    className="w-full h-12 px-5 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-medium text-[color:var(--bd-dark)] placeholder:text-[color:var(--bd-grey)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div>
                  <label htmlFor="confirm" className="eyebrow text-[color:var(--bd-dark)] mb-2 block">
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
                    className="w-full h-12 px-5 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-medium text-[color:var(--bd-dark)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
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
                  {loading ? "Updating…" : "Update password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
