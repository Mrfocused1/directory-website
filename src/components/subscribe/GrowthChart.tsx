"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { GrowthPoint } from "@/lib/newsletter/mock-data";

export default function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">Subscriber Growth</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">Total subscribers over the last 30 days</p>
      <div className="h-52 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradient-subs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#000" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#000" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(parseISO(d), "MMM d")}
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.4)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.4)" }}
              axisLine={false}
              tickLine={false}
              domain={["dataMin - 1", "dataMax + 1"]}
            />
            <Tooltip
              labelFormatter={(d) => format(parseISO(d as string), "EEE, MMM d")}
              contentStyle={{
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#000"
              strokeWidth={2}
              fill="url(#gradient-subs)"
              dot={false}
              activeDot={{ r: 4, fill: "#000" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
