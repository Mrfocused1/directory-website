import Link from "next/link";
import Logo from "@/components/brand/Logo";

/**
 * Landing/legal page top nav — dark-background variant matching the
 * nory.ai aesthetic. Kept intentionally sparse: no dropdowns, no
 * mega-menus. Tenant pages + dashboard have their own nav; this one
 * is marketing-only.
 */
export default function MarketingNav() {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-[color:var(--bd-dark)]/70 border-b border-white/10">
      <div className="max-w-[90rem] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link href="/" aria-label="BuildMy.Directory home" className="flex items-center">
          <Logo height={28} variant="white" priority />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/80">
          <Link href="/#pricing" className="hover:text-white transition">Pricing</Link>
          <Link href="/#how" className="hover:text-white transition">How it works</Link>
          <Link href="/demo" className="hover:text-white transition">Demo</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-white/80 hover:text-white transition"
          >
            Login
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex items-center h-9 px-4 rounded-full bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-sm font-semibold hover:opacity-90 transition"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}
