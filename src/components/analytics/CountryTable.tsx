"use client";

import type { CountryStat } from "@/lib/analytics/mock-data";

export default function CountryTable({ data }: { data: CountryStat[] }) {
  const max = Math.max(...data.map((d) => d.visitors), 1);

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">Top Countries</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">Visitor geography</p>
      <div className="space-y-2.5">
        {data.map((item) => (
          <div key={item.code} className="flex items-center gap-3">
            <span className="text-base w-7 text-center shrink-0">
              {item.code !== "--" ? getFlagEmoji(item.code) : "🌍"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-semibold truncate">{item.country}</span>
                <span className="text-xs text-[color:var(--fg-muted)] tabular-nums shrink-0 ml-2">
                  {item.visitors.toLocaleString()} ({item.percentage}%)
                </span>
              </div>
              <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[color:var(--fg)] rounded-full transition-all duration-500"
                  style={{ width: `${(item.visitors / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
