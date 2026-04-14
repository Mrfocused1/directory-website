"use client";

import type { HeatmapCell } from "@/lib/analytics/mock-data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Heatmap({ data }: { data: HeatmapCell[] }) {
  const maxValue = Math.max(...data.map((c) => c.value), 1);

  const getCell = (day: number, hour: number) =>
    data.find((c) => c.day === day && c.hour === hour);

  const getOpacity = (value: number) => {
    const normalized = value / maxValue;
    return 0.08 + normalized * 0.92;
  };

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-3 sm:p-5">
      <h3 className="text-sm font-bold mb-1">Visitor Activity Heatmap</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">When your audience visits (hour of day vs day of week)</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[480px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {HOURS.filter((h) => h % 3 === 0).map((h) => (
              <div
                key={h}
                className="text-[10px] text-[color:var(--fg-subtle)] tabular-nums"
                style={{ width: `${(3 / 24) * 100}%` }}
              >
                {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
              </div>
            ))}
          </div>

          {/* Grid */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-1 mb-0.5">
              <span className="text-[10px] font-semibold text-[color:var(--fg-subtle)] w-8 text-right shrink-0">
                {day}
              </span>
              <div className="flex-1 flex gap-[1px]">
                {HOURS.map((hour) => {
                  const cell = getCell(dayIdx, hour);
                  const value = cell?.value || 0;
                  return (
                    <div
                      key={hour}
                      className="flex-1 aspect-square rounded-[2px] transition-colors"
                      style={{
                        backgroundColor: `rgba(0, 0, 0, ${getOpacity(value)})`,
                      }}
                      title={`${day} ${hour}:00 — ${value} visitors`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 ml-10">
            <span className="text-[10px] text-[color:var(--fg-subtle)]">Less</span>
            {[0.08, 0.25, 0.45, 0.65, 0.85].map((opacity, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-[2px]"
                style={{ backgroundColor: `rgba(0, 0, 0, ${opacity})` }}
              />
            ))}
            <span className="text-[10px] text-[color:var(--fg-subtle)]">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
