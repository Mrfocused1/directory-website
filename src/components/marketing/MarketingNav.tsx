"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "@/components/brand/Logo";
import { createClient } from "@/lib/supabase/client";

/**
 * Landing/legal page top nav. Checks auth state client-side:
 *   - Logged out → "Login" + "Start free"
 *   - Logged in  → "Dashboard" pill (same lime CTA style)
 */
export default function MarketingNav() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setLoggedIn(true);
    });
  }, []);

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-[color:var(--bd-dark)]/70 border-b border-white/10">
      <div className="max-w-[90rem] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link href="/" aria-label="BuildMy.Directory home" className="flex items-center">
          <Logo height={44} variant="white" priority />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/80">
          <Link href="/#pricing" className="hover:text-white transition">Pricing</Link>
          <Link href="/#how" className="hover:text-white transition">How it works</Link>
          <Link href="/demo" className="hover:text-white transition">Demo</Link>
        </div>

        <div className="flex items-center gap-3">
          {loggedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center h-9 px-4 rounded-full bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-sm font-semibold hover:opacity-90 transition"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-white/80 hover:text-white transition"
              >
                Login
              </Link>
              <Link
                href="/onboarding"
                className="inline-flex items-center h-9 px-4 rounded-full bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-sm font-semibold hover:opacity-90 transition"
              >
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
