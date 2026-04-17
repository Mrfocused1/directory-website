import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <div className="text-center">
          <h1 className="text-6xl font-extrabold tracking-tight mb-4">404</h1>
          <p className="text-lg text-[color:var(--fg-muted)] mb-8">
            This page doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-flex h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-full text-sm font-semibold items-center hover:opacity-90 transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
