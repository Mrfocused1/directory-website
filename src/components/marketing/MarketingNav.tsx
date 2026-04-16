"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "@/components/brand/Logo";
import { createClient } from "@/lib/supabase/client";

export default function MarketingNav() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8 text-sm text-white/80">
          <Link href="/#pricing" className="hover:text-white transition">Pricing</Link>
          <Link href="/#how" className="hover:text-white transition">How it works</Link>
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
                className="hidden sm:inline text-sm text-white/80 hover:text-white transition"
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
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10 transition"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-[color:var(--bd-dark)]/95 backdrop-blur-md px-6 py-4 space-y-3">
          <Link href="/#pricing" onClick={() => setMobileOpen(false)} className="block text-sm text-white/80 hover:text-white py-2">
            Pricing
          </Link>
          <Link href="/#how" onClick={() => setMobileOpen(false)} className="block text-sm text-white/80 hover:text-white py-2">
            How it works
          </Link>
          {!loggedIn && (
            <Link href="/login" onClick={() => setMobileOpen(false)} className="block text-sm text-white/80 hover:text-white py-2">
              Login
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
