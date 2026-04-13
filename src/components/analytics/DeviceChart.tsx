"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DeviceStat } from "@/lib/analytics/mock-data";

const COLORS = ["#000000", "#555555", "#999999"];

export default function DeviceChart({ data }: { data: DeviceStat[] }) {
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">Devices</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">Visitor device breakdown</p>
      <div className="flex items-center gap-6">
        <div className="w-32 h-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={55}
                dataKey="count"
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2.5 flex-1">
          {data.map((item, i) => (
            <div key={item.device} className="flex items-center gap-2.5">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-sm font-semibold flex-1">{item.device}</span>
              <span className="text-xs text-[color:var(--fg-muted)] tabular-nums">
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
