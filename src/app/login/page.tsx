"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

// Flip to true once Google's branding verification completes (the
// app logo + "Sign in to BuildMy Directory" text will then show on
// the consent screen instead of the unverified-app warning).
const SHOW_GOOGLE_AUTH = false;

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

  // Only allow same-origin relative redirects to avoid open-redirect attacks
  const rawNext = searchParams.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/dashboard";

  // Users redirected here from /onboarding or /checkout-redirect are
  // almost certainly new — default to signup so they don't have to
  // click "Sign up" first.
  const isSignupContext =
    nextPath.startsWith("/onboarding") || nextPath.startsWith("/checkout-redirect");
  const [mode, setMode] = useState<"login" | "signup" | "verify">(
    isSignupContext ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth" ? "Authentication failed. Please try again." : null,
  );
  const [message, setMessage] = useState<string | null>(
    searchParams.get("confirmed") === "1"
      ? "Email confirmed! Sign in below to continue."
      : null,
  );

  const supabase = createClient();

  // Redirect already-logged-in users straight to the dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace(nextPath);
      }
    });
  }, [supabase, router, nextPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        // Custom signup: /api/auth/signup creates the user via admin API and
        // emails the confirmation link from hello@buildmy.directory via
        // Resend (not Supabase's default sender).
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, next: nextPath }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Signup failed. Please try again.");
        } else {
          setMode("verify");
          setMessage(`We sent a 6-digit code to ${email}. Enter it below to finish.`);
        }
      } else if (mode === "verify") {
        const cleaned = code.replace(/\D/g, "");
        if (cleaned.length !== 6) {
          setError("Enter the 6-digit code from your email.");
        } else {
          // type "email" is the umbrella for email-based OTPs — handles
          // both the initial signup code and any resent magiclink code
          const { error } = await supabase.auth.verifyOtp({
            email,
            token: cleaned,
            type: "email",
          });
          if (error) {
            setError(error.message);
          } else {
            await fetch("/api/auth/me", { method: "POST" }).catch(() => {});
            window.location.href = nextPath;
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          // Use window.location for a full navigation to ensure the
          // server picks up the new session cookies immediately.
          window.location.href = nextPath;
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google") => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // Supabase will navigate the browser to the provider, no need to
      // do anything else on success. If it throws we reset loading.
    } catch {
      setError("Couldn't start social sign-in. Please try again.");
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
            {mode === "login" ? "Welcome back." : mode === "verify" ? "Check your email." : "Create your account."}
          </h1>
          <p className="text-[color:var(--bd-grey)] text-center mb-10 leading-relaxed">
            {mode === "login"
              ? "Sign in to manage your directories."
              : mode === "verify"
                ? "Enter the 6-digit code we just sent."
                : "Get started building your directory."}
          </p>

          <div className="bg-white rounded-[1.25rem] p-6 sm:p-8">
            {/* Google sign-in — temporarily hidden until Google finishes
                reviewing our OAuth branding submission (they show an
                unverified-app warning otherwise which scares users away).
                Flip SHOW_GOOGLE_AUTH back on once "Your branding is
                being shown to users" in the Google Cloud console. */}
            {SHOW_GOOGLE_AUTH && (
              <>
                <button
                  type="button"
                  onClick={() => handleOAuth("google")}
                  disabled={loading}
                  className="w-full h-12 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-semibold text-[color:var(--bd-dark)] hover:bg-[color:var(--bd-dark)]/[0.02] transition disabled:opacity-50 flex items-center justify-center gap-2.5 mb-5"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.1 4.1-3.9 5.6l6.2 5.2c-.4.4 6.4-4.7 6.4-14.8 0-1.3-.1-2.3-.4-3.5z"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <div className="w-full border-t border-[color:var(--bd-dark-faded)]" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--bd-grey)]">
                      or
                    </span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode !== "verify" && (
                <>
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

                  <div>
                    <label htmlFor="password" className="eyebrow text-[color:var(--bd-dark)] mb-2 block">
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
                      className="w-full h-12 px-5 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-full text-sm font-medium text-[color:var(--bd-dark)] placeholder:text-[color:var(--bd-grey)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                      placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
                    />
                  </div>
                </>
              )}

              {mode === "verify" && (
                <div>
                  <label htmlFor="code" className="eyebrow text-[color:var(--bd-dark)] mb-2 block">
                    6-digit code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="w-full h-14 px-5 bg-white border-2 border-[color:var(--bd-dark-faded)] rounded-2xl text-center text-2xl font-bold tracking-[8px] text-[color:var(--bd-dark)] placeholder:text-[color:var(--bd-grey)] focus:outline-none focus:border-[color:var(--bd-dark)] transition"
                    placeholder="000000"
                    autoFocus
                  />
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              {message && (
                <div className="bg-[color:var(--bd-lime)]/30 border border-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-sm rounded-xl px-4 py-3">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (mode === "verify" && code.length !== 6)}
                className="w-full h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading
                  ? "Loading..."
                  : mode === "login"
                    ? "Sign in"
                    : mode === "verify"
                      ? "Verify & sign in"
                      : "Create account"}
              </button>

              {mode === "login" && (
                <div className="text-center">
                  <Link
                    href="/forgot-password"
                    className="inline-block py-2 text-xs font-medium text-[color:var(--bd-grey)] hover:text-[color:var(--bd-dark)] hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
              )}

              {mode === "verify" && (
                <div className="text-center">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || loading}
                    onClick={async () => {
                      setError(null);
                      setMessage(null);
                      setResendCooldown(30);
                      const timer = setInterval(() => {
                        setResendCooldown((c) => {
                          if (c <= 1) { clearInterval(timer); return 0; }
                          return c - 1;
                        });
                      }, 1000);
                      const res = await fetch("/api/auth/resend-confirmation", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email }),
                      });
                      if (res.ok) setMessage(`New code sent to ${email}.`);
                      else setError("Couldn't resend. Try again in a moment.");
                    }}
                    className="py-2 text-xs font-medium text-[color:var(--bd-grey)] hover:text-[color:var(--bd-dark)] hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              )}
            </form>
          </div>

          <p className="text-center text-sm text-[color:var(--bd-grey)] mt-6">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); setMessage(null); }}
                  className="py-2 font-semibold text-[color:var(--bd-dark)] hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : mode === "verify" ? (
              <>
                Wrong email?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setCode(""); setError(null); setMessage(null); }}
                  className="py-2 font-semibold text-[color:var(--bd-dark)] hover:underline"
                >
                  Start over
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); setMessage(null); }}
                  className="py-2 font-semibold text-[color:var(--bd-dark)] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
