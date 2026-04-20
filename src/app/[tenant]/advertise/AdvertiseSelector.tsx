"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SLOT_REQUIREMENTS } from "@/lib/advertising/slot-requirements";

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

const MAX_TOTAL_BYTES = 35 * 1024 * 1024; // leave headroom below Resend's 40MB cap
const MAX_FILES = 5;

export default function AdvertiseSelector({ siteSlug, siteName, creatorName, slots }: Props) {
  // Selection is shared with the slot-detail page's AddToQuoteButton
  // via localStorage under this key. Navigating between pages keeps
  // the advertiser's picks intact.
  const storageKey = `bmd:quote:${siteSlug}`;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Gate for the persist effect. Without it, the persist useEffect
  // fires on first render with the empty initial Set — wiping the
  // stored selection before hydration can populate it, so navigating
  // back from the slot detail page would show everything unchecked.
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount and subscribe to cross-tab changes.
  useEffect(() => {
    const validIds = new Set(slots.map((s) => s.id));
    const read = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
          setHydrated(true);
          return;
        }
        const list: string[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          setSelected(new Set(list.filter((id) => validIds.has(id))));
        }
      } catch {
        // ignore malformed
      } finally {
        setHydrated(true);
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, slots]);

  // Persist selection on every change — but only after hydration so
  // we don't clobber the stored list with an empty Set on first render.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(selected)));
    } catch {
      // storage quota / disabled — silently ignore
    }
  }, [storageKey, selected, hydrated]);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSlots = useMemo(
    () => slots.filter((s) => selected.has(s.id)),
    [slots, selected],
  );

  const totalFileBytes = files.reduce((sum, f) => sum + f.size, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    const combined = [...files, ...picked].slice(0, MAX_FILES);
    const totalSize = combined.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_BYTES) {
      setError(`Files total ${(totalSize / 1024 / 1024).toFixed(1)} MB — limit is 35 MB.`);
      e.target.value = "";
      return;
    }
    setError(null);
    setFiles(combined);
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
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
      const form = new FormData();
      form.set("siteSlug", siteSlug);
      form.set("advertiserEmail", email.trim());
      form.set("advertiserName", name.trim());
      form.set("website", website.trim());
      form.set("businessName", businessName.trim());
      form.set("socialHandle", socialHandle.trim());
      form.set("message", message.trim());
      Array.from(selected).forEach((id) => form.append("slotTypes", id));
      files.forEach((f) => form.append("files", f, f.name));

      const res = await fetch("/api/advertising/enquire", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send");
      } else {
        setSent(true);
        // Clear every trace of the submitted enquiry — shared
        // selection AND in-memory form fields — so a future visit to
        // this page (same tab, same advertiser) doesn't leak contact
        // details into a new request.
        try { localStorage.removeItem(storageKey); } catch { /* noop */ }
        setSelected(new Set());
        setEmail("");
        setName("");
        setWebsite("");
        setBusinessName("");
        setSocialHandle("");
        setMessage("");
        setFiles([]);
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
            {selected.size}
            <span className="text-sm font-normal text-[#56505e]">/{slots.length}</span>
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
          <form onSubmit={submit} className="space-y-5">
            {selected.size > 0 && (
              <div className="bg-[#f7f5f3] border border-[#e5e1da] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-2">Formats in this request</p>
                <ul className="flex flex-wrap gap-2">
                  {selectedSlots.map((slot) => (
                    <li
                      key={slot.id}
                      className="inline-flex items-center gap-2 bg-white border border-[#e5e1da] rounded-full pl-3 pr-1 py-1 text-sm text-[#1a0a2e]"
                    >
                      <span className="font-semibold">{slot.name}</span>
                      <button
                        type="button"
                        onClick={() => toggle(slot.id)}
                        aria-label={`Remove ${slot.name}`}
                        className="w-6 h-6 rounded-full bg-[#f7f5f3] hover:bg-[#e5e1da] flex items-center justify-center transition"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#56505e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Per-slot creative specs — shown only for selected formats so the
                advertiser knows exactly what file / dimensions / duration
                they need to send with the enquiry. */}
            {selectedSlots.length > 0 && (
              <div className="bg-white border border-[#e5e1da] rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#56505e] uppercase tracking-wide">
                  Creative specs for selected formats
                </p>
                <ul className="space-y-3">
                  {selectedSlots.map((slot) => {
                    const req = SLOT_REQUIREMENTS[slot.id];
                    if (!req) return null;
                    return (
                      <li key={slot.id} className="border-l-2 border-[#1a0a2e]/30 pl-3">
                        <p className="text-sm font-bold text-[#1a0a2e]">{slot.name}</p>
                        <dl className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[#56505e]">
                          <div>
                            <dt className="inline font-semibold text-[#1a0a2e]">File:</dt> <dd className="inline">{req.file}</dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold text-[#1a0a2e]">Dimensions:</dt> <dd className="inline">{req.dimensions}</dd>
                          </div>
                          {req.duration && (
                            <div>
                              <dt className="inline font-semibold text-[#1a0a2e]">Duration:</dt> <dd className="inline">{req.duration}</dd>
                            </div>
                          )}
                          {req.maxSizeMB > 0 && (
                            <div>
                              <dt className="inline font-semibold text-[#1a0a2e]">Max size:</dt> <dd className="inline">{req.maxSizeMB} MB</dd>
                            </div>
                          )}
                        </dl>
                        {req.notes && (
                          <p className="text-xs text-[#56505e] mt-1 italic">{req.notes}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Your email"
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
              />
              <Field
                label="Your name"
                optional
                value={name}
                onChange={setName}
                autoComplete="name"
                placeholder="Jane Doe"
              />
              <Field
                label="Business name"
                optional
                value={businessName}
                onChange={setBusinessName}
                placeholder="Your company"
              />
              <Field
                label="Website"
                optional
                value={website}
                onChange={setWebsite}
                placeholder="https://"
                type="url"
                autoComplete="url"
              />
              <Field
                label="Social handle"
                optional
                value={socialHandle}
                onChange={setSocialHandle}
                placeholder="@yourbrand"
              />
            </div>

            {/* File upload — the creative itself */}
            <div>
              <label className="block text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1.5">
                Creative files <span className="normal-case text-[#56505e]/60 font-normal">(optional — images or videos)</span>
              </label>
              <div className="border-2 border-dashed border-[#e5e1da] rounded-xl p-4 bg-[#f7f5f3]">
                <input
                  id="ad-files"
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*"
                  onChange={onFileChange}
                  className="block w-full text-sm text-[#56505e] file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#1a0a2e] file:text-white file:text-sm file:font-semibold file:cursor-pointer file:hover:opacity-90"
                />
                {files.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between bg-white border border-[#e5e1da] rounded-lg px-3 py-1.5 text-xs">
                        <span className="truncate text-[#1a0a2e]">{f.name}</span>
                        <span className="shrink-0 flex items-center gap-3 text-[#56505e]">
                          <span>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            aria-label={`Remove ${f.name}`}
                            className="text-[#56505e] hover:text-[#1a0a2e]"
                          >
                            ×
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-[#56505e] mt-2">
                  Up to {MAX_FILES} files, 35 MB combined. Attach the creative you want to run — {creatorName} sees it before quoting. Using {(totalFileBytes / 1024 / 1024).toFixed(1)} MB.
                </p>
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

// Small field helper to keep the form body readable.
function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  optional,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#56505e] uppercase tracking-wide mb-1.5">
        {label}{" "}
        {optional && !required && (
          <span className="normal-case text-[#56505e]/60 font-normal">(optional)</span>
        )}
      </label>
      <input
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 px-3 rounded-lg border border-[#e5e1da] bg-[#f7f5f3] focus:bg-white focus:border-[#1a0a2e] outline-none transition"
      />
    </div>
  );
}
