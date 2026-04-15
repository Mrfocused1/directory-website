"use client";

import { useState, useEffect } from "react";

type Props = {
  siteId: string;
  siteSlug: string;
  initialBrand: string;
  initialUrl: string;
};

/**
 * Per-site white-label branding settings.
 * Lets Agency-plan customers customise the "Powered by" footer
 * shown on their tenant directory pages.
 */
export default function WhiteLabelSettings({ siteId, siteSlug, initialBrand, initialUrl }: Props) {
  const [brand, setBrand] = useState(initialBrand);
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setBrand(initialBrand);
    setUrl(initialUrl);
  }, [initialBrand, initialUrl, siteId]);

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
          whiteLabelBrand: brand.trim() || null,
          whiteLabelUrl: url.trim() || null,
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
      setError("Network error.");
    }
  };

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-bold">White-label branding</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
          Agency
        </span>
      </div>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
        Replace the &quot;Powered by BuildMy.Directory&quot; footer on your directory with your own brand.
      </p>

      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="wl-brand" className="text-xs font-semibold mb-1.5 block">
            Brand name
          </label>
          <input
            id="wl-brand"
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={64}
            placeholder="e.g. Acme Media"
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />
        </div>

        <div>
          <label htmlFor="wl-url" className="text-xs font-semibold mb-1.5 block">
            Brand website (optional)
          </label>
          <input
            id="wl-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://acmemedia.com"
            className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          />
          <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
            Clicking your brand name will link here. Leave blank for plain text.
          </p>
        </div>

        {/* Preview */}
        <div className="bg-black/[0.03] rounded-lg px-4 py-3 text-center text-xs text-[color:var(--fg-subtle)]">
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 opacity-60">
            Preview on buildmy.directory/{siteSlug}
          </div>
          <div>
            Powered by{" "}
            <span className="font-semibold text-[color:var(--fg-muted)]">
              {brand || "BuildMy.Directory"}
            </span>
          </div>
        </div>

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full h-10 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save branding"}
        </button>
      </form>
    </div>
  );
}
