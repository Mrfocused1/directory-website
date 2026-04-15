import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sites", label: "Sites" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/pipeline", label: "Pipeline" },
  { href: "/admin/billing", label: "Billing" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-[color:var(--bg)]">
      <nav className="border-b border-[color:var(--border)] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <Link href="/admin" className="text-sm font-extrabold tracking-tight">
            BuildMy<span className="text-black/40">.</span>Directory
            <span className="ml-2 text-[10px] font-bold uppercase tracking-widest bg-black text-white px-1.5 py-0.5 rounded align-middle">
              admin
            </span>
          </Link>
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[color:var(--fg-muted)] hover:bg-black/5 hover:text-[color:var(--fg)] transition whitespace-nowrap"
              >
                {t.label}
              </Link>
            ))}
            <span className="text-[11px] text-[color:var(--fg-subtle)] ml-3">{admin.email}</span>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8">{children}</main>
    </div>
  );
}
