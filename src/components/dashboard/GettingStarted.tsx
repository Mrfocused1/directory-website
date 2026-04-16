"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePlan } from "@/components/plans/PlanProvider";

type Site = {
  id: string;
  isPublished: boolean;
  postCount: number;
};

type ChecklistItem = {
  id: string;
  label: string;
  href: string;
  done: boolean;
};

const STORAGE_KEY = "bmd_checklist_dismissed";

/**
 * A one-time onboarding checklist shown on /dashboard.
 * Tracks completion status from real data and persists dismissal
 * in localStorage so it doesn't come back once the user waves it away.
 */
export default function GettingStarted({ sites }: { sites: Site[] }) {
  const { can } = usePlan();
  const [dismissed, setDismissed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Lightweight subscriber probe — only runs if we have a site
  useEffect(() => {
    const firstSite = sites[0];
    if (!firstSite) return;
    void (async () => {
      try {
        const res = await fetch(`/api/subscribe?siteId=${firstSite.id}`);
        const data = await res.json();
        setSubscriberCount(typeof data.total === "number" ? data.total : 0);
      } catch {
        setSubscriberCount(0);
      }
    })();
  }, [sites]);

  if (dismissed || sites.length === 0) return null;

  const primarySite = sites[0];
  const items: ChecklistItem[] = [
    {
      id: "create",
      label: "Create your first directory",
      href: "/onboarding",
      done: sites.length >= 1,
    },
    {
      id: "posts",
      label: "Import or review your posts",
      href: "/dashboard/posts",
      done: primarySite.postCount > 0,
    },
    {
      id: "publish",
      label: "Publish your directory",
      href: "/dashboard",
      done: primarySite.isPublished,
    },
    ...(can("newsletter")
      ? [{
          id: "subscribers",
          label: "Get your first newsletter subscriber",
          href: "/dashboard/newsletter",
          done: (subscriberCount ?? 0) > 0,
        }]
      : []),
    {
      id: "account",
      label: "Complete your account profile",
      href: "/dashboard/account",
      done: false, // Always show — nudges toward filling in name/password
    },
  ];

  const completed = items.filter((i) => i.done).length;
  const pct = Math.round((completed / items.length) * 100);

  if (completed === items.length) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="bg-gradient-to-br from-violet-50 via-white to-pink-50 border border-violet-200 rounded-2xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight">Getting started</h2>
          <p className="text-xs text-[color:var(--fg-muted)] mt-0.5">
            {completed} of {items.length} steps complete · {pct}%
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)] text-lg leading-none"
          aria-label="Dismiss checklist"
        >
          ×
        </button>
      </div>

      <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-3 py-1.5 group"
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  item.done
                    ? "bg-green-500 text-white"
                    : "border-2 border-[color:var(--border)] bg-white"
                }`}
                aria-hidden
              >
                {item.done ? "✓" : ""}
              </span>
              <span
                className={`text-sm ${
                  item.done
                    ? "text-[color:var(--fg-subtle)] line-through"
                    : "text-[color:var(--fg)] group-hover:underline"
                }`}
              >
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
