"use client";

import { type FeatureKey, UPGRADE_PROMPTS } from "@/lib/plans";
import { usePlan } from "./PlanProvider";

/**
 * Inline upgrade banner — shows inside a section when feature is locked.
 * Lighter than FeatureGate — doesn't overlay content, just shows a card.
 */
export default function UpgradeBanner({
  feature,
}: {
  feature: FeatureKey;
}) {
  const { can, requiredPlan, requiredPlanId, requiredPrice } = usePlan();

  if (can(feature)) return null;

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
    <div className="bg-gradient-to-r from-purple-50 via-violet-50 to-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-bold">{prompt.title}</h4>
        <p className="text-xs text-[color:var(--fg-muted)] mt-0.5">{prompt.benefit}</p>
      </div>
      <button
        type="button"
        onClick={handleUpgrade}
        className="h-9 px-4 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg text-xs font-semibold hover:opacity-90 transition shadow-sm shadow-purple-200 whitespace-nowrap shrink-0"
      >
        Upgrade to {plan} &mdash; ${price}/mo
      </button>
    </div>
  );
}
