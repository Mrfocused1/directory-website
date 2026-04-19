"use client";

import { useState, useRef, useCallback } from "react";

// Slots that don't need a creative asset upload
const TEXT_ONLY_SLOTS = new Set(["sticky_ribbon", "promoted_category"]);

// Accepted file types per slot (shown in the file input)
const SLOT_ACCEPT: Record<string, string> = {
  pre_roll_video: "video/mp4,video/webm",
  mid_roll_video: "video/mp4,video/webm",
  pre_roll_audio: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a",
  pre_roll_image: "image/jpeg,image/png,image/webp",
  banner_top: "image/jpeg,image/png,image/webp",
  post_view_overlay: "image/jpeg,image/png,image/webp",
  sidebar_card: "image/jpeg,image/png,image/webp",
  homepage_takeover: "image/jpeg,image/png,image/webp",
  sponsored_reference: "image/jpeg,image/png,image/webp",
};

const SLOT_ACCEPT_LABEL: Record<string, string> = {
  pre_roll_video: "MP4 or WebM video, max 50 MB",
  mid_roll_video: "MP4 or WebM video, max 50 MB",
  pre_roll_audio: "MP3, WAV, or M4A audio, max 20 MB",
  pre_roll_image: "JPG, PNG, or WebP image, max 10 MB",
  banner_top: "JPG, PNG, or WebP image, max 10 MB",
  post_view_overlay: "JPG, PNG, or WebP image, max 10 MB",
  sidebar_card: "JPG, PNG, or WebP image, max 10 MB",
  homepage_takeover: "JPG, PNG, or WebP image, max 10 MB",
  sponsored_reference: "JPG, PNG, or WebP image, max 10 MB",
};

type Props = {
  siteId: string;
  slug: string;
  slotType: string;
  slotName: string;
  pricePerWeekCents: number;
  minWeeks: number;
  maxWeeks: number;
};

type FieldErrors = Partial<Record<string, string>>;

function formatGBP(cents: number) {
  return `£${(cents / 100).toFixed(2)}`;
}

export default function AdBuyForm({
  siteId,
  slug,
  slotType,
  slotName,
  pricePerWeekCents,
  minWeeks,
  maxWeeks,
}: Props) {
  const isTextOnly = TEXT_ONLY_SLOTS.has(slotType);

  const [advertiserName, setAdvertiserName] = useState("");
  const [advertiserEmail, setAdvertiserEmail] = useState("");
  const [advertiserWebsite, setAdvertiserWebsite] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [weeks, setWeeks] = useState(minWeeks);
  const [assetUrl, setAssetUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const totalCents = pricePerWeekCents * weeks;
  const creatorCents = Math.floor(totalCents * 0.9);
  const platformCents = totalCents - creatorCents;

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadError("");
      setAssetUrl("");
      setUploading(true);

      const fd = new FormData();
      fd.append("file", file);
      fd.append("siteId", siteId);
      fd.append("slotType", slotType);

      try {
        const res = await fetch("/api/advertising/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setUploadError(data.error || "Upload failed. Please try again.");
          if (fileRef.current) fileRef.current.value = "";
        } else {
          setAssetUrl(data.url);
        }
      } catch {
        setUploadError("Network error. Please try again.");
        if (fileRef.current) fileRef.current.value = "";
      } finally {
        setUploading(false);
      }
    },
    [siteId, slotType],
  );

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!advertiserName.trim()) errors.advertiserName = "Required";
    if (!advertiserEmail.trim()) errors.advertiserEmail = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(advertiserEmail))
      errors.advertiserEmail = "Enter a valid email address";
    if (!headline.trim()) errors.headline = "Required";
    if (headline.length > 40) errors.headline = "Max 40 characters";
    if (body.length > 120) errors.body = "Max 120 characters";
    if (!clickUrl.trim()) errors.clickUrl = "Required";
    else {
      try {
        const url = new URL(clickUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:")
          errors.clickUrl = "Must be a valid http(s) URL";
      } catch {
        errors.clickUrl = "Must be a valid URL (e.g. https://example.com)";
      }
    }
    if (!isTextOnly && !assetUrl) errors.assetUrl = "Creative asset required";
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/advertising/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          slotType,
          weeks,
          advertiser: {
            name: advertiserName.trim(),
            email: advertiserEmail.trim(),
            website: advertiserWebsite.trim() || undefined,
          },
          creative: {
            headline: headline.trim(),
            body: body.trim() || undefined,
            clickUrl: clickUrl.trim(),
            assetUrl: assetUrl || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        return;
      }
      if (data.ok) {
        window.location.href = `/${slug}/advertise/request-sent`;
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isFormReady =
    advertiserName.trim() &&
    advertiserEmail.trim() &&
    headline.trim() &&
    clickUrl.trim() &&
    (isTextOnly || assetUrl) &&
    !uploading &&
    !submitting;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="lg:col-span-2 space-y-6"
      >
        {/* Advertiser details */}
        <section className="bg-white border border-[#e5e1da] rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-[#1a0a2e]">Your details</h2>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="adv-name">
              Full name or business name <span className="text-red-500">*</span>
            </label>
            <input
              id="adv-name"
              type="text"
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#d5d1ca] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a0a2e]/20"
              placeholder="Acme Ltd"
            />
            {fieldErrors.advertiserName && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.advertiserName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="adv-email">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="adv-email"
              type="email"
              value={advertiserEmail}
              onChange={(e) => setAdvertiserEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#d5d1ca] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a0a2e]/20"
              placeholder="you@company.com"
            />
            {fieldErrors.advertiserEmail && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.advertiserEmail}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="adv-website">
              Website <span className="text-[#9ca3af] font-normal">(optional)</span>
            </label>
            <input
              id="adv-website"
              type="url"
              value={advertiserWebsite}
              onChange={(e) => setAdvertiserWebsite(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#d5d1ca] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a0a2e]/20"
              placeholder="https://www.example.com"
            />
          </div>
        </section>

        {/* Creative */}
        <section className="bg-white border border-[#e5e1da] rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-[#1a0a2e]">Ad creative</h2>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="headline">
              Headline <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-[#9ca3af]">{headline.length}/40</span>
            </label>
            <input
              id="headline"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value.slice(0, 40))}
              maxLength={40}
              className="w-full h-10 px-3 rounded-lg border border-[#d5d1ca] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a0a2e]/20"
              placeholder="Short, punchy headline"
            />
            {fieldErrors.headline && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.headline}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="body">
              Body copy <span className="text-[#9ca3af] font-normal">(optional)</span>
              <span className="ml-2 text-xs font-normal text-[#9ca3af]">{body.length}/120</span>
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 120))}
              maxLength={120}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#d5d1ca] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a0a2e]/20 resize-none"
              placeholder="Supporting message (optional)"
            />
            {fieldErrors.body && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.body}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="click-url">
              Click URL <span className="text-red-500">*</span>
            </label>
            <input
              id="click-url"
              type="url"
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#d5d1ca] text-sm focus:outline-none focus:ring-2 focus:ring-[#1a0a2e]/20"
              placeholder="https://www.yoursite.com/landing"
            />
            {fieldErrors.clickUrl && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.clickUrl}</p>
            )}
          </div>

          {/* Asset upload */}
          {!isTextOnly && (
            <div>
              <label className="block text-sm font-semibold mb-1">
                Creative asset <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-[#56505e] mb-2">{SLOT_ACCEPT_LABEL[slotType]}</p>
              <div className="flex items-start gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept={SLOT_ACCEPT[slotType] || ""}
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="block text-sm text-[#56505e] file:mr-3 file:h-8 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#1a0a2e] file:text-white hover:file:opacity-80 file:cursor-pointer"
                />
                {uploading && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#56505e]">
                    <span className="w-3.5 h-3.5 border-2 border-[#1a0a2e]/30 border-t-[#1a0a2e] rounded-full animate-spin" />
                    Uploading…
                  </span>
                )}
                {assetUrl && !uploading && (
                  <span className="text-xs text-green-600 font-semibold">Uploaded</span>
                )}
              </div>
              {uploadError && (
                <p className="text-xs text-red-500 mt-1">{uploadError}</p>
              )}
              {fieldErrors.assetUrl && !assetUrl && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.assetUrl}</p>
              )}
            </div>
          )}
        </section>

        {/* Duration */}
        <section className="bg-white border border-[#e5e1da] rounded-2xl p-6">
          <h2 className="text-base font-bold text-[#1a0a2e] mb-4">Duration</h2>
          <label className="block text-sm font-semibold mb-2">
            Number of weeks
            <span className="ml-2 text-xs font-normal text-[#9ca3af]">
              ({minWeeks}–{maxWeeks} weeks)
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setWeeks((w) => Math.max(minWeeks, w - 1))}
              disabled={weeks <= minWeeks}
              className="w-9 h-9 rounded-full border border-[#d5d1ca] text-lg font-bold flex items-center justify-center hover:bg-[#f7f5f3] disabled:opacity-40 transition"
            >
              -
            </button>
            <span className="text-xl font-extrabold w-8 text-center">{weeks}</span>
            <button
              type="button"
              onClick={() => setWeeks((w) => Math.min(maxWeeks, w + 1))}
              disabled={weeks >= maxWeeks}
              className="w-9 h-9 rounded-full border border-[#d5d1ca] text-lg font-bold flex items-center justify-center hover:bg-[#f7f5f3] disabled:opacity-40 transition"
            >
              +
            </button>
          </div>
        </section>

        {submitError && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={!isFormReady}
          className="w-full h-12 bg-[#1a0a2e] text-white font-bold rounded-full text-sm hover:opacity-90 transition disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending request...
            </>
          ) : (
            "Send request for approval"
          )}
        </button>

        <p className="text-xs text-[#56505e] text-center">
          The creator reviews your creative first. <strong>No payment is taken yet.</strong> Once approved, we&apos;ll email you a secure Stripe link to pay {formatGBP(totalCents)} and your ad will go live.
        </p>
      </form>

      {/* Order summary sidebar */}
      <aside className="lg:col-span-1">
        <div className="bg-white border border-[#e5e1da] rounded-2xl p-6 sticky top-6">
          <h2 className="text-base font-bold text-[#1a0a2e] mb-4">Order summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#56505e]">{slotName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#56505e]">
                {formatGBP(pricePerWeekCents)} &times; {weeks} week{weeks !== 1 ? "s" : ""}
              </span>
              <span className="font-semibold">{formatGBP(totalCents)}</span>
            </div>
          </div>
          <div className="border-t border-[#e5e1da] mt-4 pt-4">
            <div className="flex justify-between text-base font-extrabold">
              <span>Total</span>
              <span>{formatGBP(totalCents)}</span>
            </div>
            <p className="text-xs text-[#56505e] mt-2">
              {formatGBP(creatorCents)} goes to the creator &middot; {formatGBP(platformCents)} platform fee
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#56505e]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Secured by Stripe
          </div>
        </div>
      </aside>
    </div>
  );
}
