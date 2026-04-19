"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  type PlanId,
  type FeatureKey,
  type Platform,
  hasFeature,
  getPlan,
  requiredPlanFor,
  canAddPlatformAccount,
  getPlatformLimit,
  requiredPlanForPlatform,
} from "@/lib/plans";

type PlanContextValue = {
  planId: PlanId;
  planName: string;
  postLimit: number; // 0 = unlimited
  can: (feature: FeatureKey) => boolean;
  requiredPlan: (feature: FeatureKey) => string;
  requiredPlanId: (feature: FeatureKey) => PlanId;
  requiredPrice: (feature: FeatureKey) => number;
  canAddPlatform: (platform: Platform, currentCount: number) => boolean;
  platformLimit: (platform: Platform) => number;
  planForPlatform: (platform: Platform, count: number) => { name: string; price: number };
};

const PlanContext = createContext<PlanContextValue | null>(null);

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be inside PlanProvider");
  return ctx;
}

export default function PlanProvider({
  planId = "creator",
  children,
}: {
  planId?: PlanId;
  children: ReactNode;
}) {
  const plan = getPlan(planId);

  const value: PlanContextValue = {
    planId,
    planName: plan.name,
    postLimit: plan.postLimit,
    can: (feature) => hasFeature(planId, feature),
    requiredPlan: (feature) => requiredPlanFor(feature).name,
    requiredPlanId: (feature) => requiredPlanFor(feature).id,
    requiredPrice: (feature) => requiredPlanFor(feature).price,
    canAddPlatform: (platform, currentCount) => canAddPlatformAccount(planId, platform, currentCount),
    platformLimit: (platform) => getPlatformLimit(planId, platform),
    planForPlatform: (platform, count) => {
      const p = requiredPlanForPlatform(platform, count);
      return { name: p.name, price: p.price };
    },
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
