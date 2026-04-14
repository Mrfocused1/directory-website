"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">Something went wrong</h1>
          <p className="text-sm text-[color:var(--fg-muted)] mb-8 max-w-md mx-auto">
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold items-center hover:opacity-90 transition"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
