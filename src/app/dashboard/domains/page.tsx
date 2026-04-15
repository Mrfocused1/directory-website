"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import FeatureGate from "@/components/plans/FeatureGate";

type DomainResult = {
  domain: string;
  tld: string;
  available: boolean;
  price: number;
  renewal: number;
  priceFormatted: string;
  renewalFormatted: string;
};

type ConnectedDomain = {
  id: string;
  domain: string;
  type: "purchased" | "external";
  status: "pending" | "verifying" | "active" | "failed";
  dnsVerified: boolean;
  sslProvisioned: boolean;
  misconfigured?: boolean;
};

type Flow = null | "buy" | "connect";

const POPULAR_TLD_SUGGESTIONS = [
  ".com", ".co", ".io", ".directory", ".me", ".xyz", ".app", ".dev",
  ".store", ".online", ".tech", ".site", ".shop", ".org", ".net",
];

export default function DomainsPage() {
  return (
    <Suspense fallback={null}>
      <DomainsPageContent />
    </Suspense>
  );
}

function DomainsPageContent() {
  const searchParams = useSearchParams();
  const [domains, setDomains] = useState<ConnectedDomain[]>([]);
  const [flow, setFlow] = useState<Flow>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  // Handle return from Stripe checkout
  useEffect(() => {
    const purchased = searchParams.get("purchased");
    if (purchased) {
      setPurchaseSuccess(purchased);
      setDomains((prev) => [
        ...prev,
        {
          id: `dom-${Date.now()}`,
          domain: purchased,
          type: "purchased",
          status: "active",
          dnsVerified: true,
          sslProvisioned: true,
        },
      ]);
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/domains");
    }
  }, [searchParams]);

  const { selectedSite } = useSiteContext();
  const siteId = selectedSite?.id;

  // Buy flow
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DomainResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [purchasingDomain, setPurchasingDomain] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customTld, setCustomTld] = useState("");
  const [showAllTlds, setShowAllTlds] = useState(false);

  // Connect flow
  const [connectDomain, setConnectDomain] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingDns, setPendingDns] = useState<{
    domain: string;
    records: { type: string; name: string; value: string; purpose: string }[];
  } | null>(null);

  // Verification
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent, extraTlds?: string[]) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      let url = `/api/domains?action=search&q=${encodeURIComponent(searchQuery)}`;
      if (extraTlds?.length) {
        url += `&tlds=${extraTlds.map((t) => t.replace(/^\./, "")).join(",")}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Search failed");
        return;
      }
      setSearchResults(data.results || []);
    } catch {
      setSearchError("Network error. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchCustomTld = async (tldOverride?: string) => {
    const tldToUse = tldOverride || customTld;
    if (!tldToUse.trim() || !searchQuery.trim()) return;
    const tld = tldToUse.replace(/^\./, "").toLowerCase();
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/domains?action=search&q=${encodeURIComponent(searchQuery)}&tlds=${tld}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Search failed");
        return;
      }
      // Merge with existing results (avoid duplicates)
      setSearchResults((prev) => {
        const existingDomains = new Set(prev.map((r) => r.domain));
        const newResults = (data.results || []).filter(
          (r: DomainResult) => !existingDomains.has(r.domain),
        );
        return [...prev, ...newResults].sort((a, b) => {
          if (a.available !== b.available) return a.available ? -1 : 1;
          return a.price - b.price;
        });
      });
      setCustomTld("");
    } catch {
      setSearchError("Network error. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePurchase = async (result: DomainResult) => {
    if (!siteId) {
      alert("Please select a site first.");
      return;
    }
    setPurchasingDomain(result.domain);
    try {
      const res = await fetch("/api/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: result.domain,
          siteId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const data = await res.json().catch(() => ({ error: "Failed to start checkout." }));
        setSearchError(data.error || "Failed to start checkout. Please try again.");
      }
    } catch {
      setSearchError("Network error. Please check your connection and try again.");
    } finally {
      setPurchasingDomain(null);
    }
  };

  const validateDomain = (domain: string): boolean => {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(domain);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectDomain.trim()) return;
    if (!validateDomain(connectDomain.trim())) {
      setSearchError("Please enter a valid domain name (e.g. yourdomain.com)");
      return;
    }
    if (!siteId) {
      setSearchError("Please select a site first.");
      return;
    }
    setIsConnecting(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, domain: connectDomain, action: "connect" }),
      });
      if (res.ok) {
        const data = await res.json();
        setDomains((prev) => [...prev, data.domain]);
        setPendingDns({ domain: data.domain.domain, records: data.dnsRecords });
        setConnectDomain("");
      } else {
        setSearchError("Failed to connect domain. Please try again.");
      }
    } catch {
      setSearchError("Network error. Please check your connection.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleVerify = async (domain: string) => {
    setVerifyingDomain(domain);
    try {
      const res = await fetch(`/api/domains?action=status&domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      setDomains((prev) =>
        prev.map((d) =>
          d.domain === domain
            ? {
                ...d,
                status: data.dnsVerified && data.sslProvisioned ? "active" : "pending",
                dnsVerified: !!data.dnsVerified,
                sslProvisioned: !!data.sslProvisioned,
                misconfigured: !!data.misconfigured,
              }
            : d,
        ),
      );
      if (data.dnsVerified && data.sslProvisioned) setPendingDns(null);
    } finally {
      setVerifyingDomain(null);
    }
  };

  const handleRemove = async (domainId: string) => {
    const domainToRemove = domains.find((d) => d.id === domainId);
    setDomains((prev) => {
      const filtered = prev.filter((d) => d.id !== domainId);
      if (filtered.length === 0) setPendingDns(null);
      return filtered;
    });
    await fetch("/api/domains", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId, domain: domainToRemove?.domain }),
    });
  };

  const activeDomain = domains.find((d) => d.status === "active");

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        <DashboardNav />

        <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-20">
          <FeatureGate feature="custom_domain">
          {/* Hero header */}
          <div className="text-center mb-8 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-black to-gray-700 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Your Domain</h1>
            <p className="text-sm text-[color:var(--fg-muted)] max-w-md mx-auto">
              Make your directory truly yours with a custom domain. We handle all the technical stuff.
            </p>
          </div>

          {/* Purchase success banner */}
          {purchaseSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-6 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-green-800">Domain purchased!</h3>
                  <p className="text-xs text-green-700 mt-0.5">
                    <strong>{purchaseSuccess}</strong> is being configured. It will be live within a few minutes.
                  </p>
                </div>
                <button type="button" onClick={() => setPurchaseSuccess(null)} className="ml-auto text-green-600 hover:text-green-800 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Current URL card */}
          <div className="bg-white border border-[color:var(--border)] rounded-2xl p-5 mb-6 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 mb-0.5">Live now</p>
                <p className="text-sm font-mono font-bold">yourname.buildmy.directory</p>
              </div>
            </div>
            {activeDomain && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[color:var(--border)]">
                <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 mb-0.5">Custom domain</p>
                  <p className="text-sm font-mono font-bold">{activeDomain.domain}</p>
                </div>
              </div>
            )}
          </div>

          {/* Connected domains (pending) */}
          {domains.filter((d) => d.status === "pending").map((d) => (
            <div key={d.id} className="bg-white border border-yellow-200 rounded-2xl p-4 mb-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-mono font-bold">{d.domain}</p>
                    <p className="text-[11px] text-yellow-600 font-semibold">
                      {d.misconfigured
                        ? "DNS records look incorrect"
                        : d.dnsVerified && !d.sslProvisioned
                          ? "DNS verified — provisioning SSL"
                          : "Waiting for DNS verification"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleVerify(d.domain)}
                    disabled={verifyingDomain === d.domain}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-900 transition"
                  >
                    {verifyingDomain === d.domain ? "Checking..." : "Re-check"}
                  </button>
                  <button type="button" onClick={() => handleRemove(d.id)} className="text-xs text-[color:var(--fg-subtle)] hover:text-red-600 transition">Remove</button>
                </div>
              </div>
              {/* Detailed status indicators */}
              <div className="mt-3 pt-3 border-t border-yellow-100 grid grid-cols-2 gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      d.dnsVerified ? "bg-green-500" : "bg-yellow-400"
                    }`}
                  />
                  <span className="font-semibold">DNS:</span>
                  <span className={d.dnsVerified ? "text-green-700" : "text-yellow-700"}>
                    {d.dnsVerified ? "Verified" : "Propagating..."}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      d.sslProvisioned ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <span className="font-semibold">SSL:</span>
                  <span className={d.sslProvisioned ? "text-green-700" : "text-[color:var(--fg-subtle)]"}>
                    {d.sslProvisioned ? "Provisioned" : "Pending DNS"}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* DNS Instructions */}
          <AnimatePresence>
            {pendingDns && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-6"
              >
                <div className="bg-gradient-to-b from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-bold">Almost there! Add these DNS records</h3>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Go to your domain registrar for <strong>{pendingDns.domain}</strong> and add these 3 records. Usually takes 5-30 minutes to verify.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pendingDns.records.map((rec, i) => (
                      <div key={i} className="bg-white rounded-xl p-3.5 border border-amber-200/60 shadow-sm">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{rec.type}</span>
                            <span className="text-xs text-[color:var(--fg-subtle)]">{rec.purpose}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(rec.value)}
                            className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 transition"
                          >
                            Copy
                          </button>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <div>
                            <span className="text-[10px] text-[color:var(--fg-subtle)]">Name</span>
                            <p className="font-mono font-bold">{rec.name}</p>
                          </div>
                          <div className="text-[color:var(--fg-subtle)]">&rarr;</div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] text-[color:var(--fg-subtle)]">Value</span>
                            <p className="font-mono font-bold truncate">{rec.value}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleVerify(pendingDns.domain)}
                    disabled={verifyingDomain === pendingDns.domain}
                    className="mt-4 w-full h-11 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    {verifyingDomain === pendingDns.domain ? "Checking..." : "Check Verification Status"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Option picker (when no flow selected) */}
          {!flow && (
            <div className="space-y-3 animate-fade-in">
              {/* Buy option */}
              <button
                type="button"
                onClick={() => setFlow("buy")}
                className="w-full bg-white border-2 border-[color:var(--border)] hover:border-[color:var(--fg)] rounded-2xl p-5 sm:p-6 text-left transition-all hover:shadow-lg hover:shadow-black/5 group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold mb-1">Buy a new domain</h3>
                    <p className="text-sm text-[color:var(--fg-muted)] leading-relaxed">
                      Search and register a fresh domain. We handle everything &mdash; registration, DNS, SSL. Your directory is live instantly.
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[11px] font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">500+ TLDs</span>
                      <span className="text-[11px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Zero setup</span>
                      <span className="text-[11px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Instant</span>
                    </div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--fg-subtle)] group-hover:text-[color:var(--fg)] shrink-0 mt-1 transition-colors">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>

              {/* Connect option */}
              <button
                type="button"
                onClick={() => setFlow("connect")}
                className="w-full bg-white border-2 border-[color:var(--border)] hover:border-[color:var(--fg)] rounded-2xl p-5 sm:p-6 text-left transition-all hover:shadow-lg hover:shadow-black/5 group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold mb-1">I already have a domain</h3>
                    <p className="text-sm text-[color:var(--fg-muted)] leading-relaxed">
                      Connect a domain you own. We&apos;ll guide you through adding 3 simple DNS records &mdash; takes about 5 minutes.
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[11px] font-semibold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">Free</span>
                      <span className="text-[11px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">3 DNS records</span>
                      <span className="text-[11px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">~5 min</span>
                    </div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--fg-subtle)] group-hover:text-[color:var(--fg)] shrink-0 mt-1 transition-colors">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            </div>
          )}

          {/* Buy flow */}
          {flow === "buy" && (
            <div className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-5 sm:p-6 animate-fade-in">
              <button type="button" onClick={() => { setFlow(null); setSearchResults([]); setSearchQuery(""); setSearchError(null); }} className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] mb-4 flex items-center gap-1 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                Back to options
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
                </div>
                <div>
                  <h3 className="text-base font-bold">Find your perfect domain</h3>
                  <p className="text-xs text-[color:var(--fg-muted)]">Search 500+ extensions — we handle registration, DNS, and SSL</p>
                </div>
              </div>

              <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--fg-subtle)] text-sm">www.</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="yourname"
                    aria-label="Domain name search"
                    autoFocus
                    className="w-full h-12 pl-12 pr-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm font-mono font-bold placeholder:font-normal placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-purple-400 transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap shadow-md shadow-purple-200"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </form>

              {/* Error message */}
              {searchError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {searchError}
                </div>
              )}

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="space-y-2 mb-4">
                  {searchResults.map((r) => (
                    <div
                      key={r.domain}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition ${
                        r.available
                          ? "border-[color:var(--border)] hover:border-purple-300 hover:bg-purple-50/30"
                          : "border-dashed border-[color:var(--border)] opacity-40"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-mono font-bold">{r.domain}</span>
                        {r.available && <span className="ml-2 text-[10px] font-bold text-green-600">Available</span>}
                      </div>
                      {r.available ? (
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-extrabold">{r.priceFormatted}<span className="text-xs text-[color:var(--fg-muted)] font-normal">/yr</span></p>
                            <p className="text-[10px] text-[color:var(--fg-subtle)]">renews {r.renewalFormatted}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePurchase(r)}
                            disabled={purchasingDomain === r.domain}
                            className="h-10 px-5 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition shadow-sm"
                          >
                            {purchasingDomain === r.domain ? "Redirecting..." : "Get it"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[color:var(--fg-subtle)]">Taken</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Search more TLDs */}
              {searchResults.length > 0 && (
                <div className="border-t border-[color:var(--border)] pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAllTlds(!showAllTlds)}
                    className="text-xs font-semibold text-purple-600 hover:text-purple-800 transition flex items-center gap-1 mb-3"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${showAllTlds ? "rotate-90" : ""}`}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    Search a specific extension
                  </button>

                  {showAllTlds && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--fg-subtle)] text-xs">.</span>
                          <input
                            type="text"
                            value={customTld}
                            onChange={(e) => setCustomTld(e.target.value.toLowerCase().replace(/[^a-z]/g, ""))}
                            placeholder="photography"
                            aria-label="Custom TLD"
                            className="w-full h-10 pl-6 pr-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm font-mono placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-purple-400 transition"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSearchCustomTld()}
                          disabled={isSearching || !customTld.trim()}
                          className="h-10 px-4 bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold hover:bg-purple-200 disabled:opacity-50 transition"
                        >
                          Check
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {POPULAR_TLD_SUGGESTIONS
                          .filter((tld) => !searchResults.some((r) => r.tld === tld))
                          .slice(0, 10)
                          .map((tld) => (
                            <button
                              key={tld}
                              type="button"
                              disabled={isSearching}
                              onClick={() => {
                                handleSearchCustomTld(tld);
                              }}
                              className="text-[11px] font-mono font-semibold px-2.5 py-1 bg-gray-100 hover:bg-purple-100 hover:text-purple-700 rounded-md transition disabled:opacity-50"
                            >
                              {tld}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {searchResults.length === 0 && !isSearching && !searchError && (
                <div className="text-center py-6 text-sm text-[color:var(--fg-subtle)]">
                  Type a name above and hit search to see available domains
                </div>
              )}
            </div>
          )}

          {/* Connect flow */}
          {flow === "connect" && (
            <div className="bg-white border-2 border-[color:var(--border)] rounded-2xl p-5 sm:p-6 animate-fade-in">
              <button type="button" onClick={() => { setFlow(null); setConnectDomain(""); }} className="text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] mb-4 flex items-center gap-1 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                Back to options
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </div>
                <div>
                  <h3 className="text-base font-bold">Connect your domain</h3>
                  <p className="text-xs text-[color:var(--fg-muted)]">Just 3 DNS records and you&apos;re all set</p>
                </div>
              </div>

              <form onSubmit={handleConnect} className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={connectDomain}
                  onChange={(e) => setConnectDomain(e.target.value.toLowerCase())}
                  placeholder="yourdomain.com"
                  aria-label="Your domain name"
                  required
                  autoFocus
                  className="flex-1 h-12 px-4 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm font-mono font-bold placeholder:font-normal placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-blue-400 transition"
                />
                <button
                  type="submit"
                  disabled={isConnecting || !connectDomain.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap shadow-md shadow-blue-200"
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </button>
              </form>

              {/* Friendly steps */}
              <div className="space-y-4">
                {[
                  { num: "1", title: "Enter your domain above", desc: "We generate a unique verification code for you.", color: "bg-blue-600" },
                  { num: "2", title: "Add 3 DNS records at your registrar", desc: "GoDaddy, Namecheap, Cloudflare — we show you exactly what to paste.", color: "bg-blue-500" },
                  { num: "3", title: "We verify and go live", desc: "SSL certificate is auto-provisioned. Your directory is live on your domain within minutes.", color: "bg-blue-400" },
                ].map((step) => (
                  <div key={step.num} className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full ${step.color} text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5`}>
                      {step.num}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="text-xs text-[color:var(--fg-muted)] mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </FeatureGate>
        </main>
      </div>
    </div>
  );
}
