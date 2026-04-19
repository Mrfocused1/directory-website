import Link from "next/link";

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ slotType?: string }> };

export default async function AdvertiseCancelledPage({ params, searchParams }: Props) {
  const { tenant } = await params;
  const { slotType } = await searchParams;

  const backHref = slotType
    ? `/${tenant}/advertise/${slotType}`
    : `/${tenant}/advertise`;

  return (
    <div className="min-h-screen bg-[#f7f5f3] flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white border border-[#e5e1da] rounded-2xl p-8 text-center">
        <div className="w-14 h-14 bg-[#f7f5f3] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#56505e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[#1a0a2e] mb-2">Order cancelled</h1>
        <p className="text-sm text-[#56505e] mb-6">
          No payment was taken. You can go back and try again whenever you&apos;re ready.
        </p>
        <Link
          href={backHref}
          className="inline-flex h-10 items-center px-6 bg-[#1a0a2e] text-white text-sm font-semibold rounded-full hover:opacity-90 transition"
        >
          Back to ad slots
        </Link>
      </div>
    </div>
  );
}
