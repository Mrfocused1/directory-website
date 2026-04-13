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

  return <PlanProvider planId={userPlan}>{children}</PlanProvider>;
}
