import Link from "next/link";
import Logo from "@/components/brand/Logo";

export default function MarketingFooter() {
  return (
    <footer className="bg-[color:var(--bd-dark)] text-white/80 pt-24 pb-12">
      <div className="max-w-[90rem] mx-auto px-6 sm:px-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-16 border-b border-white/10">
          <div>
            <Link href="/" aria-label="BuildMy.Directory home" className="inline-flex">
              <Logo height={32} variant="white" />
            </Link>
            <p className="mt-4 text-sm text-white/60 max-w-xs leading-relaxed">
              Turn your Instagram or TikTok content into a beautiful, searchable
              directory your audience can explore.
            </p>
          </div>
          <div>
            <div className="eyebrow text-white/50 mb-4">Product</div>
            <ul className="space-y-3 text-sm">
              <li><Link href="/#pricing" className="hover:text-white">Pricing</Link></li>
              <li><Link href="/#how" className="hover:text-white">How it works</Link></li>
              <li><Link href="/demo" className="hover:text-white">Demo</Link></li>
              <li><Link href="/login" className="hover:text-white">Login</Link></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow text-white/50 mb-4">Legal</div>
            <ul className="space-y-3 text-sm">
              <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow text-white/50 mb-4">Contact</div>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="mailto:hello@buildmy.directory" className="hover:text-white">
                  hello@buildmy.directory
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <span>© {new Date().getFullYear()} BuildMy.Directory. All rights reserved.</span>
          <span>Made with care for creators.</span>
        </div>
      </div>
    </footer>
  );
}
