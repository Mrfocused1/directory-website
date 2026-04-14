import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
  children?: ReactNode;
};

export default function EmptyState({ icon, title, description, action, children }: Props) {
  return (
    <div className="text-center py-16 sm:py-20 bg-white border-2 border-dashed border-[color:var(--border)] rounded-2xl px-6">
      <div className="w-14 h-14 rounded-2xl bg-black/5 flex items-center justify-center mx-auto mb-5 text-[color:var(--fg-muted)]">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-[color:var(--fg-muted)] mb-6 max-w-md mx-auto">
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-11 px-6 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
        >
          {action.label}
        </Link>
      )}
      {children}
    </div>
  );
}
