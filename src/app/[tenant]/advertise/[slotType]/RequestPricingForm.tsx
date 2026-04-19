"use client";

import { useState } from "react";

type Props = {
  siteSlug: string;
  slotType: string;
  slotName: string;
  siteName: string;
};

export default function RequestPricingForm({ siteSlug, slotType, slotName, siteName }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState(
    `Hi — I'd like to advertise on ${siteName}. Could you share pricing and booking availability for the ${slotName} format?\n\nA little about us:\n`,
  );
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/advertising/enquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug,
          slotType,
          advertiserEmail: email.trim(),
          advertiserName: name.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <section className="bg-white border border-[#e5e1da] rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="font-bold text-[#1a0a2e] text-lg mb-1">Enquiry sent</p>
        <p className="text-sm text-[#56505e] max-w-sm mx-auto">
          We&apos;ve forwarded your message to the creator. They&apos;ll reply from their own inbox with pricing and next steps.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-[#e5e1da] rounded-2xl p-6 sm:p-8">
      <p className="text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1">Request pricing</p>
      <h2 className="text-xl font-bold text-[#1a0a2e] mb-4">
        Get pricing and availability for {slotName}
      </h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1.5">
              Your email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full h-11 px-3 rounded-lg border border-[#e5e1da] bg-[#f7f5f3] focus:bg-white focus:border-[#1a0a2e] outline-none transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1.5">
              Your name <span className="normal-case text-[#56505e]/60 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full h-11 px-3 rounded-lg border border-[#e5e1da] bg-[#f7f5f3] focus:bg-white focus:border-[#1a0a2e] outline-none transition"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1.5">
            Message
          </label>
          <textarea
            required
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-[#e5e1da] bg-[#f7f5f3] focus:bg-white focus:border-[#1a0a2e] outline-none transition font-sans text-sm leading-relaxed resize-y"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-[#56505e]">
            Goes straight to the creator. Replies land in your inbox.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center h-11 px-6 bg-[#1a0a2e] text-white text-sm font-semibold rounded-full hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send enquiry"}
          </button>
        </div>
      </form>
    </section>
  );
}
