import Link from "next/link";
import Footer from "@/components/landing/Footer";

export default function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 sm:px-10 h-16 max-w-6xl mx-auto">
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            BuildMy<span className="text-black/40">.</span>Directory
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </Link>
        </nav>

        <main className="max-w-3xl mx-auto px-6 sm:px-10 pt-10 pb-20">
          <div className="mb-10">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">{title}</h1>
            <p className="text-sm text-[color:var(--fg-subtle)]">
              Last updated: {lastUpdated}
            </p>
          </div>

          <article className="prose prose-sm sm:prose-base max-w-none text-[color:var(--fg-muted)] leading-relaxed">
            {children}
          </article>
        </main>

        <Footer />
      </div>
    </div>
  );
}
