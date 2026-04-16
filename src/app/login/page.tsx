"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

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

  // Users redirected here from /onboarding are almost certainly new — default
  // to signup so they don't have to click "Sign up" first.
  const [mode, setMode] = useState<"login" | "signup">(
    nextPath.startsWith("/onboarding") ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth" ? "Authentication failed. Please try again." : null,
  );
  const [message, setMessage] = useState<string | null>(null);

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
          setMessage("Check your email for a confirmation link from hello@buildmy.directory.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          router.push(nextPath);
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
    <div className="marketing-theme min-h-screen flex flex-col">
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />
      </div>

      <main className="flex-1 bg-[color:var(--bd-cream)] py-16">
        <div className="max-w-md mx-auto px-6">
          <h1 className="font-display-tight text-[2.5rem] sm:text-[3.25rem] text-[color:var(--bd-dark)] text-center mb-3">
            {mode === "login" ? "Welcome back." : "Create your account."}
          </h1>
          <p className="text-[color:var(--bd-grey)] text-center mb-10 leading-relaxed">
            {mode === "login"
              ? "Sign in to manage your directories."
              : "Get started building your directory."}
          </p>

          <div className="bg-white rounded-[1.25rem] p-6 sm:p-8">
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
                disabled={loading}
                className="w-full h-12 bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] rounded-full text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
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
                    className="text-xs font-medium text-[color:var(--bd-grey)] hover:text-[color:var(--bd-dark)] hover:underline"
                  >
                    Forgot your password?
                  </Link>
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
                  className="font-semibold text-[color:var(--bd-dark)] hover:underline"
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
                  className="font-semibold text-[color:var(--bd-dark)] hover:underline"
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
