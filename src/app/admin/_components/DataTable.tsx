import type { ReactNode } from "react";

export type Column<Row> = {
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  width?: string;
};

export default function DataTable<Row>({
  columns,
  rows,
  empty,
}: {
  columns: Column<Row>[];
  rows: Row[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[color:var(--border)] rounded-xl p-8 text-center text-sm text-[color:var(--fg-subtle)]">
        {empty || "No rows."}
      </div>
    );
  }
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-[color:var(--fg-subtle)]">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-black/[0.02]">
                {columns.map((c, ci) => (
                  <td
                    key={ci}
                    className={`px-3 py-2.5 ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
