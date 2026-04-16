import Link from "next/link";
import Logo from "@/components/brand/Logo";

const PRODUCT_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/onboarding", label: "Get started" },
  { href: "/#how", label: "How it works" },
];

const COMPANY_LINKS = [
  { href: "/#contact", label: "Contact" },
  { href: "mailto:hello@buildmy.directory", label: "hello@buildmy.directory" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms & conditions" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[color:var(--border)] bg-white/40 relative z-10">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {/* Top: brand + columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" aria-label="BuildMy.Directory home" className="inline-flex mb-3">
              <Logo height={40} />
            </Link>
            <p className="text-xs text-[color:var(--fg-muted)] leading-relaxed max-w-[220px]">
              Turn your social media content into a searchable, shareable directory — without lifting a finger.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-3">
              Product
            </h3>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-3">
              Company
            </h3>
            <ul className="space-y-2">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition break-all"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--fg-subtle)] mb-3">
              Legal
            </h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom: copyright */}
        <div className="border-t border-[color:var(--border)] pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-[color:var(--fg-subtle)]">
            © {year} BuildMy.Directory. All rights reserved.
          </p>
          <p className="text-xs text-[color:var(--fg-subtle)]">
            Built for creators who want their content to live beyond the feed.
          </p>
        </div>
      </div>
    </footer>
  );
}
