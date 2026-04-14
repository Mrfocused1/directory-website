"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import PlanBadge from "@/components/plans/PlanBadge";
import { usePlan } from "@/components/plans/PlanProvider";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import { createClient } from "@/lib/supabase/client";
import type { FeatureKey } from "@/lib/plans";

const TABS: { href: string; label: string; requiredFeature?: FeatureKey }[] = [
  { href: "/dashboard", label: "Sites" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/platforms", label: "Platforms" },
  { href: "/dashboard/domains", label: "Domains", requiredFeature: "custom_domain" },
  { href: "/dashboard/requests", label: "Requests", requiredFeature: "requests" },
  { href: "/dashboard/newsletter", label: "Newsletter", requiredFeature: "newsletter" },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePlan();
  const { sites, selectedSite, selectSite } = useSiteContext();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Top nav bar */}
      <nav className="flex items-center justify-between px-4 sm:px-10 h-16 max-w-6xl mx-auto border-b border-[color:var(--border)]">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          BuildMy<span className="text-black/40">.</span>Directory
        </Link>
        <div className="flex items-center gap-3">
          {/* Desktop tabs */}
          <div className="hidden lg:flex items-center gap-1 text-sm">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href;
              const locked = tab.requiredFeature && !can(tab.requiredFeature);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
                    isActive ? "font-semibold bg-black/5" : "text-[color:var(--fg-muted)] hover:bg-black/5"
                  }`}
                >
                  {tab.label}
                  {locked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-purple-400">
                      <rect width="18" height="11" x="3" y="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
          {sites.length > 1 && selectedSite && (
            <select
              value={selectedSite.id}
              onChange={(e) => selectSite(e.target.value)}
              className="text-xs font-medium px-2 py-1.5 rounded-lg border border-[color:var(--border)] bg-white max-w-[160px] truncate"
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
            className="text-xs font-medium text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
          >
            Sign out
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
      </div>
    </>
  );
}
