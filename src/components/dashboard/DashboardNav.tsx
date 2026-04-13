"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PlanBadge from "@/components/plans/PlanBadge";
import { usePlan } from "@/components/plans/PlanProvider";
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
  const { can } = usePlan();

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
          <PlanBadge />
        </div>
      </nav>

      {/* Mobile tab bar */}
      <div className="lg:hidden flex border-b border-[color:var(--border)] overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          const locked = tab.requiredFeature && !can(tab.requiredFeature);
          return isActive ? (
            <span
              key={tab.href}
              className="flex-1 text-center py-3 text-sm font-semibold border-b-2 border-[color:var(--fg)] whitespace-nowrap px-3 flex items-center justify-center gap-1"
            >
              {tab.label}
            </span>
          ) : (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 text-center py-3 text-sm font-medium text-[color:var(--fg-muted)] whitespace-nowrap px-3 flex items-center justify-center gap-1"
            >
              {tab.label}
              {locked && (
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
