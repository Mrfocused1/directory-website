"use client";

import type { ReferrerSource } from "@/lib/analytics/mock-data";

export default function ReferrerChart({ data }: { data: ReferrerSource[] }) {
  const max = Math.max(...data.map((d) => d.visitors), 1);

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">Top Referrers</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">Where your visitors come from</p>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.source}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{item.source}</span>
              <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">
                {item.visitors.toLocaleString()} ({item.percentage}%)
              </span>
            </div>
            <div className="h-2 bg-black/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-[color:var(--fg)] rounded-full transition-all duration-500"
                style={{ width: `${(item.visitors / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
