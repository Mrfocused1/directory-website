"use client";

import { useState } from "react";
import Link from "next/link";

export type SelectorSlot = {
  id: string;
  name: string;
  tagline: string;
  copy: string;
};

type Props = {
  siteSlug: string;
  siteName: string;
  creatorName: string;
  slots: SelectorSlot[];
};

export default function AdvertiseSelector({ siteSlug, siteName, creatorName, slots }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one format above.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/advertising/enquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug,
          slotTypes: Array.from(selected),
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

  if (slots.length === 0) {
    return (
      <div className="bg-white border border-[#e5e1da] rounded-2xl p-10 text-center">
        <p className="text-lg font-bold text-[#1a0a2e] mb-2">Ad formats coming soon</p>
        <p className="text-sm text-[#56505e] max-w-md mx-auto">
          {creatorName} hasn&apos;t opened any ad formats on this directory yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1a0a2e]">Available formats</h2>
          <p className="text-sm text-[#56505e] mt-1">
            Tap any format to add it to your quote request, then submit the form below.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-[#56505e] uppercase tracking-wide font-semibold">Selected</p>
          <p className="text-2xl font-extrabold text-[#1a0a2e] leading-none mt-1">
            {selected.size}<span className="text-sm font-normal text-[#56505e]">/{slots.length}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {slots.map((slot) => {
          const isSelected = selected.has(slot.id);
          return (
            <div
              key={slot.id}
              className={
                "rounded-2xl p-5 flex flex-col gap-3 border-2 transition " +
                (isSelected
                  ? "bg-[#1a0a2e] border-[#1a0a2e] text-white"
                  : "bg-white border-[#e5e1da] text-[#1a0a2e]")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{slot.name}</p>
                  <p className={"text-sm mt-0.5 " + (isSelected ? "text-white/70" : "text-[#56505e]")}>
                    {slot.tagline}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(slot.id)}
                  aria-pressed={isSelected}
                  aria-label={isSelected ? `Remove ${slot.name} from quote` : `Add ${slot.name} to quote`}
                  className={
                    "shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition " +
                    (isSelected
                      ? "bg-[#d3fd74] border-[#d3fd74]"
                      : "bg-white border-[#c9c3ba] hover:border-[#1a0a2e]")
                  }
                >
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a0a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </div>
              <p className={"text-xs leading-relaxed line-clamp-3 " + (isSelected ? "text-white/80" : "text-[#56505e]")}>
                {slot.copy}
              </p>
              <div className="flex items-center justify-between mt-auto pt-2">
                <p className={"text-sm font-semibold " + (isSelected ? "text-white" : "text-[#1a0a2e]")}>
                  Pricing on request
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/${siteSlug}/advertise/${slot.id}`}
                    className={
                      "text-sm underline underline-offset-4 transition " +
                      (isSelected ? "text-white/80 hover:text-white" : "text-[#56505e] hover:text-[#1a0a2e]")
                    }
                  >
                    Preview
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(slot.id)}
                    className={
                      "inline-flex items-center h-9 px-5 text-sm font-semibold rounded-full transition " +
                      (isSelected
                        ? "bg-[#d3fd74] text-[#1a0a2e] hover:opacity-90"
                        : "bg-[#1a0a2e] text-white hover:opacity-90")
                    }
                  >
                    {isSelected ? "Added" : "Request quote"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk enquiry form */}
      <section
        id="quote-form"
        className="mt-12 bg-white border border-[#e5e1da] rounded-2xl p-6 sm:p-8 scroll-mt-8"
      >
        <p className="text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1">Your quote request</p>
        <h2 className="text-xl font-bold text-[#1a0a2e] mb-5">
          {selected.size === 0
            ? `Select formats above, then send ${creatorName} one request`
            : `Request pricing for ${selected.size} format${selected.size === 1 ? "" : "s"} on ${siteName}`}
        </h2>

        {sent ? (
          <div className="bg-[#f7f5f3] border border-[#e5e1da] rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="font-bold text-[#1a0a2e]">Sent to {creatorName}</p>
            <p className="text-sm text-[#56505e] mt-1 max-w-sm mx-auto">
              They&apos;ll reply straight to your inbox with pricing, availability and scheduling options.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {selected.size > 0 && (
              <div className="bg-[#f7f5f3] border border-[#e5e1da] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-2">Formats in this request</p>
                <ul className="flex flex-wrap gap-2">
                  {Array.from(selected).map((id) => {
                    const slot = slots.find((s) => s.id === id);
                    if (!slot) return null;
                    return (
                      <li
                        key={id}
                        className="inline-flex items-center gap-2 bg-white border border-[#e5e1da] rounded-full pl-3 pr-1 py-1 text-sm text-[#1a0a2e]"
                      >
                        <span className="font-semibold">{slot.name}</span>
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          aria-label={`Remove ${slot.name}`}
                          className="w-6 h-6 rounded-full bg-[#f7f5f3] hover:bg-[#e5e1da] flex items-center justify-center transition"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#56505e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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
                Message <span className="normal-case text-[#56505e]/60 font-normal">(dates, duration, brand, budget)</span>
              </label>
              <textarea
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Dates you'd like to run the ad, campaign length, which brand you're promoting, any questions…`}
                className="w-full px-3 py-2.5 rounded-lg border border-[#e5e1da] bg-[#f7f5f3] focus:bg-white focus:border-[#1a0a2e] outline-none transition font-sans text-sm leading-relaxed resize-y"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
              <p className="text-xs text-[#56505e]">Goes straight to the creator. Replies land in your inbox.</p>
              <button
                type="submit"
                disabled={submitting || selected.size === 0}
                className="inline-flex items-center h-11 px-6 bg-[#1a0a2e] text-white text-sm font-semibold rounded-full hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending…" : "Send quote request"}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
