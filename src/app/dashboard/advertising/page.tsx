"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { SLOT_TYPES, type SlotType } from "@/lib/advertising/slot-types";

type StripeStatus = {
  hasAccount: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingUrl?: string;
};

type Earnings = {
  totalEarningsCents: number;
  activeAdsCount: number;
  impressions30d: number;
  clicks30d: number;
};

type Site = { id: string; slug: string; displayName: string | null };

type SlotRow = {
  slotType: string;
  enabled: boolean;
  pricePerWeekCents: number;
};

type PendingAd = {
  id: string;
  slotType: string;
  advertiserName: string | null;
  advertiserEmail: string;
  amountCents: number;
  creatorAmountCents: number;
  headline: string | null;
  assetUrl: string | null;
  status: string;
};

// Inline SVG icons keyed by iconName
function SlotIcon({ iconName, accentColor }: { iconName: string; accentColor?: string }) {
  const color = accentColor ?? "currentColor";
  const icons: Record<string, React.ReactNode> = {
    video: <path d="M15 10l-8 4.5V5.5L15 10zM2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke={color} strokeWidth="1.5" /><circle cx="8.5" cy="8.5" r="1.5" fill={color} /><path d="M21 15l-5-5L5 21" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></>,
    audio: <><path d="M9 18V5l12-2v13" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /><circle cx="6" cy="18" r="3" fill="none" stroke={color} strokeWidth="1.5" /><circle cx="18" cy="16" r="3" fill="none" stroke={color} strokeWidth="1.5" /></>,
    film: <><rect x="2" y="2" width="20" height="20" rx="2.18" fill="none" stroke={color} strokeWidth="1.5" /><line x1="7" y1="2" x2="7" y2="22" stroke={color} strokeWidth="1.5" /><line x1="17" y1="2" x2="17" y2="22" stroke={color} strokeWidth="1.5" /><line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="1.5" /></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /><polyline points="2 17 12 22 22 17" fill="none" stroke={color} strokeWidth="1.5" /><polyline points="2 12 12 17 22 12" fill="none" stroke={color} strokeWidth="1.5" /></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke={color} strokeWidth="1.5" /><line x1="7" y1="7" x2="7.01" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" /></>,
    link: <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></>,
    layout: <><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke={color} strokeWidth="1.5" /><path d="M3 9h18" stroke={color} strokeWidth="1.5" /><path d="M9 21V9" stroke={color} strokeWidth="1.5" /></>,
    minus: <line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />,
    sidebar: <><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke={color} strokeWidth="1.5" /><path d="M9 3v18" stroke={color} strokeWidth="1.5" /></>,
    maximize: <><path d="M8 3H5a2 2 0 00-2 2v3" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /><path d="M21 8V5a2 2 0 00-2-2h-3" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /><path d="M3 16v3a2 2 0 002 2h3" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /><path d="M16 21h3a2 2 0 002-2v-3" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></>,
  };

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      {icons[iconName] ?? <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  );
}

function fmtMoney(cents: number) {
  if (cents >= 100000) return `$${(cents / 100000).toFixed(1)}k`;
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function AdvertisingPage() {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [pendingAds, setPendingAds] = useState<PendingAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [adActionLoading, setAdActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [statusRes, earningsRes, sitesRes] = await Promise.all([
        fetch("/api/advertising/stripe/status").catch(() => null),
        fetch("/api/advertising/earnings").catch(() => null),
        fetch("/api/sites").catch(() => null),
      ]);
      if (statusRes?.ok) setStatus(await statusRes.json());
      if (earningsRes?.ok) setEarnings(await earningsRes.json());
      if (sitesRes?.ok) {
        const data = await sitesRes.json();
        const list: Site[] = (data.sites ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          slug: s.slug as string,
          displayName: s.displayName as string | null,
        }));
        setSites(list);
        if (list.length > 0) setSelectedSiteId(list[0].id);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedSiteId) return;
    fetch(`/api/advertising/slots?siteId=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]));

    // Fetch pending ads for the selected site
    fetch(`/api/advertising/ads?siteId=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data) => {
        const all: PendingAd[] = (data.ads ?? []).map((a: Record<string, unknown>) => ({
          id: a.id,
          slotType: a.slotType,
          advertiserName: a.advertiserName,
          advertiserEmail: a.advertiserEmail,
          amountCents: a.amountCents,
          creatorAmountCents: a.creatorAmountCents,
          headline: a.headline,
          assetUrl: a.assetUrl,
          status: a.status,
        }));
        setPendingAds(
          all.filter(
            (a) => a.status === "pending_approval" || a.status === "pending_review",
          ),
        );
      })
      .catch(() => setPendingAds([]));
  }, [selectedSiteId]);

  const handleApprove = useCallback(async (adId: string) => {
    setAdActionLoading(adId);
    try {
      const res = await fetch(`/api/advertising/ads/${adId}/approve`, { method: "POST" });
      if (res.ok) {
        setPendingAds((prev) => prev.filter((a) => a.id !== adId));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to approve ad");
      }
    } catch {
      alert("Network error — please try again");
    } finally {
      setAdActionLoading(null);
    }
  }, []);

  const handleReject = useCallback(
    async (adId: string) => {
      const target = pendingAds.find((a) => a.id === adId);
      const prompt =
        target?.status === "pending_review"
          ? "Reject this ad and issue a full refund to the advertiser?"
          : "Decline this ad request? The advertiser will be emailed; no payment has been taken.";
      if (!confirm(prompt)) return;
      setAdActionLoading(adId);
      try {
        const res = await fetch(`/api/advertising/ads/${adId}/reject`, { method: "POST" });
        if (res.ok) {
          setPendingAds((prev) => prev.filter((a) => a.id !== adId));
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.error || "Failed to decline ad");
        }
      } catch {
        alert("Network error — please try again");
      } finally {
        setAdActionLoading(null);
      }
    },
    [pendingAds],
  );

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    const res = await fetch("/api/advertising/stripe/onboard", { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok && data?.url) {
      window.location.href = data.url;
    } else {
      alert(data?.error ?? "Failed to start Stripe onboarding. Please try again.");
      setConnecting(false);
    }
  }

  const isFullyConnected = status?.hasAccount && status?.detailsSubmitted;

  function slotState(slot: SlotType): string {
    const row = slots.find((s) => s.slotType === slot.id);
    if (!row || !row.enabled) return "Disabled";
    return `$${(row.pricePerWeekCents / 100).toFixed(0)}/week`;
  }

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main id="main" className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-20">
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold tracking-tight">Advertising</h1>
            <p className="text-sm text-[color:var(--fg-muted)] mt-1">Sell ad space on your directory and earn revenue</p>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 mb-8">
            <p className="text-sm text-blue-900 leading-relaxed">
              <span className="font-semibold">Sell ad space on your directory.</span> Set your own prices.
              We take a 10% platform fee; you keep 90% — paid directly to your bank via Stripe.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-[color:var(--fg-muted)]">Loading advertising settings...</p>
            </div>
          ) : (
            <div>
              {/* Status chip: connected, in-progress, or not-yet. Non-blocking —
                  the slot config renders underneath either way. Creators can
                  set up their offer now and come back to connect payouts later;
                  the advertiser-facing /{slug}/advertise page stays 404 until
                  payouts are actually enabled, so no money flows before they're
                  ready. */}
              <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                {isFullyConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>
                      Bank account connected
                    </span>
                    {status?.payoutsEnabled && (
                      <span className="text-xs font-semibold bg-green-50 text-green-600 px-2.5 py-1 rounded-full border border-green-200">
                        Payouts enabled
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" className="shrink-0 mt-0.5" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900">
                        {status?.hasAccount ? "Finish your Stripe setup to start receiving payouts" : "Connect your bank to receive payouts"}
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        You can configure slots and prices now — your public ad page goes live once Stripe onboarding is complete.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting}
                      className="shrink-0 h-8 px-3 text-xs font-semibold bg-amber-900 text-amber-50 rounded-full hover:opacity-90 transition disabled:opacity-50"
                    >
                      {connecting ? "Redirecting..." : status?.hasAccount ? "Continue" : "Connect"}
                    </button>
                  </div>
                )}
              </div>

              {/* Pending review section */}
              {pendingAds.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold">Awaiting your approval</h2>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-bold">
                        {pendingAds.length}
                      </span>
                    </div>
                    <Link
                      href="/dashboard/advertising/inbox"
                      className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition underline"
                    >
                      View all ads
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {pendingAds.map((ad) => {
                      const isBusy = adActionLoading === ad.id;
                      const isImg = ad.assetUrl && /\.(jpe?g|png|webp)$/i.test(ad.assetUrl);
                      return (
                        <div
                          key={ad.id}
                          className="bg-white border border-amber-200 rounded-xl p-4 flex gap-4 items-start"
                        >
                          {isImg && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.assetUrl!}
                              alt={ad.headline ?? "creative"}
                              className="w-20 h-14 object-cover rounded-lg shrink-0 border border-[color:var(--border)]"
                            />
                          )}
                          {!isImg && ad.assetUrl && (
                            <div className="w-20 h-14 bg-[#f7f5f3] rounded-lg shrink-0 flex items-center justify-center border border-[color:var(--border)]">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" aria-hidden>
                                <rect x="2" y="3" width="20" height="14" rx="2" />
                                <path d="M8 21h8M12 17v4" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{ad.headline ?? "(no headline)"}</p>
                            <p className="text-xs text-[color:var(--fg-muted)] truncate">{ad.advertiserName || ad.advertiserEmail}</p>
                            <p className="text-xs font-medium mt-0.5">{ad.slotType.replace(/_/g, " ")} · £{(ad.amountCents / 100).toFixed(2)}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleApprove(ad.id)}
                              disabled={isBusy}
                              className="h-7 px-3 bg-green-600 text-white text-xs font-semibold rounded-full hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1"
                            >
                              {isBusy ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : "Approve"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(ad.id)}
                              disabled={isBusy}
                              className="h-7 px-3 border border-red-300 text-red-600 text-xs font-semibold rounded-full hover:bg-red-50 transition disabled:opacity-50 flex items-center gap-1"
                            >
                              {ad.status === "pending_review" ? "Reject" : "Decline"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Earnings widget */}
              {earnings && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                  {[
                    { label: "Total earnings", value: fmtMoney(earnings.totalEarningsCents), sub: "all time" },
                    { label: "Active ads", value: String(earnings.activeAdsCount), sub: "right now" },
                    { label: "Impressions", value: fmtNum(earnings.impressions30d), sub: "last 30 days" },
                    { label: "Clicks", value: fmtNum(earnings.clicks30d), sub: "last 30 days" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white border border-[color:var(--border)] rounded-xl p-4">
                      <p className="text-xs text-[color:var(--fg-muted)] mb-1">{stat.label}</p>
                      <p className="text-2xl font-extrabold tracking-tight">{stat.value}</p>
                      <p className="text-xs text-[color:var(--fg-subtle)] mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
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
                    className="h-10 px-3 rounded-lg border border-[color:var(--border)] bg-white text-sm"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName ?? s.slug}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-bold">Ad slot types</h2>
                <p className="text-sm text-[color:var(--fg-muted)] mt-1">
                  Configure pricing and enable each slot. Advertisers can only purchase enabled slots.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SLOT_TYPES.map((slot) => {
                  const state = slotState(slot);
                  const isLive = slot.status === "live";
                  const isEnabled = slots.find((s) => s.slotType === slot.id)?.enabled ?? false;

                  return (
                    <div
                      key={slot.id}
                      className={`bg-white border rounded-xl p-4 flex items-start gap-3 border-[color:var(--border)] ${!isLive ? "opacity-70" : ""}`}
                    >
                      <div
                        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ background: isLive ? "#f0f0ff" : "#f5f5f5" }}
                      >
                        <SlotIcon iconName={slot.iconName} accentColor={isLive ? "#6366f1" : "#9ca3af"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{slot.name}</p>
                          {isEnabled && (
                            <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                          {!isLive && (
                            <span className="text-[10px] font-medium bg-black/5 text-[color:var(--fg-subtle)] px-1.5 py-0.5 rounded-full">
                              Phase 5
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[color:var(--fg-muted)] mt-0.5 line-clamp-1">{slot.tagline}</p>
                        <p className="text-xs font-medium mt-1.5" style={{ color: isEnabled ? "#16a34a" : "#9ca3af" }}>
                          {state}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/advertising/${slot.id}`}
                        className="shrink-0 text-xs font-semibold h-7 px-3 rounded-full border border-[color:var(--border)] hover:bg-black/5 transition inline-flex items-center"
                      >
                        Configure
                      </Link>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-[color:var(--fg-subtle)] mt-4 text-center">
                Phase 5 slots can be configured now — they activate when their renderers ship.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
