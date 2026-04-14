"use client";

import { useEffect, useState } from "react";

type Props = {
  siteId: string;
  initialFromName: string;
  initialReplyTo: string;
};

/**
 * Per-site newsletter sender settings.
 * Lets the creator customise:
 *  - From name (display label on the sender line)
 *  - Reply-to email (where subscribers' replies land)
 *
 * Stored on the sites row (newsletterFromName, newsletterReplyTo).
 * Falls back to site display name and the creator's auth email if unset.
 */
export default function SenderSettings({ siteId, initialFromName, initialReplyTo }: Props) {
  const [fromName, setFromName] = useState(initialFromName);
  const [replyTo, setReplyTo] = useState(initialReplyTo);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setFromName(initialFromName);
    setReplyTo(initialReplyTo);
  }, [initialFromName, initialReplyTo, siteId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/sites?id=${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsletterFromName: fromName.trim() || null,
          newsletterReplyTo: replyTo.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data?.error || "Failed to save");
      }
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  };

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">Sender settings</h3>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
        Customise how your digest emails appear in subscribers&apos; inboxes.
      </p>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="from-name" className="text-xs font-semibold mb-1.5 block">
            From name
          </label>
          <input
            id="from-name"
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            maxLength={64}
            placeholder="e.g. Your Directory Weekly"
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />
          <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
            Shown as &quot;<strong>{fromName || "Your site name"}</strong> &lt;hello@buildmy.directory&gt;&quot;
          </p>
        </div>

        <div>
          <label htmlFor="reply-to" className="text-xs font-semibold mb-1.5 block">
            Reply-to email
          </label>
          <input
            id="reply-to"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            maxLength={320}
            placeholder="you@yourdomain.com"
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />
          <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
            Where replies to your digest emails go. Defaults to your account email if blank.
          </p>
        </div>

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full h-10 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
