"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PlanBadge from "@/components/plans/PlanBadge";
import { usePlan } from "@/components/plans/PlanProvider";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/brand/Logo";
import type { FeatureKey } from "@/lib/plans";

const TABS: { href: string; label: string; requiredFeature?: FeatureKey }[] = [
  { href: "/dashboard", label: "Sites" },
  { href: "/dashboard/posts", label: "Posts" },
  { href: "/dashboard/categories", label: "Categories" },
  { href: "/dashboard/analytics", label: "Analytics", requiredFeature: "analytics_basic" },
  { href: "/dashboard/platforms", label: "Platforms" },
  { href: "/dashboard/domains", label: "Domains", requiredFeature: "custom_domain" },
  { href: "/dashboard/requests", label: "Requests", requiredFeature: "requests" },
  { href: "/dashboard/newsletter", label: "Newsletter", requiredFeature: "newsletter" },
  { href: "/dashboard/share", label: "Share" },
  { href: "/dashboard/api", label: "API", requiredFeature: "api_access" },
  { href: "/dashboard/account", label: "Account" },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePlan();
  const { sites, selectedSite, selectSite } = useSiteContext();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/is-admin")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIsAdmin(!!d.isAdmin); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Top nav bar */}
      <nav className="flex items-center justify-between gap-3 px-4 sm:px-6 h-16 max-w-7xl mx-auto border-b border-[color:var(--border)]">
        <Link href="/" aria-label="BuildMy.Directory home" className="flex items-center">
          <Logo height={44} />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          {/* Desktop tabs — tighter padding so the nav has room for the
              plan badge and sign-out on the right without wrapping. */}
          <div className="hidden lg:flex items-center gap-0.5 text-sm">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href;
              const locked = tab.requiredFeature && !can(tab.requiredFeature);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-2 py-1.5 rounded-lg font-medium transition flex items-center gap-1 whitespace-nowrap ${
                    isActive ? "font-semibold bg-black/5" : "text-[color:var(--fg-muted)] hover:bg-black/5"
                  }`}
                >
                  {tab.label}
                  {locked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400" aria-hidden>
                      <rect width="18" height="11" x="3" y="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className="ml-1 px-2 py-1.5 rounded-lg font-semibold bg-black text-white hover:bg-black/80 transition whitespace-nowrap flex items-center gap-1.5"
                title="Platform-owner admin console"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
                </svg>
                Admin
              </Link>
            )}
          </div>
          {sites.length > 1 && selectedSite && (
            <select
              value={selectedSite.id}
              onChange={(e) => selectSite(e.target.value)}
              className="text-xs font-medium px-2 py-1.5 rounded-lg border border-[color:var(--border)] bg-white max-w-[160px] truncate shrink-0"
              aria-label="Select active directory"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName || s.slug}
                </option>
              ))}
            </select>
          )}
          <PlanBadge />
          <button
            type="button"
            onClick={handleSignOut}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--fg-muted)] hover:bg-black/5 hover:text-[color:var(--fg)] transition"
            aria-label="Sign out"
            title="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile tab bar — horizontally scrollable */}
      <div className="lg:hidden flex border-b border-[color:var(--border)] overflow-x-auto overflow-y-hidden scrollbar-hide px-1 max-w-[100vw]">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          const locked = tab.requiredFeature && !can(tab.requiredFeature);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 text-center py-3 text-sm whitespace-nowrap px-4 flex items-center justify-center gap-1 ${
                isActive
                  ? "font-semibold border-b-2 border-[color:var(--fg)]"
                  : "font-medium text-[color:var(--fg-muted)]"
              }`}
            >
              {tab.label}
              {locked && !isActive && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400">
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className="shrink-0 text-center py-3 text-sm whitespace-nowrap px-4 flex items-center gap-1 font-semibold text-black"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
            </svg>
            Admin
          </Link>
        )}
      </div>
    </>
  );
}
