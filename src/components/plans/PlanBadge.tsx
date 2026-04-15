"use client";

import { usePlan } from "./PlanProvider";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  creator: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  agency: "bg-amber-100 text-amber-700",
};

export default function PlanBadge() {
  const { planId, planName } = usePlan();

  return (
    <span className={`shrink-0 whitespace-nowrap text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 sm:py-1 rounded ${PLAN_COLORS[planId] || PLAN_COLORS.free}`}>
      {planName} Plan
    </span>
  );
}
