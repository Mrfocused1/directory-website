export default function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "text-[color:var(--fg)]",
    good: "text-green-600",
    warn: "text-yellow-700",
    bad: "text-red-700",
  }[tone];

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-1">
        {label}
      </p>
      <p className={`text-2xl font-extrabold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">{hint}</p>}
    </div>
  );
}
