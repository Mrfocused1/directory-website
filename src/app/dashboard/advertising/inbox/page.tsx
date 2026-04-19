"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";

type AdRow = {
  id: string;
  slotType: string;
  advertiserEmail: string;
  advertiserName: string | null;
  advertiserWebsite: string | null;
  amountCents: number;
  creatorAmountCents: number;
  status: string;
  assetUrl: string | null;
  clickUrl: string | null;
  headline: string | null;
  body: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

type Site = { id: string; slug: string; displayName: string | null };

function formatGBP(cents: number) {
  return `£${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_approval: "bg-amber-100 text-amber-700",
    pending_payment: "bg-purple-100 text-purple-700",
    pending_review: "bg-amber-100 text-amber-700",
    active: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    paused: "bg-blue-100 text-blue-700",
    expired: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    pending_approval: "Awaiting your approval",
    pending_payment: "Approved · awaiting payment",
    pending_review: "Pending review (legacy)",
    active: "Active",
    rejected: "Declined",
    paused: "Paused",
    expired: "Expired",
  };
  const cls = colors[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

type PendingCardProps = {
  ad: AdRow;
  siteSlug: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  actionLoading: string | null;
};

function AdCard({ ad, siteSlug, onApprove, onReject, actionLoading }: PendingCardProps) {
  const isBusy = actionLoading === ad.id;
  const isImage = ad.assetUrl && /\.(jpe?g|png|webp)$/i.test(ad.assetUrl);
  const isVideo = ad.assetUrl && /\.(mp4|webm)$/i.test(ad.assetUrl);
  const isAudio = ad.assetUrl && /\.(mp3|wav|m4a)$/i.test(ad.assetUrl);

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-2xl overflow-hidden">
      {/* Creative preview */}
      {ad.assetUrl && (
        <div className="aspect-video bg-[#f7f5f3] overflow-hidden relative">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.assetUrl}
              alt={ad.headline ?? "Ad creative"}
              className="w-full h-full object-contain"
            />
          )}
          {isVideo && (
            <video
              src={ad.assetUrl}
              controls
              className="w-full h-full object-contain"
            />
          )}
          {isAudio && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#56505e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <audio src={ad.assetUrl} controls className="w-4/5" />
            </div>
          )}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={ad.status} />
              <span className="text-xs text-[color:var(--fg-muted)]">{ad.slotType.replace(/_/g, " ")}</span>
            </div>
            <p className="text-base font-bold mt-1">{ad.headline ?? "(no headline)"}</p>
            {ad.body && <p className="text-sm text-[color:var(--fg-muted)] mt-0.5">{ad.body}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-extrabold">{formatGBP(ad.amountCents)}</p>
            <p className="text-xs text-green-600">{formatGBP(ad.creatorAmountCents)} to you</p>
          </div>
        </div>

        <div className="text-xs text-[color:var(--fg-muted)] space-y-0.5 mb-4">
          <p><span className="font-semibold">Advertiser:</span> {ad.advertiserName || ad.advertiserEmail}</p>
          <p><span className="font-semibold">Email:</span> {ad.advertiserEmail}</p>
          {ad.advertiserWebsite && (
            <p>
              <span className="font-semibold">Website:</span>{" "}
              <a href={ad.advertiserWebsite} target="_blank" rel="noopener noreferrer" className="underline">
                {ad.advertiserWebsite}
              </a>
            </p>
          )}
          {ad.clickUrl && (
            <p>
              <span className="font-semibold">Click URL:</span>{" "}
              <a href={ad.clickUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {ad.clickUrl}
              </a>
            </p>
          )}
        </div>

        {ad.status === "pending_approval" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onApprove(ad.id)}
              disabled={isBusy}
              className="flex-1 h-9 bg-green-600 text-white text-sm font-semibold rounded-full hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isBusy ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : "Approve & send pay link"}
            </button>
            <button
              type="button"
              onClick={() => onReject(ad.id)}
              disabled={isBusy}
              className="flex-1 h-9 border border-red-300 text-red-600 text-sm font-semibold rounded-full hover:bg-red-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isBusy ? (
                <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
              ) : "Decline"}
            </button>
          </div>
        )}

        {ad.status === "pending_payment" && (
          <p className="text-xs text-[color:var(--fg-muted)] bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
            Approved — waiting for the advertiser to pay via the Stripe link emailed to them. The ad goes live automatically once payment clears.
          </p>
        )}

        {ad.status === "pending_review" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onApprove(ad.id)}
              disabled={isBusy}
              className="flex-1 h-9 bg-green-600 text-white text-sm font-semibold rounded-full hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isBusy ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => onReject(ad.id)}
              disabled={isBusy}
              className="flex-1 h-9 border border-red-300 text-red-600 text-sm font-semibold rounded-full hover:bg-red-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isBusy ? (
                <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
              ) : "Reject & Refund"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdInboxPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("pending_approval");

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data) => {
        const list: Site[] = (data.sites ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          slug: s.slug as string,
          displayName: s.displayName as string | null,
        }));
        setSites(list);
        if (list.length > 0) setSelectedSiteId(list[0].id);
      })
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    if (!selectedSiteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/advertising/ads?siteId=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data) => {
        setAds(data.ads ?? []);
        setLoading(false);
      })
      .catch(() => {
        setAds([]);
        setLoading(false);
      });
  }, [selectedSiteId]);

  async function handleApprove(adId: string) {
    setActionLoading(adId);
    try {
      const res = await fetch(`/api/advertising/ads/${adId}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const nextStatus: string = data.status || "active";
        setAds((prev) => prev.map((a) => (a.id === adId ? { ...a, status: nextStatus } : a)));
      } else {
        alert(data.error || "Failed to approve ad");
      }
    } catch {
      alert("Network error — please try again");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(adId: string) {
    const target = ads.find((a) => a.id === adId);
    const prompt =
      target && target.status === "pending_review"
        ? "Reject this ad and issue a full refund to the advertiser?"
        : "Decline this ad request? The advertiser will be emailed; no payment has been taken.";
    if (!confirm(prompt)) return;
    setActionLoading(adId);
    try {
      const res = await fetch(`/api/advertising/ads/${adId}/reject`, { method: "POST" });
      if (res.ok) {
        setAds((prev) => prev.map((a) => (a.id === adId ? { ...a, status: "rejected" } : a)));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to decline ad");
      }
    } catch {
      alert("Network error — please try again");
    } finally {
      setActionLoading(null);
    }
  }

  const currentSite = sites.find((s) => s.id === selectedSiteId);
  const filteredAds = filterStatus === "all" ? ads : ads.filter((a) => a.status === filterStatus);

  const STATUS_TABS = [
    { value: "pending_approval", label: "Requests", count: ads.filter((a) => a.status === "pending_approval").length },
    { value: "pending_payment", label: "Awaiting payment", count: ads.filter((a) => a.status === "pending_payment").length },
    { value: "active", label: "Active", count: ads.filter((a) => a.status === "active").length },
    { value: "rejected", label: "Declined", count: ads.filter((a) => a.status === "rejected").length },
    { value: "expired", label: "Expired", count: ads.filter((a) => a.status === "expired").length },
    { value: "all", label: "All", count: ads.length },
  ];

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main id="main" className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-20">
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <Link
              href="/dashboard/advertising"
              className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
            >
              &larr; Advertising
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight">Ad inbox</h1>
          </div>

          {/* Site selector */}
          {sites.length > 1 && (
            <div className="mb-6">
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

          {/* Status filter tabs */}
          <div className="flex gap-2 flex-wrap mb-6">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilterStatus(tab.value)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                  filterStatus === tab.value
                    ? "bg-[#1a0a2e] text-white border-[#1a0a2e]"
                    : "bg-white text-[color:var(--fg)] border-[color:var(--border)] hover:border-[#1a0a2e]"
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${filterStatus === tab.value ? "bg-white/20 text-white" : "bg-[#1a0a2e]/10 text-[#1a0a2e]"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="w-7 h-7 border-2 border-[color:var(--fg)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[color:var(--fg-muted)]">Loading ads...</p>
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="text-center py-16 text-[color:var(--fg-muted)]">
              <p className="font-semibold mb-1">No ads here</p>
              <p className="text-sm">
                {filterStatus === "pending_approval"
                  ? "No advertiser requests waiting for your approval."
                  : filterStatus === "pending_payment"
                    ? "No advertisers in the pay-to-go-live step."
                    : `No ${filterStatus.replace(/_/g, " ")} ads.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {filteredAds.map((ad) => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  siteSlug={currentSite?.slug ?? ""}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
