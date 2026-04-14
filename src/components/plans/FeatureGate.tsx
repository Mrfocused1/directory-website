"use client";

import { type ReactNode } from "react";
import { type FeatureKey, UPGRADE_PROMPTS } from "@/lib/plans";
import { usePlan } from "./PlanProvider";

/**
 * Wraps a feature section. If the user's plan doesn't include
 * the feature, shows the content with a lock overlay + upgrade prompt.
 */
export default function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  const { can, requiredPlan, requiredPlanId, requiredPrice } = usePlan();

  if (can(feature)) {
    return <>{children}</>;
  }

  const prompt = UPGRADE_PROMPTS[feature];
  const plan = requiredPlan(feature);
  const planId = requiredPlanId(feature);
  const price = requiredPrice(feature);

  const handleUpgrade = async () => {
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Something went wrong starting checkout. Please try again.");
    }
  };

  return (
    <div className="relative">
      {/* Blurred/faded content preview */}
      <div className="pointer-events-none select-none opacity-[0.35] blur-[1px]">
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white border-2 border-[color:var(--fg)] rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl shadow-black/10 text-center">
          {/* Lock icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3 className="text-base font-bold mb-1">{prompt.title}</h3>
          <p className="text-sm text-[color:var(--fg-muted)] mb-3">{prompt.desc}</p>
          <p className="text-xs text-purple-600 font-semibold mb-4 bg-purple-50 px-3 py-1.5 rounded-full inline-block">
            {prompt.benefit}
          </p>
          <button
            type="button"
            onClick={handleUpgrade}
            className="w-full h-11 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition shadow-md shadow-purple-200"
          >
            Upgrade to {plan} &mdash; ${price}/mo
          </button>
        </div>
      </div>
    </div>
  );
}
