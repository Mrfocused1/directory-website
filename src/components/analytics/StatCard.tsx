"use client";

export default function StatCard({
  label,
  value,
  change,
  suffix,
}: {
  label: string;
  value: string | number;
  change?: number;
  suffix?: string;
}) {
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-3.5 sm:p-5">
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1 truncate">
        {label}
      </p>
      <div className="flex items-end gap-1.5 sm:gap-2">
        <p className="text-xl sm:text-2xl font-extrabold tabular-nums leading-none">
          {value}
          {suffix && <span className="text-xs sm:text-sm font-semibold text-[color:var(--fg-muted)]">{suffix}</span>}
        </p>
        {change !== undefined && (
          <span
            className={`text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded mb-0.5 ${
              change >= 0
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change}%
          </span>
        )}
      </div>
    </div>
  );
}
