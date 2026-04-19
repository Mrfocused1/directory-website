import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request sent",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ tenant: string }> };

export default async function RequestSentPage({ params }: Props) {
  const { tenant } = await params;
  return (
    <div className="min-h-screen bg-[#f7f5f3] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white border border-[#e5e1da] rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l3 3" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-[#1a0a2e] mb-2">Request sent</h1>
          <p className="text-[#56505e] leading-relaxed mb-6">
            The creator will review your creative within <strong>48 hours</strong>. If they approve, we&apos;ll email you a secure Stripe link to complete payment. <strong>No money has been taken.</strong>
          </p>
          <Link href={`/${tenant}`} className="inline-block text-sm font-semibold text-[#1a0a2e] underline">
            Back to the directory
          </Link>
        </div>
        <p className="text-xs text-[#56505e] text-center mt-6">
          Questions? Email{" "}
          <a href="mailto:hello@buildmy.directory" className="underline">
            hello@buildmy.directory
          </a>
        </p>
      </div>
    </div>
  );
}
