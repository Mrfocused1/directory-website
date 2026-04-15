"use client";

import PlanProvider from "@/components/plans/PlanProvider";
import SiteProvider from "@/components/dashboard/SiteContext";
import Logo from "@/components/brand/Logo";
import type { PlanId } from "@/lib/plans";

export default function DashboardShell({
  planId,
  userId,
  email,
  children,
}: {
  planId: PlanId;
  userId: string;
  email: string;
  children: React.ReactNode;
}) {
  return (
    <PlanProvider planId={planId}>
      <SiteProvider>
        {children}
        <footer className="border-t border-[color:var(--border)] py-8 px-6 relative z-10">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="inline-flex">
              <Logo height={22} />
            </span>
            <p className="text-xs text-[color:var(--fg-subtle)]">
              Signed in as {email}
            </p>
          </div>
        </footer>
      </SiteProvider>
    </PlanProvider>
  );
}
