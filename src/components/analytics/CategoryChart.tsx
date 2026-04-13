"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CategoryStat } from "@/lib/analytics/mock-data";

export default function CategoryChart({ data }: { data: CategoryStat[] }) {
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">Category Engagement</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">Clicks by content category</p>

      {/* Desktop: vertical bars */}
      <div className="hidden sm:block h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.5)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.4)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            />
            <Bar dataKey="clicks" fill="#000" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mobile: horizontal bar list */}
      <div className="sm:hidden space-y-3">
        {data.map((item) => {
          const max = Math.max(...data.map((d) => d.clicks), 1);
          return (
            <div key={item.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{item.category}</span>
                <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">{item.clicks}</span>
              </div>
              <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[color:var(--fg)] rounded-full"
                  style={{ width: `${(item.clicks / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
