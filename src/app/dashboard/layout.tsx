"use client";

import PlanProvider from "@/components/plans/PlanProvider";

/**
 * Dashboard layout — wraps all /dashboard/* pages with PlanProvider.
 * Change the planId here to test different plan levels:
 * "free" | "creator" | "pro" | "agency"
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // In production, this comes from the user's session/auth context
  const userPlan = "free" as const;

  return (
    <PlanProvider planId={userPlan}>
      {children}
      <footer className="border-t border-[color:var(--border)] py-8 px-6 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold">
            BuildMy<span className="text-black/40">.</span>Directory
          </span>
          <p className="text-xs text-[color:var(--fg-subtle)]">
            Built for creators who want their content to live beyond the feed.
          </p>
        </div>
      </footer>
    </PlanProvider>
  );
}
