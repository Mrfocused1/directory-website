"use client";

import type { SearchTerm } from "@/lib/analytics/mock-data";

export default function SearchTermsTable({ terms }: { terms: SearchTerm[] }) {
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold">Top Search Terms</h3>
        <p className="text-xs text-[color:var(--fg-subtle)] mt-0.5">What visitors are looking for</p>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-b border-[color:var(--border)] text-[color:var(--fg-subtle)]">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-5 py-2.5">Search Term</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-5 py-2.5">Searches</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-5 py-2.5">Click Rate</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider px-5 py-2.5">Avg Results</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((term) => (
              <tr key={term.query} className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-black/[0.02] transition">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--fg-subtle)] shrink-0">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <span className="font-semibold">{term.query}</span>
                  </div>
                </td>
                <td className="text-right px-5 py-3 tabular-nums font-medium">{term.count}</td>
                <td className="text-right px-5 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    term.clickRate >= 70 ? "bg-green-100 text-green-700" :
                    term.clickRate >= 50 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {term.clickRate}%
                  </span>
                </td>
                <td className="text-right px-5 py-3 tabular-nums text-[color:var(--fg-muted)]">{term.avgResults}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
        {terms.map((term) => (
          <div key={term.query} className="px-4 py-3 flex items-center gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--fg-subtle)] shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm">{term.query}</span>
              <span className="text-xs text-[color:var(--fg-muted)] ml-2 tabular-nums">{term.count}x</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
              term.clickRate >= 70 ? "bg-green-100 text-green-700" :
              term.clickRate >= 50 ? "bg-yellow-100 text-yellow-700" :
              "bg-red-100 text-red-700"
            }`}>
              {term.clickRate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
