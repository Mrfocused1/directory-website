"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";
import SlotDemo, { type DemoSite, type DemoPost } from "@/components/advertising/SlotDemo";
import { SLOT_TYPES, getSlotType } from "@/lib/advertising/slot-types";
import { SLOT_COPY } from "@/lib/advertising/slot-copy";

type Site = { id: string; slug: string; displayName: string | null; avatarUrl: string | null; accentColor?: string };
type SlotConfig = {
  id: string | null;
  siteId: string;
  slotType: string;
  enabled: boolean;
  pricePerWeekCents: number;
  minWeeks: number;
  maxWeeks: number;
};

const FALLBACK_DEMO_SITE: DemoSite = {
  slug: "my-directory",
  displayName: "My Directory",
  avatarUrl: null,
  accentColor: "#6366f1",
};

export default function SlotConfigPage() {
  const params = useParams<{ slotType: string }>();
  const router = useRouter();
  const slotDef = getSlotType(params.slotType);

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [config, setConfig] = useState<SlotConfig | null>(null);
  const [demoSite, setDemoSite] = useState<DemoSite>(FALLBACK_DEMO_SITE);
  const [demoPosts, setDemoPosts] = useState<DemoPost[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state
  const [priceInput, setPriceInput] = useState("");
  const [minWeeks, setMinWeeks] = useState(1);
  const [maxWeeks, setMaxWeeks] = useState(52);
  const [enabled, setEnabled] = useState(false);

  // 404 for unrecognised slot types
  useEffect(() => {
    if (!slotDef) router.replace("/dashboard/advertising");
  }, [slotDef, router]);

  // Load creator's sites on mount
  useEffect(() => {
    async function loadSites() {
      const res = await fetch("/api/sites").catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      const list: Site[] = (data.sites ?? data ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        slug: s.slug as string,
        displayName: s.displayName as string | null,
        avatarUrl: s.avatarUrl as string | null,
        accentColor: (s.accentColor as string) ?? "#000000",
      }));
      setSites(list);
      if (list.length > 0) setSelectedSiteId(list[0].id);
    }
    loadSites();
  }, []);

  // Load slot config + sample content whenever site changes
  useEffect(() => {
    if (!selectedSiteId || !slotDef) return;
    setLoadingConfig(true);

    Promise.all([
      fetch(`/api/advertising/slots?siteId=${selectedSiteId}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/advertising/sample-content?siteId=${selectedSiteId}`).then((r) => r.json()).catch(() => null),
    ]).then(([slotsData, contentData]) => {
      if (slotsData?.slots) {
        const found: SlotConfig | undefined = slotsData.slots.find(
          (s: SlotConfig) => s.slotType === slotDef.id,
        );
        if (found) {
          setConfig(found);
          setPriceInput(((found.pricePerWeekCents ?? slotDef.defaultPriceCents) / 100).toFixed(2));
          setMinWeeks(found.minWeeks);
          setMaxWeeks(found.maxWeeks);
          setEnabled(found.enabled);
        }
      }
      if (contentData?.site) {
        setDemoSite({
          slug: contentData.site.slug,
          displayName: contentData.site.displayName ?? contentData.site.slug,
          avatarUrl: contentData.site.avatarUrl ?? null,
          accentColor: contentData.site.accentColor ?? "#6366f1",
        });
        setDemoPosts(contentData.posts ?? []);
      }
      setLoadingConfig(false);
    });
  }, [selectedSiteId, slotDef]);

  async function handleSave() {
    if (!selectedSiteId || !slotDef) return;
    setSaving(true);
    setError(null);
    const priceCents = Math.round(parseFloat(priceInput || "0") * 100);
    const res = await fetch("/api/advertising/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: selectedSiteId,
        slotType: slotDef.id,
        enabled,
        pricePerWeekCents: priceCents || slotDef.defaultPriceCents,
        minWeeks,
        maxWeeks,
      }),
    }).catch(() => null);

    if (res?.ok) {
      const data = await res.json();
      setConfig(data.slot);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError("Failed to save. Please try again.");
    }
    setSaving(false);
  }

  if (!slotDef) return null;

  const isComingSoon = slotDef.status === "coming_soon";

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main id="main" className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-24">
          {/* Back link */}
          <Link
            href="/dashboard/advertising"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition mb-6"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Ad slots
          </Link>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">{slotDef.name}</h1>
                <p className="text-sm text-[color:var(--fg-muted)] mt-1">{slotDef.tagline}</p>
              </div>
              {isComingSoon && (
                <span className="shrink-0 mt-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                  Coming soon
                </span>
              )}
            </div>
          </div>

          {/* Coming-soon banner */}
          {isComingSoon && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
              <span className="font-semibold">Coming in Phase 5</span> — you can configure pricing now and it will activate automatically when the renderer ships. Your settings are saved.
            </div>
          )}

          {/* Site selector */}
          {sites.length > 1 && (
            <div className="mb-6">
              <label className="block text-xs font-semibold text-[color:var(--fg-muted)] uppercase tracking-wide mb-1.5">
                Site
              </label>
              <select
                value={selectedSiteId ?? ""}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="h-10 px-3 rounded-lg border border-[color:var(--border)] bg-white text-sm w-full sm:w-auto"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName ?? s.slug}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Demo preview */}
          <div className="bg-white border border-[color:var(--border)] rounded-2xl p-6 mb-6 overflow-hidden">
            <p className="text-xs font-semibold text-[color:var(--fg-muted)] uppercase tracking-wide mb-4">
              Live preview — your site&apos;s content
            </p>
            {loadingConfig ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <SlotDemo slotType={slotDef.id} site={demoSite} samplePosts={demoPosts} />
            )}
          </div>

          {/* Explainer */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-900 leading-relaxed">{SLOT_COPY[slotDef.id]}</p>
          </div>

          {/* Config form */}
          <div className="bg-white border border-[color:var(--border)] rounded-2xl p-6 space-y-6">
            <fieldset disabled={isComingSoon} className="space-y-6 disabled:opacity-60">
              {/* Price */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--fg-muted)] uppercase tracking-wide mb-1.5">
                  Price per week ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--fg-muted)] text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="h-10 pl-7 pr-3 rounded-lg border border-[color:var(--border)] bg-white text-sm w-40"
                    placeholder={((slotDef.defaultPriceCents ?? 1000) / 100).toFixed(2)}
                  />
                </div>
              </div>

              {/* Min / max weeks */}
              <div className="flex gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--fg-muted)] uppercase tracking-wide mb-1.5">
                    Min weeks
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={maxWeeks}
                    value={minWeeks}
                    onChange={(e) => setMinWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-10 px-3 rounded-lg border border-[color:var(--border)] bg-white text-sm w-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--fg-muted)] uppercase tracking-wide mb-1.5">
                    Max weeks
                  </label>
                  <input
                    type="number"
                    min={minWeeks}
                    value={maxWeeks}
                    onChange={(e) => setMaxWeeks(Math.max(minWeeks, parseInt(e.target.value) || 52))}
                    className="h-10 px-3 rounded-lg border border-[color:var(--border)] bg-white text-sm w-24"
                  />
                </div>
              </div>

              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Enable this slot</p>
                  <p className="text-xs text-[color:var(--fg-muted)] mt-0.5">
                    Advertisers can purchase this slot when enabled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-black/15"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : ""}`}
                  />
                </button>
              </div>
            </fieldset>

            {/* Save button */}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedSiteId}
              className="h-10 px-6 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-full text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : saved ? (
                "Saved!"
              ) : (
                "Save configuration"
              )}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
